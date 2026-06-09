import { useState } from 'react';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import type { Instruction, Signature } from '@solana/kit';

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { buildAggregateSignature } from '@/lib/bn254-bls';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { getProgramAddress } from '@/lib/program';
import { formatTransactionError } from '@/lib/transactionErrors';

interface Built {
    aggregateSignature: string;
    instructionData: Uint8Array;
    signerCount: number;
}

interface RunResult {
    computeUnits: bigint | null;
    signature: string;
}

// Verifying each signature on its own costs one pairing-check apiece; a pairing
// is the dominant cost (~49k CU). The aggregate does it in a single check.
const NAIVE_CU_PER_SIGNER = 49_000;

export function BlsAggregateDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();
    const { id: clusterId } = useClusterConfig();

    const [message, setMessage] = useState('approve proposal #42');
    const [signerCount, setSignerCount] = useState(10);
    const [built, setBuilt] = useState<Built | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function generate() {
        setError(null);
        setResult(null);
        try {
            const { aggregateSignature, instructionData } = await buildAggregateSignature(message, signerCount);
            setBuilt({ aggregateSignature, instructionData, signerCount });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Signing failed');
        }
    }

    async function verifyOnChain() {
        if (!signer || !built) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const instruction: Instruction = {
                accounts: [],
                data: built.instructionData,
                programAddress: getProgramAddress(),
            };
            const signature = await signAndSend([instruction], signer);
            const tx = await rpc
                .getTransaction(signature as Signature, {
                    commitment: 'confirmed',
                    encoding: 'json',
                    maxSupportedTransactionVersion: 0,
                })
                .send();
            setResult({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, signature });
        } catch (caught) {
            setError(formatTransactionError(caught));
        } finally {
            setRunning(false);
        }
    }

    const cluster = getClusterFromClusterId(clusterId);
    const naiveCu = (built?.signerCount ?? signerCount) * NAIVE_CU_PER_SIGNER;

    return (
        <div className="rounded-xl border bg-card p-5">
            <h3 className="text-base font-semibold text-foreground">
                Aggregate signatures: N sign, the chain checks one
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
                Every signer signs the same message. Their public keys are summed <em>on-chain</em> (G2 addition,
                SIMD-0302) into one aggregate key, and a single pairing check verifies all of them at once. Adding
                signers barely moves the cost — no per-signer transaction, no linear blowup.
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-4">
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Message</span>
                    <input
                        className="mt-1 w-64 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onChange={event => setMessage(event.target.value)}
                        value={message}
                    />
                </label>
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Signers: {signerCount}</span>
                    <input
                        className="mt-2 block w-48"
                        max={20}
                        min={1}
                        onChange={event => setSignerCount(Number(event.target.value))}
                        type="range"
                        value={signerCount}
                    />
                </label>
                <Button onClick={() => void generate()} size="sm" variant="secondary">
                    Generate &amp; sign
                </Button>
                <Button
                    disabled={running || !isConnected || !built}
                    loading={running}
                    onClick={() => void verifyOnChain()}
                    size="sm"
                >
                    {isConnected ? 'Verify on-chain' : 'Connect wallet to verify'}
                </Button>
            </div>

            {built && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div className="text-sand-1100">
                        {built.signerCount} signatures aggregated into{' '}
                        <span className="font-medium text-foreground">one 64-byte signature</span>.
                    </div>
                    <div>
                        <span className="text-xs font-medium text-sand-1100">aggregate signature</span>
                        <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">
                            {built.aggregateSignature}
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Failed</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {result && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="success">All {built?.signerCount} verified in one check</Badge>
                        {result.computeUnits != null && (
                            <span className="text-sand-1100">
                                <span className="font-medium text-foreground">
                                    {result.computeUnits.toLocaleString()}
                                </span>{' '}
                                CU — vs ~{naiveCu.toLocaleString()} CU verifying one-by-one
                            </span>
                        )}
                        <Button asChild size="sm" variant="secondary">
                            <a
                                href={getSolanaExplorerUrl(result.signature, cluster)}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                View on Explorer
                            </a>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
