import { useEffect, useRef, useState } from 'react';
import { getCreateAccountInstruction } from '@solana-program/system';
import { Badge, Button } from '@solana/design-system';
import {
    AccountRole,
    type Address,
    generateKeyPairSigner,
    type Instruction,
    type KeyPairSigner,
    type Signature,
} from '@solana/kit';

import {
    OnChainTransactionError,
    useWalletTransactionSignAndSend,
} from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import {
    addSignersInstructionData,
    generateMembers,
    type MemberSet,
    MAX_KEYS_PER_TX,
    G2_POINT_BYTES,
    memberSecrets,
    restoreMembers,
    signMessage,
    verifyInstructionData,
} from '@/lib/bn254-bls';
import { clearDemoState, loadDemoState, saveDemoState } from '@/lib/demo-storage';
import { ensureFunded, getDemoWallet } from '@/lib/demo-wallet';
import { getClusterFromClusterId, getSolanaExplorerUrl } from '@/lib/explorer';
import { getProgramAddress } from '@/lib/program';
import { formatTransactionError } from '@/lib/transactionErrors';
import { ellipsify } from '@/lib/utils';

type Phase = 'idle' | 'creating' | 'ready' | 'verifying';

interface VerifyResult {
    approvals: number;
    computeUnits: bigint | null;
    ok: boolean;
    signature: string | null;
}

interface StoredMultisig {
    multisig: string;
    secrets: string[];
}

export function MultisigDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [memberCount, setMemberCount] = useState(50);
    const [message, setMessage] = useState('approve proposal #42');
    const [approvals, setApprovals] = useState(50);
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [members, setMembers] = useState<string[]>([]);
    const [multisig, setMultisig] = useState<Address | null>(null);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const memberSet = useRef<MemberSet | null>(null);
    const storageKey = `crypto-primitives-multisig-demo:${clusterId}`;

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        const stored = loadDemoState<StoredMultisig>(storageKey);
        if (!stored || memberSet.current) return;
        let cancelled = false;
        (async () => {
            const info = await rpc.getAccountInfo(stored.multisig as Address, { encoding: 'base64' }).send();
            if (cancelled) return;
            if (!info.value) {
                clearDemoState(storageKey);
                return;
            }
            const set = await restoreMembers(stored.secrets);
            if (cancelled) return;
            memberSet.current = set;
            setMembers(set.pubkeys);
            setMemberCount(set.pubkeys.length);
            setApprovals(set.pubkeys.length);
            setMultisig(stored.multisig as Address);
            setPhase('ready');
        })().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [rpc, storageKey]);

    useEffect(() => {
        if (!multisig || !memberSet.current) return;
        saveDemoState(storageKey, {
            multisig,
            secrets: memberSecrets(memberSet.current),
        } satisfies StoredMultisig);
    }, [multisig, storageKey]);

    async function setup() {
        if (!wallet) return;
        setPhase('creating');
        setError(null);
        setResult(null);
        setMultisig(null);
        try {
            await ensureFunded(rpc, wallet, getClusterFromClusterId(clusterId) === 'localnet');

            const set = await generateMembers(memberCount);
            memberSet.current = set;
            setMembers(set.pubkeys);
            setApprovals(memberCount);

            const space = BigInt(2 + memberCount * G2_POINT_BYTES);
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

            const total = Math.ceil(memberCount / MAX_KEYS_PER_TX);
            setProgress({ done: 0, total });
            for (let i = 0; i < memberCount; i += MAX_KEYS_PER_TX) {
                const chunk = set.pubkeys.slice(i, i + MAX_KEYS_PER_TX);
                const instruction: Instruction = {
                    accounts: [{ address: account.address, role: AccountRole.WRITABLE }],
                    data: addSignersInstructionData(chunk),
                    programAddress: getProgramAddress(),
                };
                await signAndSend([instruction], wallet);
                setProgress({ done: Math.floor(i / MAX_KEYS_PER_TX) + 1, total });
            }

            setMultisig(account.address);
            setPhase('ready');
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Setup failed');
            setPhase('idle');
        }
    }

    async function verify() {
        if (!wallet || !multisig || !memberSet.current) return;
        setPhase('verifying');
        setError(null);
        setResult(null);
        try {
            const aggregate = await signMessage(memberSet.current, message, approvals);
            const instruction: Instruction = {
                accounts: [{ address: multisig, role: AccountRole.READONLY }],
                data: verifyInstructionData(aggregate),
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
                    maxSupportedTransactionVersion: 0,
                })
                .send();
            setResult({
                approvals,
                computeUnits: tx?.meta?.computeUnitsConsumed ?? null,
                ok,
                signature,
            });
        } catch (caught) {
            setError(formatTransactionError(caught));
        } finally {
            setPhase('ready');
        }
    }

    const cluster = getClusterFromClusterId(clusterId);
    const busy = phase === 'creating' || phase === 'verifying';

    return (
        <div className="space-y-5 rounded-xl border bg-card p-5">
            <div>
                <h3 className="text-base font-semibold text-foreground">On-chain multisig: everyone must sign</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Register a set of members on-chain, then prove they all approved a message with a single aggregate
                    signature. The program sums every stored public key with G2 addition (SIMD-0302) and runs one
                    pairing check — it only passes if <em>every</em> member signed. Drop one and the math breaks.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Members: {memberCount}</span>
                    <input
                        className="mt-2 block w-56"
                        disabled={busy}
                        max={200}
                        min={2}
                        onChange={e => setMemberCount(Number(e.target.value))}
                        step={1}
                        type="range"
                        value={memberCount}
                    />
                </label>
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Message</span>
                    <input
                        className="mt-1 block w-64 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        disabled={busy}
                        onChange={e => setMessage(e.target.value)}
                        value={message}
                    />
                </label>
                <Button loading={phase === 'creating'} onClick={() => void setup()} size="sm">
                    Create multisig &amp; register members
                </Button>
            </div>

            {phase === 'creating' && progress.total > 0 && (
                <div className="text-sm text-sand-1100">
                    Storing members on-chain… {progress.done}/{progress.total} batches
                </div>
            )}

            {members.length > 0 && (
                <div>
                    <div className="mb-2 text-xs font-medium text-sand-1100">
                        {members.length} members{multisig ? ` · ${ellipsify(multisig, 4)}` : ''}
                    </div>
                    <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-lg border bg-background p-2">
                        {members.map((pubkey, i) => {
                            const signed = phase !== 'idle' && i < approvals;
                            return (
                                <span
                                    className={
                                        'rounded px-1.5 py-0.5 font-berkeley-mono text-[10px] ' +
                                        (signed ? 'bg-primary/10 text-foreground' : 'bg-sand-200 text-sand-1000')
                                    }
                                    key={i}
                                    title={pubkey}
                                >
                                    {signed ? '✓ ' : ''}#{i + 1} {pubkey.slice(0, 6)}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {multisig && (phase === 'ready' || phase === 'verifying') && (
                <div className="flex flex-wrap items-end gap-4 border-t pt-4">
                    <label className="block">
                        <span className="text-xs font-medium text-sand-1100">
                            Signers who approve: {approvals} / {members.length}
                        </span>
                        <input
                            className="mt-2 block w-56"
                            max={members.length}
                            min={1}
                            onChange={e => setApprovals(Number(e.target.value))}
                            type="range"
                            value={approvals}
                        />
                    </label>
                    <Button loading={phase === 'verifying'} onClick={() => void verify()} size="sm">
                        Verify on-chain
                    </Button>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    <Badge variant="danger">Error</Badge>
                    <span className="break-words whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {result && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm">
                    {result.ok ? (
                        <>
                            <Badge variant="success">All {members.length} approved</Badge>
                            {result.computeUnits != null && (
                                <span className="text-sand-1100">
                                    one pairing check ·{' '}
                                    <span className="font-medium text-foreground">
                                        {result.computeUnits.toLocaleString()}
                                    </span>{' '}
                                    CU
                                </span>
                            )}
                            {result.signature && (
                                <Button asChild size="sm" variant="secondary">
                                    <a
                                        href={getSolanaExplorerUrl(result.signature, cluster)}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >
                                        View on Explorer
                                    </a>
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Badge variant="danger">Rejected on-chain</Badge>
                            <span className="text-sand-1100">
                                only {result.approvals} of {members.length} signed — the aggregate doesn't match the
                                registered set
                            </span>
                            {result.computeUnits != null && (
                                <span className="text-sand-1100">
                                    pairing still ran ·{' '}
                                    <span className="font-medium text-foreground">
                                        {result.computeUnits.toLocaleString()}
                                    </span>{' '}
                                    CU
                                </span>
                            )}
                            {result.signature && (
                                <Button asChild size="sm" variant="secondary">
                                    <a
                                        href={getSolanaExplorerUrl(result.signature, cluster)}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >
                                        View on Explorer
                                    </a>
                                </Button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
