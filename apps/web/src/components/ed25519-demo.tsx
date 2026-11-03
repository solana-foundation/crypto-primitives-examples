import { useEffect, useState } from 'react';
import { useTransactionSigner } from '@solana/connector/react';
import { Badge, Button } from '@solana/design-system';
import {
    type Address,
    getAddressEncoder,
    type Instruction,
    type KeyPairSigner,
    type Signature,
    signBytes,
} from '@solana/kit';

import { useDemoWalletFunding } from '@/components/demo-funding';
import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';
import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import { ensureFunded, getDemoWallet, InsufficientDemoFundsError } from '@/lib/demo-wallet';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { bytesToHex } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import { formatTransactionError } from '@/lib/transactionErrors';
import { ellipsify } from '@/lib/utils';

const ED25519_VERIFY_DISCRIMINATOR = 16;
const MAX_MESSAGE_LENGTH = 500;

interface Signed {
    by: string;
    message: string;
    pubkey: Address;
    signature: Uint8Array;
}

interface VerifyResult {
    computeUnits: bigint | null;
    ok: boolean;
    signature: string;
    tampered: boolean;
}

export function Ed25519Demo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();
    const { dialog: fundingDialog, requestFunding } = useDemoWalletFunding();
    const { signer: connectedWallet } = useTransactionSigner();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [message, setMessage] = useState('I allow Bob to claim 1 SOL from my account');
    const [signed, setSigned] = useState<Signed | null>(null);
    const [busy, setBusy] = useState<'sign' | 'verify' | null>(null);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

    const cluster = getClusterFromClusterId(clusterId);
    const tampered = signed !== null && message !== signed.message;

    async function sign() {
        if (!wallet) return;
        setBusy('sign');
        setError(null);
        setResult(null);
        try {
            const bytes = new TextEncoder().encode(message);
            if (connectedWallet?.signMessage) {
                const signature = await connectedWallet.signMessage(bytes);
                setSigned({ by: 'your wallet', message, pubkey: connectedWallet.address as Address, signature });
            } else {
                const signature = await signBytes(wallet.keyPair.privateKey, bytes);
                setSigned({ by: 'the demo key', message, pubkey: wallet.address, signature });
            }
        } catch (caught) {
            setError(formatTransactionError(caught));
        } finally {
            setBusy(null);
        }
    }

    async function verify() {
        if (!wallet || !signed) return;
        setBusy('verify');
        setError(null);
        setResult(null);
        try {
            await ensureFunded(rpc, wallet, cluster === 'localnet');
            const instruction: Instruction = {
                accounts: [],
                data: new Uint8Array([
                    ED25519_VERIFY_DISCRIMINATOR,
                    ...getAddressEncoder().encode(signed.pubkey),
                    ...signed.signature,
                    ...new TextEncoder().encode(message),
                ]),
                programAddress: getProgramAddress(),
            };
            let signature: string;
            let ok = true;
            try {
                signature = await signAndSend([instruction], wallet, { skipPreflight: true });
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
            setResult({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, ok, signature, tampered });
        } catch (caught) {
            if (caught instanceof InsufficientDemoFundsError) {
                requestFunding({ address: caught.address, onFunded: () => void verify() });
            } else {
                setError(formatTransactionError(caught));
            }
        } finally {
            setBusy(null);
        }
    }

    const stage1: StageState = busy === 'sign' || !signed ? 'active' : 'done';
    const stage2: StageState =
        busy === 'verify' ? 'active' : result ? (result.ok ? 'pass' : 'fail') : signed ? 'done' : 'idle';

    return (
        <div className="space-y-5">
            <FlowDiagram>
                <div>
                    <h3 className="text-base font-semibold text-foreground">Signed permission slip</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Sign a message off-chain, then let the program check the signature itself, in a single
                        instruction, without the Ed25519 precompile.
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            Write a permission and sign it. A connected wallet signs with its own key; otherwise a demo
                            key in your browser signs.
                        </li>
                        <li>
                            Verify on-chain: the program hashes the message with SHA-512 and checks the signature with
                            curve25519 math.
                        </li>
                        <li>Edit the message after signing and verify again: the forgery is rejected.</li>
                    </ol>
                </div>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <textarea
                                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                                disabled={busy !== null}
                                maxLength={MAX_MESSAGE_LENGTH}
                                onChange={e => setMessage(e.target.value)}
                                rows={2}
                                value={message}
                            />
                            <Button disabled={!wallet} loading={busy === 'sign'} onClick={() => void sign()}>
                                Sign message
                            </Button>
                            {signed && (
                                <div className="space-y-1 text-xs font-medium text-sand-1100">
                                    <div>
                                        signed by {signed.by} · {ellipsify(signed.pubkey, 4)}
                                    </div>
                                    <div className="font-berkeley-mono break-all">
                                        signature {ellipsify(bytesToHex(signed.signature), 8)}
                                    </div>
                                    {tampered && <Badge variant="warning">edited after signing</Badge>}
                                </div>
                            )}
                        </div>
                    }
                    location="off-chain"
                    n={1}
                    state={stage1}
                    title="Sign"
                >
                    a 64-byte Ed25519 signature over your message
                </Stage>

                <Connector>public key, signature and message sent in one instruction</Connector>

                <Stage
                    actions={
                        <div className="space-y-3">
                            <Button
                                disabled={!wallet || !signed}
                                loading={busy === 'verify'}
                                onClick={() => void verify()}
                                variant="secondary"
                            >
                                Verify on-chain
                            </Button>
                            {result && (
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm">
                                    {result.ok ? (
                                        <Badge variant="success">Verified</Badge>
                                    ) : (
                                        <Badge variant="danger">Rejected</Badge>
                                    )}
                                    <span className="text-sand-1100">
                                        {result.tampered ? 'message edited after signing' : 'message as signed'}
                                        {result.computeUnits != null && (
                                            <>
                                                {' '}
                                                ·{' '}
                                                <span className="font-medium text-foreground">
                                                    {result.computeUnits.toLocaleString()}
                                                </span>{' '}
                                                CU
                                            </>
                                        )}{' '}
                                        ·{' '}
                                        <a
                                            className="underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                                            href={getSolanaExplorerUrl(result.signature, cluster)}
                                            rel="noopener noreferrer"
                                            target="_blank"
                                        >
                                            view tx
                                        </a>
                                    </span>
                                </div>
                            )}
                        </div>
                    }
                    location="on-chain"
                    n={2}
                    state={stage2}
                    title="Verify"
                >
                    {result
                        ? result.ok
                            ? '✓ the program confirmed who signed this exact message'
                            : '✗ signature does not match this message'
                        : 'SHA-512 and curve25519 syscalls, no precompile'}
                </Stage>
            </FlowDiagram>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Error</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {fundingDialog}
        </div>
    );
}
