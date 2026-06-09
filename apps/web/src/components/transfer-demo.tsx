import { useEffect, useRef, useState } from 'react';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import { verifyBatchedRangeProofU64, verifyCiphertextCommitmentEquality } from '@solana-program/zk-elgamal-proof';
import type { Signature } from '@solana/kit';
import {
    BatchedRangeProofU64Data,
    CiphertextCommitmentEqualityProofData,
    ElGamalCiphertext,
    ElGamalKeypair,
    PedersenCommitment,
    PedersenOpening,
} from '@solana/zk-sdk/bundler';

import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { addAmountToCiphertext, subtractAmountFromCiphertext } from '@/lib/elgamal';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { bytesToHex } from '@/lib/hex';

interface Account {
    balance: number;
    ciphertext: Uint8Array;
}

interface ProofCheck {
    computeUnits: bigint | null;
    label: string;
    ok: boolean;
    signature: string;
}

interface TransferResult {
    amount: number;
    checks: ProofCheck[];
    ok: boolean;
}

const STARTING_BALANCE = 100n;

export function TransferDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();
    const { id: clusterId } = useClusterConfig();

    const alice = useRef<ElGamalKeypair | null>(null);
    const bob = useRef<ElGamalKeypair | null>(null);
    const aliceCt = useRef<Uint8Array | null>(null);
    const bobCt = useRef<Uint8Array | null>(null);

    const [aliceAccount, setAliceAccount] = useState<Account | null>(null);
    const [bobAccount, setBobAccount] = useState<Account | null>(null);
    const [amount, setAmount] = useState('30');
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<TransferResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function reset() {
        const aliceKp = new ElGamalKeypair();
        const bobKp = new ElGamalKeypair();
        const startCt = aliceKp.pubkey().encryptU64(STARTING_BALANCE).toBytes();
        const zeroCt = bobKp.pubkey().encryptU64(0n).toBytes();
        alice.current = aliceKp;
        bob.current = bobKp;
        aliceCt.current = startCt;
        bobCt.current = zeroCt;
        setAliceAccount({ balance: Number(STARTING_BALANCE), ciphertext: startCt });
        setBobAccount({ balance: 0, ciphertext: zeroCt });
        setResult(null);
        setError(null);
    }

    useEffect(() => {
        reset();
    }, []);

    async function transfer() {
        if (!signer || !alice.current || !bob.current || !aliceCt.current || !bobCt.current || !aliceAccount) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const send = BigInt(amount.trim());
            if (send <= 0n) throw new Error('Amount must be a positive integer');

            const honest = send <= BigInt(aliceAccount.balance);
            const newBalance = honest ? BigInt(aliceAccount.balance) - send : 0n;
            const newAliceCt = subtractAmountFromCiphertext(
                aliceCt.current,
                alice.current.pubkey().encryptU64(send).toBytes(),
            );

            const opening = new PedersenOpening();
            const commitment = PedersenCommitment.from(newBalance, opening);

            let equalityBytes: Uint8Array;
            if (honest) {
                equalityBytes = new CiphertextCommitmentEqualityProofData(
                    alice.current,
                    ElGamalCiphertext.fromBytes(newAliceCt)!,
                    commitment,
                    opening,
                    newBalance,
                ).toBytes();
            } else {
                const fake = new CiphertextCommitmentEqualityProofData(
                    alice.current,
                    alice.current.pubkey().encryptU64(0n),
                    commitment,
                    opening,
                    0n,
                );
                equalityBytes = new Uint8Array(fake.toBytes());
                equalityBytes.set(newAliceCt, 32);
            }
            const rangeBytes = new BatchedRangeProofU64Data(
                [commitment],
                BigUint64Array.from([newBalance]),
                Uint8Array.from([64]),
                [opening],
            ).toBytes();

            const proofs = [
                {
                    build: () => verifyCiphertextCommitmentEquality({ payer: signer, proofData: equalityBytes, rpc }),
                    label: "Alice's new balance matches her account",
                },
                {
                    build: () => verifyBatchedRangeProofU64({ payer: signer, proofData: rangeBytes, rpc }),
                    label: "Alice's new balance is 0 or more (can't overspend)",
                },
            ];

            const checks: ProofCheck[] = [];
            for (const proof of proofs) {
                const instructions = await proof.build();
                let signature: string;
                let ok = true;
                try {
                    signature = await signAndSend(instructions, signer, { skipPreflight: true });
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
                checks.push({
                    computeUnits: tx?.meta?.computeUnitsConsumed ?? null,
                    label: proof.label,
                    ok,
                    signature,
                });
            }

            const ok = checks.every(check => check.ok);
            if (ok) {
                const newBobCt = addAmountToCiphertext(bobCt.current, bob.current.pubkey().encryptU64(send).toBytes());
                aliceCt.current = newAliceCt;
                bobCt.current = newBobCt;
                setAliceAccount({ balance: Number(newBalance), ciphertext: newAliceCt });
                setBobAccount(prev => ({ balance: (prev?.balance ?? 0) + Number(send), ciphertext: newBobCt }));
            }
            setResult({ amount: Number(send), checks, ok });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Transfer failed');
        } finally {
            setRunning(false);
        }
    }

    const cluster = getClusterFromClusterId(clusterId);

    return (
        <div className="rounded-xl border bg-card p-5">
            <h3 className="text-base font-semibold text-foreground">
                Confidential transfer: send without revealing amounts
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                    Alice and Bob each hold an encrypted balance — only its owner can read it, the chain only sees
                    ciphertext.
                </li>
                <li>
                    Alice sends Bob an amount; both balances update by adding and subtracting the encrypted amounts,
                    never decrypting them.
                </li>
                <li>
                    A range proof shows Alice's new balance is still 0 or more — she can't spend what she doesn't have,
                    and the chain enforces it without seeing a single number.
                </li>
            </ol>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                    { account: aliceAccount, label: 'Alice (sender)' },
                    { account: bobAccount, label: 'Bob (receiver)' },
                ].map(({ account, label }) => (
                    <div className="space-y-2 rounded-lg border bg-background px-3 py-3" key={label}>
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium text-foreground">{label}</span>
                            <span className="text-xs text-sand-1100">
                                they see: <span className="font-medium text-foreground">{account?.balance ?? 0}</span>
                            </span>
                        </div>
                        <div>
                            <span className="text-xs text-sand-1100">chain sees (encrypted)</span>
                            <p className="mt-1 font-berkeley-mono text-[10px] break-all text-sand-1000">
                                {account ? bytesToHex(account.ciphertext).slice(0, 64) + '…' : '—'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Amount Alice sends Bob</span>
                    <input
                        className="mt-1 block h-9 w-40 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        inputMode="numeric"
                        onChange={e => setAmount(e.target.value)}
                        value={amount}
                    />
                </label>
                <Button disabled={running || !isConnected} loading={running} onClick={() => void transfer()}>
                    {isConnected ? 'Send confidentially' : 'Connect wallet to send'}
                </Button>
                <Button disabled={running} onClick={reset} variant="secondary">
                    Reset
                </Button>
            </div>

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Failed</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {result && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        {result.ok ? (
                            <>
                                <Badge variant="success">Transfer settled</Badge>
                                <span className="text-sand-1100">
                                    {result.amount} moved Alice → Bob — proven valid on-chain, amounts never revealed
                                </span>
                            </>
                        ) : (
                            <>
                                <Badge variant="danger">Transfer rejected</Badge>
                                <span className="text-sand-1100">
                                    {result.amount} is more than Alice's balance — the chain caught the overspend
                                    without seeing her balance
                                </span>
                            </>
                        )}
                    </div>
                    <div className="space-y-1">
                        {result.checks.map((check, i) => (
                            <div className="flex flex-wrap items-center gap-2 text-xs" key={i}>
                                <Badge variant={check.ok ? 'success' : 'danger'}>
                                    {check.ok ? 'passed' : 'rejected'}
                                </Badge>
                                <span className="text-sand-1100">{check.label}</span>
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
            )}
        </div>
    );
}
