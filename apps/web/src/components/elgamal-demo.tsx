import { useState } from 'react';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import { verifyPubkeyValidity } from '@solana-program/zk-elgamal-proof';
import type { Signature } from '@solana/kit';
import { ElGamalKeypair, PubkeyValidityProofData } from '@solana/zk-sdk/bundler';

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { bytesToHex } from '@/lib/hex';
import { formatTransactionError } from '@/lib/transactionErrors';

interface Generated {
    proofBytes: Uint8Array;
    pubkey: string;
}

interface RunResult {
    computeUnits: bigint | null;
    signature: string;
}

export function ElGamalDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();
    const { id: clusterId } = useClusterConfig();

    const [generated, setGenerated] = useState<Generated | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function generate() {
        setError(null);
        setResult(null);
        try {
            const keypair = new ElGamalKeypair();
            const proof = new PubkeyValidityProofData(keypair);
            proof.verify();
            setGenerated({
                proofBytes: proof.toBytes(),
                pubkey: bytesToHex(proof.context().toBytes()),
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Proof generation failed');
        }
    }

    async function verifyOnChain() {
        if (!signer || !generated) return;
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const instructions = await verifyPubkeyValidity({
                payer: signer,
                proofData: generated.proofBytes,
                rpc,
            });
            const signature = await signAndSend(instructions, signer);

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

    return (
        <div className="rounded-xl border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Pubkey Validity Proof</h3>
                    <code className="font-berkeley-mono text-xs text-muted-foreground">
                        prove knowledge of an ElGamal secret key
                    </code>
                </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
                The proof is generated entirely in your browser (WebAssembly, <code>@solana/zk-sdk</code>), then
                submitted to the native ZK ElGamal Proof program, which verifies it on-chain. No custom program — the
                verifier ships with the validator.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={generate} size="sm" variant="secondary">
                    Generate keypair &amp; proof
                </Button>
                <Button
                    disabled={running || !isConnected || !generated}
                    loading={running}
                    onClick={() => void verifyOnChain()}
                    size="sm"
                >
                    {isConnected ? 'Verify on-chain' : 'Connect wallet to verify'}
                </Button>
            </div>

            {generated && (
                <div className="mt-4 space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                    <div>
                        <span className="text-xs font-medium text-sand-1100">ElGamal public key (32 bytes)</span>
                        <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">{generated.pubkey}</p>
                    </div>
                    <div className="text-sand-1100">
                        proof size: <span className="font-medium text-foreground">{generated.proofBytes.length}</span>{' '}
                        bytes
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
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm">
                    <Badge variant="success">Verified on-chain</Badge>
                    {result.computeUnits != null && (
                        <span className="text-sand-1100">
                            <span className="font-medium text-foreground">{result.computeUnits.toLocaleString()}</span>{' '}
                            compute units
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
            )}
        </div>
    );
}
