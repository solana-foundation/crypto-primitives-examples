import { useState } from 'react';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import type { Signature } from '@solana/kit';

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useRpc } from '@/hooks/useRpc';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { base64ToBytes, bytesToHex, hexToBytes } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import type { Demo } from '@/lib/primitives';
import { formatTransactionError } from '@/lib/transactionErrors';

interface RunResult {
    computeUnits: bigint | null;
    output: string | null;
    signature: string;
}

export function DemoPanel({ demo }: { demo: Demo }) {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();
    const { id: clusterId } = useClusterConfig();

    const [inputs, setInputs] = useState<string[]>(demo.example);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function setOperand(index: number, value: string) {
        setInputs(prev => prev.map((entry, i) => (i === index ? value : entry)));
    }

    function loadExample() {
        setInputs(demo.example);
        setResult(null);
        setError(null);
    }

    async function run() {
        if (!signer) {
            setError('Connect a wallet to send the transaction.');
            return;
        }
        setRunning(true);
        setResult(null);
        setError(null);
        try {
            const payload: number[] = [];
            demo.operands.forEach((operand, i) => {
                const bytes = hexToBytes(inputs[i] ?? '');
                if (bytes.length !== operand.bytes) {
                    throw new Error(`${operand.label}: expected ${operand.bytes} bytes, got ${bytes.length}`);
                }
                payload.push(...bytes);
            });

            const instruction = demo.build(payload, getProgramAddress());
            const signature = await signAndSend([instruction], signer);

            const tx = await rpc
                .getTransaction(signature as Signature, {
                    commitment: 'confirmed',
                    encoding: 'json',
                    maxSupportedTransactionVersion: 0,
                })
                .send();

            const returnData = tx?.meta?.returnData?.data;
            const base64 = Array.isArray(returnData) ? returnData[0] : (returnData as string | undefined);

            setResult({
                computeUnits: tx?.meta?.computeUnitsConsumed ?? null,
                output: base64 ? bytesToHex(base64ToBytes(base64)) : null,
                signature,
            });
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
                    <h3 className="text-base font-semibold text-foreground">{demo.title}</h3>
                    <code className="font-berkeley-mono text-xs text-muted-foreground">{demo.op}</code>
                </div>
                <span className="rounded-full bg-sand-200 px-2.5 py-1 font-berkeley-mono text-xs text-sand-1200">
                    ~{demo.measuredCu.toLocaleString()} CU
                </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{demo.description}</p>

            <div className="mt-4 space-y-3">
                {demo.operands.map((operand, i) => (
                    <label className="block" key={operand.label}>
                        <span className="text-xs font-medium text-sand-1100">{operand.label}</span>
                        <textarea
                            className="mt-1 h-20 w-full resize-y rounded-lg border border-input bg-background p-2 font-berkeley-mono text-xs break-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            onChange={event => setOperand(i, event.target.value)}
                            spellCheck={false}
                            value={inputs[i] ?? ''}
                        />
                    </label>
                ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
                <Button disabled={running || !isConnected} loading={running} onClick={() => void run()} size="sm">
                    {isConnected ? 'Run on-chain' : 'Connect wallet to run'}
                </Button>
                <Button onClick={loadExample} size="sm" variant="secondary">
                    Reset example
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
                        <Badge variant="success">Success</Badge>
                        {result.computeUnits != null && (
                            <span className="text-sand-1100">
                                <span className="font-medium text-foreground">
                                    {result.computeUnits.toLocaleString()}
                                </span>{' '}
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
                    {result.output && (
                        <div>
                            <span className="text-xs font-medium text-sand-1100">
                                Result ({demo.outputBytes} bytes, big-endian)
                            </span>
                            <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">{result.output}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
