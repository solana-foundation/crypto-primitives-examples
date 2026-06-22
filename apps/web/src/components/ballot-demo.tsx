import { useEffect, useState } from 'react';
import { getCreateAccountInstruction } from '@solana-program/system';
import { Badge, Button } from '@solana/design-system';
import { verifyBatchedRangeProofU64 } from '@solana-program/zk-elgamal-proof';
import {
    AccountRole,
    type Address,
    generateKeyPairSigner,
    type Instruction,
    type KeyPairSigner,
    type Signature,
} from '@solana/kit';
import { BatchedRangeProofU64Data, ElGamalKeypair, PedersenCommitment, PedersenOpening } from '@solana/zk-sdk/bundler';

import { useDemoWalletFunding } from '@/components/demo-funding';
import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { ensureFunded, getDemoWallet, InsufficientDemoFundsError } from '@/lib/demo-wallet';
import {
    BALLOT_TALLY_ACCOUNT_SIZE,
    ballotTallyAddInstructionData,
    decryptSmallAmount,
    sumCiphertexts,
} from '@/lib/elgamal';
import { getClusterFromClusterId, getSolanaExplorerAddressUrl, getSolanaExplorerUrl } from '@/lib/explorer';
import { base64ToBytes, bytesToHex } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import { formatTransactionError } from '@/lib/transactionErrors';

type Vote = 'no' | 'stuffed' | 'yes';

interface Generated {
    ballotCiphertexts: Uint8Array[];
    proofChunks: Uint8Array[];
    stuffedCount: number;
    tallyCiphertext: string;
    tallySecret: Uint8Array;
    wouldBeTally: number | null;
    yesCount: number;
}

interface ProofCheck {
    computeUnits: bigint | null;
    ok: boolean;
    signature: string;
}

interface RunResult {
    checks: ProofCheck[];
    ok: boolean;
}

const VOTER_COUNT = 10;
const CHUNK_SIZE = 5;
const VOTE_CYCLE: Vote[] = ['yes', 'no', 'stuffed'];
const VOTE_AMOUNT: Record<Vote, bigint> = { no: 0n, stuffed: 2n, yes: 1n };

export function BallotDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();
    const { dialog: fundingDialog, requestFunding } = useDemoWalletFunding();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [votes, setVotes] = useState<Vote[]>(Array.from({ length: VOTER_COUNT }, () => 'yes'));
    const [generated, setGenerated] = useState<Generated | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tallyAccount, setTallyAccount] = useState<Address | null>(null);
    const [onChainTally, setOnChainTally] = useState<number | null>(null);
    const [tallying, setTallying] = useState(false);

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

    function resetTally() {
        setOnChainTally(null);
        setTallyAccount(null);
    }

    function cycleVote(index: number) {
        setVotes(prev => prev.map((v, i) => (i === index ? VOTE_CYCLE[(VOTE_CYCLE.indexOf(v) + 1) % 3] : v)));
        setGenerated(null);
        setResult(null);
        resetTally();
    }

    function castBallots() {
        setError(null);
        setResult(null);
        setGenerated(null);
        resetTally();
        try {
            const tallyKeypair = new ElGamalKeypair();
            const amounts = votes.map(v => VOTE_AMOUNT[v]);
            const openings = votes.map(() => new PedersenOpening());
            const ciphertexts = amounts.map((amount, i) => tallyKeypair.pubkey().encryptWith(amount, openings[i]));

            const proofChunks: Uint8Array[] = [];
            for (let start = 0; start < VOTER_COUNT; start += CHUNK_SIZE) {
                const slice = amounts.slice(start, start + CHUNK_SIZE);
                const sliceOpenings = openings.slice(start, start + CHUNK_SIZE);
                const sliceCiphertexts = ciphertexts.slice(start, start + CHUNK_SIZE);
                const padOpening = new PedersenOpening();
                const provable = slice.map(a => (a > 1n ? 0n : a));
                const commitments = provable.map((amount, i) =>
                    slice[i] > 1n
                        ? PedersenCommitment.from(amount, sliceOpenings[i])
                        : sliceCiphertexts[i].commitment(),
                );
                const proof = new BatchedRangeProofU64Data(
                    [...commitments, PedersenCommitment.from(0n, padOpening)],
                    BigUint64Array.from([...provable, 0n]),
                    Uint8Array.from([...slice.map(() => 1), 64 - CHUNK_SIZE]),
                    [...sliceOpenings, padOpening],
                );
                const proofBytes = new Uint8Array(proof.toBytes());
                slice.forEach((amount, i) => {
                    if (amount > 1n) proofBytes.set(sliceCiphertexts[i].commitment().toBytes(), i * 32);
                });
                proofChunks.push(proofBytes);
            }

            const tallyCiphertext = sumCiphertexts(ciphertexts.map(ct => ct.toBytes()));
            const wouldBeTally = decryptSmallAmount(tallyKeypair.secret().toBytes(), tallyCiphertext, VOTER_COUNT * 2);

            setGenerated({
                ballotCiphertexts: ciphertexts.map(ct => ct.toBytes()),
                proofChunks,
                stuffedCount: votes.filter(v => v === 'stuffed').length,
                tallyCiphertext: bytesToHex(tallyCiphertext),
                tallySecret: tallyKeypair.secret().toBytes(),
                wouldBeTally,
                yesCount: votes.filter(v => v === 'yes').length,
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Ballot generation failed');
        }
    }

    async function verifyOnChain() {
        if (!wallet || !generated) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            await ensureFunded(rpc, wallet, getClusterFromClusterId(clusterId) === 'localnet');
            const checks: ProofCheck[] = [];
            for (const proofData of generated.proofChunks) {
                const instructions = await verifyBatchedRangeProofU64({ payer: wallet, proofData, rpc });
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
                        maxSupportedTransactionVersion: 0,
                    })
                    .send();
                checks.push({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, ok, signature });
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

    async function tallyOnChain() {
        if (!wallet || !generated) return;
        setTallying(true);
        setError(null);
        resetTally();
        try {
            await ensureFunded(rpc, wallet, getClusterFromClusterId(clusterId) === 'localnet');
            const space = BigInt(BALLOT_TALLY_ACCOUNT_SIZE);
            const lamports = await rpc.getMinimumBalanceForRentExemption(space).send();
            const account = await generateKeyPairSigner();
            await signAndSend(
                [
                    getCreateAccountInstruction({
                        lamports,
                        newAccount: account,
                        payer: wallet,
                        programAddress: getProgramAddress(),
                        space,
                    }),
                ],
                wallet,
            );

            for (const ballot of generated.ballotCiphertexts) {
                const instruction: Instruction = {
                    accounts: [{ address: account.address, role: AccountRole.WRITABLE }],
                    data: ballotTallyAddInstructionData(ballot),
                    programAddress: getProgramAddress(),
                };
                await signAndSend([instruction], wallet);
            }

            const info = await rpc.getAccountInfo(account.address, { encoding: 'base64' }).send();
            const data = base64ToBytes(info.value!.data[0]);
            const tallyCiphertext = data.slice(2, 2 + 64);
            setTallyAccount(account.address);
            setOnChainTally(decryptSmallAmount(generated.tallySecret, tallyCiphertext, VOTER_COUNT * 2));
        } catch (caught) {
            if (caught instanceof InsufficientDemoFundsError) {
                requestFunding({ address: caught.address, onFunded: () => void tallyOnChain() });
                return;
            }
            setError(formatTransactionError(caught));
        } finally {
            setTallying(false);
        }
    }

    const cluster = getClusterFromClusterId(clusterId);

    const stage1: StageState = generated ? 'done' : 'active';
    const stage2: StageState = running
        ? 'active'
        : result
          ? result.ok
              ? 'pass'
              : 'fail'
          : generated
            ? 'done'
            : 'idle';
    const stage3: StageState = tallying ? 'active' : generated ? 'done' : 'idle';

    const proofPanel = result && generated && (
        <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
                {result.ok ? (
                    <>
                        <Badge variant="success">All ballots valid</Badge>
                        <span className="text-sand-1100">
                            would tally{' '}
                            <span className="font-medium text-foreground">
                                {generated.wouldBeTally ?? '?'} yes /{' '}
                                {generated.wouldBeTally != null ? VOTER_COUNT - generated.wouldBeTally : '?'} no
                            </span>{' '}
                            — and no individual ballot was ever opened
                        </span>
                    </>
                ) : (
                    <>
                        <Badge variant="danger">Ballot stuffing caught</Badge>
                        <span className="text-sand-1100">
                            the proof can't show a 2 fits in one bit — without it, the tally would have read{' '}
                            <span className="font-medium text-foreground">{generated.wouldBeTally ?? '?'}</span> yes
                            from {generated.yesCount + generated.stuffedCount} actual yes-voters
                        </span>
                    </>
                )}
            </div>
            <div className="space-y-1">
                {result.checks.map((check, i) => (
                    <div className="flex flex-wrap items-center gap-2 text-xs" key={i}>
                        <Badge variant={check.ok ? 'success' : 'danger'}>{check.ok ? 'passed' : 'rejected'}</Badge>
                        <span className="text-sand-1100">
                            proof {i + 1} — ballots {i * CHUNK_SIZE + 1}–{Math.min((i + 1) * CHUNK_SIZE, VOTER_COUNT)}
                        </span>
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

    const tallyPanel = onChainTally != null && (
        <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
                <Badge variant="success">On-chain tally</Badge>
                <span className="text-sand-1100">
                    summed on-chain while encrypted, then decrypted from the total only:{' '}
                    <span className="font-medium text-foreground">{onChainTally}</span>
                    {generated?.stuffedCount === 0 && ` yes / ${VOTER_COUNT - onChainTally} no`}
                </span>
                {tallyAccount && (
                    <Button asChild size="sm" variant="secondary">
                        <a
                            href={getSolanaExplorerAddressUrl(tallyAccount, cluster)}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            View account
                        </a>
                    </Button>
                )}
            </div>
            {generated && generated.stuffedCount > 0 && (
                <div className="text-destructive">
                    this total is inflated — the tally instruction sums ballots blindly, so {generated.stuffedCount}{' '}
                    stuffed ballot{generated.stuffedCount > 1 ? 's' : ''} added 2 each. Only the validity proof rejects
                    them.
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-5">
            <FlowDiagram>
                <div>
                    <h3 className="text-base font-semibold text-foreground">
                        Private ballot: secret votes, public tally
                    </h3>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            Each voter encrypts a 0 (no) or 1 (yes) in the browser — individual ballots are never
                            revealed, not even to count them.
                        </li>
                        <li>
                            Batched proofs show every ballot is a valid 0-or-1 on-chain ({VOTER_COUNT} voters span two
                            proofs, since one tops out at {CHUNK_SIZE + 3} commitments). A stuffed ballot (a sneaky 2,
                            worth two votes) can't be proven — the demo forges it and the chain catches it.
                        </li>
                        <li>
                            The encrypted ballots are added together on-chain while still encrypted; only the total is
                            ever decrypted.
                        </li>
                    </ol>
                </div>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <div className="text-xs font-medium text-sand-1100">
                                click a voter to cycle their ballot: yes → no → stuffed (counts as 2)
                            </div>
                            <div className="grid grid-cols-5 gap-1 rounded-lg border bg-background p-2">
                                {votes.map((vote, i) => (
                                    <button
                                        className={
                                            'rounded px-1.5 py-0.5 text-center font-berkeley-mono text-[10px] transition-colors ' +
                                            (vote === 'yes'
                                                ? 'bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]'
                                                : vote === 'no'
                                                  ? 'bg-sand-200 text-sand-1000'
                                                  : 'bg-destructive/10 text-destructive')
                                        }
                                        key={i}
                                        onClick={() => cycleVote(i)}
                                        type="button"
                                    >
                                        #{i + 1} {vote === 'yes' ? '✓ yes' : vote === 'no' ? '✗ no' : '‼ 2'}
                                    </button>
                                ))}
                            </div>
                            <Button onClick={castBallots} variant="secondary">
                                Cast encrypted ballots
                            </Button>
                            {generated && (
                                <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                                    <div className="text-sand-1100">
                                        {VOTER_COUNT} encrypted ballots · {generated.proofChunks.length} batched proofs
                                        cover all of them
                                    </div>
                                    <div>
                                        <span className="text-xs font-medium text-sand-1100">
                                            encrypted tally (sum of all ballots, still encrypted)
                                        </span>
                                        <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">
                                            {generated.tallyCiphertext}
                                        </p>
                                    </div>
                                    {generated.stuffedCount > 0 && (
                                        <div className="text-destructive">
                                            {generated.stuffedCount} stuffed ballot
                                            {generated.stuffedCount > 1 ? 's' : ''} in the mix — watch the proof fail
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    }
                    location="off-chain"
                    n={1}
                    state={stage1}
                    title="Encrypt in your browser"
                >
                    each ballot encrypted as 0 or 1 — the individual votes never leave your browser
                </Stage>

                <Connector>batched range proof: every ballot is a valid 0 or 1</Connector>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <Button
                                disabled={running || !wallet || !generated}
                                loading={running}
                                onClick={() => void verifyOnChain()}
                            >
                                Prove all ballots valid on-chain
                            </Button>
                            {proofPanel}
                        </div>
                    }
                    location="on-chain"
                    n={2}
                    state={stage2}
                    title="Prove valid on-chain"
                >
                    {result
                        ? result.ok
                            ? '✓ every ballot is a valid 0 or 1'
                            : "✗ a stuffed ballot can't be proven — rejected"
                        : "a stuffed ballot (a 2) can't be proven — the chain rejects it"}
                </Stage>

                <Connector>add the encrypted ballots together</Connector>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <Button
                                disabled={tallying || !wallet || !generated}
                                loading={tallying}
                                onClick={() => void tallyOnChain()}
                            >
                                Store &amp; tally on-chain
                            </Button>
                            {tallyPanel}
                        </div>
                    }
                    location="on-chain"
                    n={3}
                    state={stage3}
                    title="Tally on-chain"
                >
                    {onChainTally != null
                        ? '✓ summed on-chain, total decrypted — no individual ballot opened'
                        : 'the encrypted ballots are summed on-chain; only the total is ever decrypted'}
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
