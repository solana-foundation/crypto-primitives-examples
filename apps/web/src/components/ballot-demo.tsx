import { useState } from 'react';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import { verifyBatchedRangeProofU64 } from '@solana-program/zk-elgamal-proof';
import type { Signature } from '@solana/kit';
import { BatchedRangeProofU64Data, ElGamalKeypair, PedersenCommitment, PedersenOpening } from '@solana/zk-sdk/bundler';

import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { decryptSmallAmount, sumCiphertexts } from '@/lib/elgamal';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { bytesToHex } from '@/lib/hex';
import { formatTransactionError } from '@/lib/transactionErrors';

type Vote = 'no' | 'stuffed' | 'yes';

interface Generated {
    proofChunks: Uint8Array[];
    stuffedCount: number;
    tallyCiphertext: string;
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
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();
    const { id: clusterId } = useClusterConfig();

    const [votes, setVotes] = useState<Vote[]>(Array.from({ length: VOTER_COUNT }, () => 'yes'));
    const [generated, setGenerated] = useState<Generated | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function cycleVote(index: number) {
        setVotes(prev => prev.map((v, i) => (i === index ? VOTE_CYCLE[(VOTE_CYCLE.indexOf(v) + 1) % 3] : v)));
        setGenerated(null);
        setResult(null);
    }

    function castBallots() {
        setError(null);
        setResult(null);
        setGenerated(null);
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
                proofChunks,
                stuffedCount: votes.filter(v => v === 'stuffed').length,
                tallyCiphertext: bytesToHex(tallyCiphertext),
                wouldBeTally,
                yesCount: votes.filter(v => v === 'yes').length,
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Ballot generation failed');
        }
    }

    async function verifyOnChain() {
        if (!signer || !generated) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const checks: ProofCheck[] = [];
            for (const proofData of generated.proofChunks) {
                const instructions = await verifyBatchedRangeProofU64({ payer: signer, proofData, rpc });
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
                checks.push({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, ok, signature });
            }
            setResult({ checks, ok: checks.every(check => check.ok) });
        } catch (caught) {
            setError(formatTransactionError(caught));
        } finally {
            setRunning(false);
        }
    }

    const cluster = getClusterFromClusterId(clusterId);

    return (
        <div className="rounded-xl border bg-card p-5">
            <h3 className="text-base font-semibold text-foreground">Private ballot: secret votes, public tally</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                    Each voter encrypts a 0 (no) or 1 (yes) in the browser — individual ballots are never revealed, not
                    even to count them.
                </li>
                <li>
                    Batched proofs show every ballot is a valid 0-or-1 on-chain ({VOTER_COUNT} voters span two proofs,
                    since one tops out at {CHUNK_SIZE + 3} commitments). A stuffed ballot (a sneaky 2, worth two votes)
                    can't be proven — the demo forges it and the chain catches it.
                </li>
                <li>
                    The encrypted ballots are added together while still encrypted; only the total is ever decrypted.
                </li>
            </ol>

            <div className="mt-4 text-xs font-medium text-sand-1100">
                click a voter to cycle their ballot: yes → no → stuffed (counts as 2)
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 rounded-lg border bg-background p-2">
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

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={castBallots} variant="secondary">
                    Cast encrypted ballots
                </Button>
                <Button
                    disabled={running || !isConnected || !generated}
                    loading={running}
                    onClick={() => void verifyOnChain()}
                >
                    {isConnected ? 'Prove all ballots valid on-chain' : 'Connect wallet to verify'}
                </Button>
            </div>

            {generated && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div className="text-sand-1100">
                        {VOTER_COUNT} encrypted ballots · {generated.proofChunks.length} batched proofs cover all of
                        them
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
                            {generated.stuffedCount} stuffed ballot{generated.stuffedCount > 1 ? 's' : ''} in the mix —
                            watch the proof fail
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Failed</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {result && generated && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        {result.ok ? (
                            <>
                                <Badge variant="success">All ballots valid</Badge>
                                <span className="text-sand-1100">
                                    tally:{' '}
                                    <span className="font-medium text-foreground">
                                        {generated.wouldBeTally ?? '?'} yes /{' '}
                                        {generated.wouldBeTally != null ? VOTER_COUNT - generated.wouldBeTally : '?'} no
                                    </span>{' '}
                                    — decrypted from the sum only; no individual ballot was ever opened
                                </span>
                            </>
                        ) : (
                            <>
                                <Badge variant="danger">Ballot stuffing caught</Badge>
                                <span className="text-sand-1100">
                                    the proof can't show a 2 fits in one bit — without it, the tally would have read{' '}
                                    <span className="font-medium text-foreground">{generated.wouldBeTally ?? '?'}</span>{' '}
                                    yes from {generated.yesCount + generated.stuffedCount} actual yes-voters
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
                                <span className="text-sand-1100">
                                    proof {i + 1} — ballots {i * CHUNK_SIZE + 1}–
                                    {Math.min((i + 1) * CHUNK_SIZE, VOTER_COUNT)}
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
            )}
        </div>
    );
}
