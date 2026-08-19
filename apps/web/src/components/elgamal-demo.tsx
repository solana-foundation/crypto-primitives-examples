import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Badge, Button } from '@solana/design-system';
import {
    verifyBatchedRangeProofU64,
    verifyCiphertextCommitmentEquality,
    verifyZeroCiphertext,
} from '@solana-program/zk-elgamal-proof';
import type { Instruction, KeyPairSigner, Signature } from '@solana/kit';
import {
    BatchedRangeProofU64Data,
    CiphertextCommitmentEqualityProofData,
    ElGamalCiphertext,
    ElGamalKeypair,
    PedersenCommitment,
    PedersenOpening,
    ZeroCiphertextProofData,
} from '@solana/zk-sdk/bundler';

import { useDemoWalletFunding } from '@/components/demo-funding';
import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';
import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { ensureFunded, getDemoWallet, InsufficientDemoFundsError } from '@/lib/demo-wallet';
import { COMPARISON_SYMBOL, type ComparisonOp, shiftCiphertextForClaim, U64_MAX } from '@/lib/elgamal';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { bytesToHex } from '@/lib/hex';
import { formatTransactionError } from '@/lib/transactionErrors';

type ProofKind = 'equality' | 'range' | 'zero';

interface PreparedProof {
    bytes: Uint8Array;
    kind: ProofKind;
}

interface Generated {
    ciphertext: string;
    claimedAmount: string;
    encryptedAmount: string;
    honest: boolean;
    op: ComparisonOp;
    proofs: PreparedProof[];
}

interface ProofCheck {
    computeUnits: bigint | null;
    kind: ProofKind;
    ok: boolean;
    signature: string;
}

interface RunResult {
    checks: ProofCheck[];
    ok: boolean;
}

const CIPHERTEXT_OFFSET = 32;
const OP_CYCLE: ComparisonOp[] = ['eq', 'gt', 'lt'];

const PROOF_LABEL: Record<ProofKind, string> = {
    equality: 'equality proof — links your ciphertext to the range commitment',
    range: 'range proof — the difference fits in 64 bits (Bulletproof)',
    zero: 'zero-ciphertext proof — the remainder encrypts 0',
};

function ProofExplainer({ generated }: { generated: Generated }) {
    const value = BigInt(generated.encryptedAmount);
    const claimed = BigInt(generated.claimedAmount);

    let rule: string;
    let calculation: string;
    let difference: bigint;
    if (generated.op === 'eq') {
        rule = `hidden number − ${claimed} must be exactly 0`;
        difference = value - claimed;
        calculation = `${value} − ${claimed} = ${difference}`;
    } else if (generated.op === 'gt') {
        rule = `hidden number − ${claimed + 1n} must be 0 or more`;
        difference = value - claimed - 1n;
        calculation = `${value} − ${claimed + 1n} = ${difference}`;
    } else {
        rule = `${claimed - 1n} − hidden number must be 0 or more`;
        difference = claimed - 1n - value;
        calculation = `${claimed - 1n} − ${value} = ${difference}`;
    }

    return (
        <div className="space-y-1 rounded-lg border bg-card px-3 py-2 text-xs text-sand-1100">
            <div className="font-medium text-foreground">what the chain actually checked</div>
            <div>
                1. The chain can't compare hidden numbers — it can only test one thing: "is this hidden number valid?"
            </div>
            <div>
                2. So your claim "hidden {COMPARISON_SYMBOL[generated.op]} {generated.claimedAmount}" was rewritten as:{' '}
                <span className="font-berkeley-mono text-foreground">{rule}</span>
            </div>
            <div>
                3. Your hidden number is {generated.encryptedAmount}, so:{' '}
                <span className="font-berkeley-mono text-foreground">{calculation}</span>
                {generated.honest ? ' — a valid answer exists ✓' : ' — no valid answer exists'}
            </div>
            {generated.honest ? (
                <div>4. The proof shows exactly that, tied to your ciphertext — the chain verified it ✓</div>
            ) : (
                <>
                    <div>
                        4. Since {difference.toString()} can't pass, the proof shows a stand-in number instead — valid
                        on its own ✓
                    </div>
                    <div className="text-destructive">
                        5. But "does the stand-in match your ciphertext?" — no. That's the check that fails ✗
                    </div>
                </>
            )}
        </div>
    );
}

export function ElGamalDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();
    const { dialog: fundingDialog, requestFunding } = useDemoWalletFunding();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [amount, setAmount] = useState('0');
    const [claim, setClaim] = useState('0');
    const [op, setOp] = useState<ComparisonOp>('eq');
    const [generated, setGenerated] = useState<Generated | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

    function resetOutputs() {
        setGenerated(null);
        setResult(null);
    }

    function updateInput(setter: (value: string) => void, value: string) {
        setter(value);
        resetOutputs();
    }

    function cycleOp() {
        setOp(prev => OP_CYCLE[(OP_CYCLE.indexOf(prev) + 1) % OP_CYCLE.length]);
        resetOutputs();
    }

    function generate() {
        setError(null);
        resetOutputs();
        try {
            const value = BigInt(amount.trim());
            const claimed = BigInt(claim.trim());
            if (value < 0n || claimed < 0n) throw new Error('Amounts must be non-negative integers');
            if (value > U64_MAX || claimed > U64_MAX) throw new Error('Amounts must fit in 64 bits');

            const honest = op === 'eq' ? value === claimed : op === 'gt' ? value > claimed : value < claimed;
            const keypair = new ElGamalKeypair();
            const ciphertext = keypair.pubkey().encryptU64(value);
            const shifted = shiftCiphertextForClaim(ciphertext.toBytes(), claimed, op);

            const proofs: PreparedProof[] = [];
            if (op === 'eq') {
                let bytes: Uint8Array;
                if (honest) {
                    bytes = new ZeroCiphertextProofData(keypair, ElGamalCiphertext.fromBytes(shifted)!).toBytes();
                } else {
                    const zeroProof = new ZeroCiphertextProofData(keypair, keypair.pubkey().encryptU64(0n));
                    bytes = new Uint8Array(zeroProof.toBytes());
                    bytes.set(shifted, CIPHERTEXT_OFFSET);
                }
                proofs.push({ bytes, kind: 'zero' });
            } else {
                const diff = honest ? (op === 'gt' ? value - claimed - 1n : claimed - value - 1n) : 0n;
                const opening = new PedersenOpening();
                const commitment = PedersenCommitment.from(diff, opening);

                let equalityBytes: Uint8Array;
                if (honest) {
                    equalityBytes = new CiphertextCommitmentEqualityProofData(
                        keypair,
                        ElGamalCiphertext.fromBytes(shifted)!,
                        commitment,
                        opening,
                        diff,
                    ).toBytes();
                } else {
                    const fake = new CiphertextCommitmentEqualityProofData(
                        keypair,
                        keypair.pubkey().encryptU64(0n),
                        commitment,
                        opening,
                        0n,
                    );
                    equalityBytes = new Uint8Array(fake.toBytes());
                    equalityBytes.set(shifted, CIPHERTEXT_OFFSET);
                }
                proofs.push({ bytes: equalityBytes, kind: 'equality' });

                const rangeBytes = new BatchedRangeProofU64Data(
                    [commitment],
                    BigUint64Array.from([diff]),
                    Uint8Array.from([64]),
                    [opening],
                ).toBytes();
                proofs.push({ bytes: rangeBytes, kind: 'range' });
            }

            setGenerated({
                ciphertext: bytesToHex(ciphertext.toBytes()),
                claimedAmount: claimed.toString(),
                encryptedAmount: value.toString(),
                honest,
                op,
                proofs,
            });
        } catch (caught) {
            setError(caught instanceof Error && caught.message ? caught.message : 'Enter valid integer amounts');
        }
    }

    async function buildInstructions(proof: PreparedProof): Promise<Instruction[]> {
        if (!wallet) throw new Error('Demo wallet not ready');
        const args = { payer: wallet, proofData: proof.bytes, rpc };
        if (proof.kind === 'zero') return verifyZeroCiphertext(args);
        if (proof.kind === 'equality') return verifyCiphertextCommitmentEquality(args);
        return verifyBatchedRangeProofU64(args);
    }

    async function verifyOnChain() {
        if (!wallet || !generated) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            await ensureFunded(rpc, wallet, getClusterFromClusterId(clusterId) === 'localnet');
            const checks: ProofCheck[] = [];
            for (const proof of generated.proofs) {
                const instructions = await buildInstructions(proof);
                let signature: string;
                let ok = true;
                try {
                    signature = await signAndSend(instructions, wallet, { skipPreflight: true });
                } catch (caught) {
                    if (!(caught instanceof OnChainTransactionError)) throw caught;
                    signature = caught.signature;
                    ok = false;
                }
                const tx = await rpc
                    .getTransaction(signature as Signature, {
                        commitment: 'confirmed',
                        encoding: 'json',
                        maxSupportedTransactionVersion: 1,
                    })
                    .send();
                checks.push({
                    computeUnits: tx?.meta?.computeUnitsConsumed ?? null,
                    kind: proof.kind,
                    ok,
                    signature,
                });
            }
            setResult({ checks, ok: checks.every(check => check.ok) });
        } catch (caught) {
            if (caught instanceof InsufficientDemoFundsError) {
                requestFunding({ address: caught.address, onFunded: () => void verifyOnChain() });
                return;
            }
            setError(formatTransactionError(caught));
        } finally {
            setRunning(false);
        }
    }

    const cluster = getClusterFromClusterId(clusterId);
    const symbol = COMPARISON_SYMBOL[op];

    const stage1: StageState = generated ? 'done' : 'active';
    const stage2: StageState = running ? 'active' : result ? 'done' : generated ? 'active' : 'idle';
    const stage3: StageState = result ? (result.ok ? 'pass' : 'fail') : 'idle';

    const resultPanel = result && generated && (
        <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
                {result.ok ? (
                    <>
                        <Badge variant="success">Verified on-chain</Badge>
                        <span className="text-sand-1100">
                            the chain confirmed the encrypted value is{' '}
                            <span className="font-berkeley-mono">
                                {COMPARISON_SYMBOL[generated.op]} {generated.claimedAmount}
                            </span>{' '}
                            — without ever seeing it
                        </span>
                    </>
                ) : (
                    <>
                        <Badge variant="danger">Rejected on-chain</Badge>
                        <span className="text-sand-1100">the claim is false — here's how the chain saw it</span>
                    </>
                )}
            </div>
            <ProofExplainer generated={generated} />
            <div className="space-y-1">
                {result.checks.map(check => (
                    <div className="flex flex-wrap items-center gap-2 text-xs" key={check.kind}>
                        <Badge variant={check.ok ? 'success' : 'danger'}>{check.ok ? 'passed' : 'rejected'}</Badge>
                        <span className="text-sand-1100">{PROOF_LABEL[check.kind]}</span>
                        {check.computeUnits != null && (
                            <span className="text-sand-1100">
                                ·{' '}
                                <span className="font-medium text-foreground">
                                    {check.computeUnits.toLocaleString()}
                                </span>{' '}
                                CU
                            </span>
                        )}
                        <a
                            className="text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                            href={getSolanaExplorerUrl(check.signature, cluster)}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            view tx
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-5">
            <FlowDiagram>
                <div>
                    <h3 className="text-base font-semibold text-foreground">
                        Encrypted-amount proof: prove how a hidden number compares
                    </h3>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            Pick a number and encrypt it in your browser (WebAssembly, <code>@solana/zk-sdk</code>) —
                            the ciphertext is all the chain ever sees.
                        </li>
                        <li>
                            Claim how it compares to a public number. <code>==</code> takes one zero-ciphertext proof;{' '}
                            <code>&gt;</code> and <code>&lt;</code> take a Bulletproof range proof plus an equality
                            proof that ties it to your ciphertext. A false claim can't be proven — the SDK refuses — so
                            the demo forges the link and lets the chain catch it.
                        </li>
                        <li>
                            The native program verifies each proof on-chain — a true claim passes, a false one is
                            rejected, and the number itself never leaves your browser.
                        </li>
                    </ol>
                </div>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-end gap-2">
                                <label className="block">
                                    <span className="text-xs font-medium text-foreground">Number to encrypt</span>
                                    <span className="relative mt-1 block w-40">
                                        <Lock className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-sand-1100" />
                                        <input
                                            className="block h-9 w-40 rounded-lg border border-foreground/30 bg-sand-100 pr-2 pl-7 font-berkeley-mono text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                            inputMode="numeric"
                                            onChange={e => updateInput(setAmount, e.target.value)}
                                            value={amount}
                                        />
                                    </span>
                                </label>
                                <button
                                    aria-label="Cycle comparison operator"
                                    className="h-9 w-12 rounded-lg border border-input bg-background font-berkeley-mono text-sm text-foreground transition-colors hover:bg-sand-100"
                                    onClick={cycleOp}
                                    type="button"
                                >
                                    {symbol}
                                </button>
                                <label className="block">
                                    <span className="text-xs font-medium text-sand-1100">Claimed number</span>
                                    <input
                                        className="mt-1 block h-9 w-40 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                        inputMode="numeric"
                                        onChange={e => updateInput(setClaim, e.target.value)}
                                        value={claim}
                                    />
                                </label>
                                {!generated && <Button onClick={generate}>Encrypt &amp; generate proof</Button>}
                            </div>
                            {generated && (
                                <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                                    <div>
                                        <span className="text-xs font-medium text-sand-1100">
                                            ciphertext (64 bytes)
                                        </span>
                                        <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">
                                            {generated.ciphertext}
                                        </p>
                                    </div>
                                    <div className="text-sand-1100">
                                        proof claims this encrypts a value{' '}
                                        <span className="font-berkeley-mono font-medium text-foreground">
                                            {COMPARISON_SYMBOL[generated.op]} {generated.claimedAmount}
                                        </span>
                                        {!generated.honest && (
                                            <span className="text-destructive">
                                                {' '}
                                                — this claim is false. Press Verify on-chain to watch the chain reject
                                                it.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    }
                    location="off-chain"
                    n={1}
                    state={stage1}
                    title="Encrypt in your browser"
                >
                    your number, encrypted — the ciphertext is all the chain sees
                </Stage>

                <Connector>build a zero-knowledge proof about it</Connector>

                <Stage
                    actions={
                        <Button
                            disabled={running || !wallet || !generated}
                            loading={running}
                            onClick={() => void verifyOnChain()}
                        >
                            Verify on-chain
                        </Button>
                    }
                    location="on-chain"
                    n={2}
                    state={stage2}
                    title="Send the proof"
                >
                    proof bytes → ZK ElGamal verifier program (nothing else is sent)
                </Stage>

                <Connector>the program checks the proof</Connector>

                <Stage
                    actions={resultPanel}
                    location="on-chain"
                    n={3}
                    state={stage3}
                    title="Verified — no state stored"
                >
                    {result
                        ? result.ok
                            ? '✓ the claim holds for the hidden number'
                            : '✗ the claim is false — rejected'
                        : 'the program verifies and writes no account state — your secret value never leaves the browser'}
                </Stage>
            </FlowDiagram>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Failed</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {fundingDialog}
        </div>
    );
}
