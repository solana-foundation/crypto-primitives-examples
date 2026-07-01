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

import { useDemoWalletFunding } from '@/components/demo-funding';
import { RegistryFlow } from '@/components/registry-flow';
import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import {
    aggregatePubkeys,
    G2_POINT_BYTES,
    generateMember,
    type Member,
    memberInstructionData,
    memberSecret,
    REGISTRY_ACCOUNT_SIZE,
    REGISTRY_ADD_DISCRIMINATOR,
    REGISTRY_REMOVE_DISCRIMINATOR,
    restoreMember,
    verifyAgainstOnChainKey,
} from '@/lib/bls12381';
import { clearDemoState, loadDemoState, saveDemoState } from '@/lib/demo-storage';
import { ensureFunded, getDemoWallet, InsufficientDemoFundsError } from '@/lib/demo-wallet';
import { getClusterFromClusterId, getSolanaExplorerAddressUrl, getSolanaExplorerUrl } from '@/lib/explorer';
import { base64ToBytes, bytesToHex } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import { ellipsify } from '@/lib/utils';

interface Row {
    id: number;
    in: boolean;
    pubkey: string;
    sign: boolean;
}

const MESSAGE = 'approve proposal #42';

interface VerifyResult {
    aggregateKey: string;
    memberCount: number;
    ok: boolean;
    signerAggregateKey: string;
    signerCount: number;
}

interface LastOp {
    computeUnits: bigint | null;
    label: string;
    signature: string;
}

interface StoredRegistry {
    registry: string;
    rows: { id: number; in: boolean; secret: string; sign: boolean }[];
}

export function BlsRegistryDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();
    const { dialog: fundingDialog, requestFunding } = useDemoWalletFunding();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [registry, setRegistry] = useState<Address | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [lastOp, setLastOp] = useState<LastOp | null>(null);
    const [error, setError] = useState<string | null>(null);

    const members = useRef(new Map<number, Member>());
    const nextId = useRef(0);
    const storageKey = `crypto-primitives-registry-demo:${clusterId}`;

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        const stored = loadDemoState<StoredRegistry>(storageKey);
        if (!stored || members.current.size > 0) return;
        let cancelled = false;
        (async () => {
            const info = await rpc.getAccountInfo(stored.registry as Address, { encoding: 'base64' }).send();
            if (cancelled) return;
            if (!info.value) {
                clearDemoState(storageKey);
                return;
            }

            try {
                const restoredMembers = new Map<number, Member>();
                const restored = stored.rows.map(row => {
                    const member = restoreMember(row.secret);
                    restoredMembers.set(row.id, member);
                    return { id: row.id, in: row.in, pubkey: member.pubkey, sign: row.sign };
                });

                const raw = base64ToBytes(info.value.data[0]);
                const onChainCount = raw[0] | (raw[1] << 8);
                const onChainAggregateKey = bytesToHex(raw.slice(2, 2 + G2_POINT_BYTES));
                const activeMembers = restored.filter(row => row.in).map(row => restoredMembers.get(row.id)!);
                const drifted =
                    activeMembers.length !== onChainCount ||
                    (onChainCount > 0 && aggregatePubkeys(activeMembers) !== onChainAggregateKey);
                if (drifted) {
                    clearDemoState(storageKey);
                    return;
                }

                restoredMembers.forEach((member, id) => members.current.set(id, member));
                nextId.current = stored.rows.reduce((max, row) => Math.max(max, row.id), -1) + 1;
                setRegistry(stored.registry as Address);
                setRows(restored);
            } catch {
                clearDemoState(storageKey);
            }
        })().catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [rpc, storageKey]);

    useEffect(() => {
        if (!registry || rows.length === 0) return;
        saveDemoState(storageKey, {
            registry,
            rows: rows.map(row => ({
                id: row.id,
                in: row.in,
                secret: memberSecret(members.current.get(row.id)!),
                sign: row.sign,
            })),
        } satisfies StoredRegistry);
    }, [registry, rows, storageKey]);

    async function ensureRegistry(payer: KeyPairSigner): Promise<Address> {
        if (registry) return registry;
        const account = await generateKeyPairSigner();
        const lamports = await rpc.getMinimumBalanceForRentExemption(BigInt(REGISTRY_ACCOUNT_SIZE)).send();
        await signAndSend(
            [
                getCreateAccountInstruction({
                    lamports,
                    newAccount: account,
                    payer,
                    programAddress: getProgramAddress(),
                    space: BigInt(REGISTRY_ACCOUNT_SIZE),
                }),
            ],
            payer,
        );
        setRegistry(account.address);
        return account.address;
    }

    function instructionFor(member: Member, registryAddress: Address, discriminator: number): Instruction {
        return {
            accounts: [{ address: registryAddress, role: AccountRole.WRITABLE }],
            data: memberInstructionData(member, discriminator),
            programAddress: getProgramAddress(),
        };
    }

    async function recordLastOp(signature: string, label: string) {
        const tx = await rpc
            .getTransaction(signature as Signature, {
                commitment: 'confirmed',
                encoding: 'json',
                maxSupportedTransactionVersion: 0,
            })
            .send();
        setLastOp({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, label, signature });
    }

    async function addMember() {
        if (!wallet) return;
        setBusy('add');
        setError(null);
        setResult(null);
        try {
            await ensureFunded(rpc, wallet, getClusterFromClusterId(clusterId) === 'localnet');
            const registryAddress = await ensureRegistry(wallet);
            const member = generateMember();
            const signature = await signAndSend(
                [instructionFor(member, registryAddress, REGISTRY_ADD_DISCRIMINATOR)],
                wallet,
            );
            await recordLastOp(signature, 'G2 add');
            const id = nextId.current++;
            members.current.set(id, member);
            setRows(prev => [...prev, { id, in: true, pubkey: member.pubkey, sign: true }]);
        } catch (caught) {
            if (caught instanceof InsufficientDemoFundsError) {
                requestFunding({ address: caught.address, onFunded: () => void addMember() });
            } else {
                setError(caught instanceof Error ? caught.message : 'Add failed');
            }
        } finally {
            setBusy(null);
        }
    }

    async function toggleIn(row: Row) {
        if (!wallet || !registry) return;
        setBusy(`in-${row.id}`);
        setError(null);
        setResult(null);
        try {
            const member = members.current.get(row.id)!;
            const discriminator = row.in ? REGISTRY_REMOVE_DISCRIMINATOR : REGISTRY_ADD_DISCRIMINATOR;
            const signature = await signAndSend([instructionFor(member, registry, discriminator)], wallet);
            await recordLastOp(signature, row.in ? 'G2 sub' : 'G2 add');
            setRows(prev => prev.map(r => (r.id === row.id ? { ...r, in: !r.in, sign: !r.in } : r)));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Update failed');
        } finally {
            setBusy(null);
        }
    }

    function toggleSign(id: number) {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, sign: !r.sign } : r)));
    }

    async function verify() {
        if (!registry) return;
        setBusy('verify');
        setError(null);
        setResult(null);
        try {
            const info = await rpc.getAccountInfo(registry, { encoding: 'base64' }).send();
            const raw = base64ToBytes(info.value!.data[0]);
            const memberCount = raw[0] | (raw[1] << 8);
            const aggregateKey = raw.slice(2, 2 + G2_POINT_BYTES);

            const signers = rows.filter(r => r.sign).map(r => members.current.get(r.id)!);
            const ok = memberCount > 0 && verifyAgainstOnChainKey(signers, MESSAGE, aggregateKey);
            setResult({
                aggregateKey: bytesToHex(aggregateKey),
                memberCount,
                ok,
                signerAggregateKey: aggregatePubkeys(signers),
                signerCount: signers.length,
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Verify failed');
        } finally {
            setBusy(null);
        }
    }

    const inCount = rows.filter(r => r.in).length;
    const cluster = getClusterFromClusterId(clusterId);

    return (
        <div className="space-y-5">
            <RegistryFlow busy={busy} hasRegistry={registry !== null} memberCount={inCount} result={result} />
            <div className="space-y-5 rounded-xl border bg-card p-5">
                <div>
                    <h3 className="text-base font-semibold text-foreground">
                        Aggregate-key registry: members join and leave
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        A committee's shared key, kept live on-chain: add or remove members and the program always
                        stores one combined key — no matter how many.
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            Add members — each key is folded into one aggregate key on-chain with G2 addition; the
                            program stores that single key, not the list.
                        </li>
                        <li>
                            Remove a member — G2 subtraction takes their key back out, the op alt_bn128 doesn't have.
                        </li>
                        <li>
                            Pick who signs and verify — the aggregate signature only matches the on-chain key when the
                            signers are exactly the current members.{' '}
                            <span className="text-sand-1000">
                                Verification runs off-chain — SIMD-0388 ships group ops only, no pairing syscall yet.
                            </span>
                        </li>
                    </ol>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Button disabled={!wallet} loading={busy === 'add'} onClick={() => void addMember()}>
                        Add member
                    </Button>
                    <Button
                        disabled={!registry || rows.length === 0}
                        loading={busy === 'verify'}
                        onClick={() => void verify()}
                        variant="secondary"
                    >
                        Verify signatures
                    </Button>
                </div>

                {registry && (
                    <div className="space-y-1 text-xs font-medium text-sand-1100">
                        <div>
                            registry{' '}
                            <a
                                className="underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                                href={getSolanaExplorerAddressUrl(registry, cluster)}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                {ellipsify(registry, 4)}
                            </a>
                        </div>
                        <div>
                            {inCount} active / {rows.length} total
                        </div>
                        {lastOp && lastOp.computeUnits != null && (
                            <div>
                                last op {lastOp.label} ·{' '}
                                <span className="font-medium text-foreground">
                                    {lastOp.computeUnits.toLocaleString()}
                                </span>{' '}
                                CU ·{' '}
                                <a
                                    className="underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                                    href={getSolanaExplorerUrl(lastOp.signature, cluster)}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    view tx
                                </a>
                            </div>
                        )}
                        <div>click a member to toggle whether they sign · × removes a member (G2 subtract)</div>
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="grid max-h-48 grid-cols-5 gap-1 overflow-y-auto rounded-lg border bg-background p-2">
                        {rows.map(row => (
                            <div className="flex overflow-hidden rounded" key={row.id} title={row.pubkey}>
                                <button
                                    className={
                                        'flex-1 px-1.5 py-0.5 text-center font-berkeley-mono text-[10px] transition-colors disabled:cursor-default ' +
                                        (row.in && row.sign
                                            ? 'bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]'
                                            : 'bg-sand-200 text-sand-1000') +
                                        (row.in ? '' : ' line-through opacity-50')
                                    }
                                    disabled={!row.in || busy !== null}
                                    onClick={() => toggleSign(row.id)}
                                    type="button"
                                >
                                    {row.in && row.sign ? '✓ ' : ''}#{row.id + 1} {ellipsify(row.pubkey, 4)}
                                </button>
                                <button
                                    aria-label={row.in ? 'Remove from registry' : 'Add back to registry'}
                                    className="bg-sand-300 px-1.5 font-berkeley-mono text-[10px] text-sand-1100 transition-colors hover:bg-sand-400 disabled:cursor-default disabled:opacity-50"
                                    disabled={busy !== null}
                                    onClick={() => void toggleIn(row)}
                                    type="button"
                                >
                                    {busy === `in-${row.id}` ? '…' : row.in ? '×' : '+'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm text-destructive">
                        <Badge variant="danger">Error</Badge>
                        <span className="break-words whitespace-pre-wrap">{error}</span>
                    </div>
                )}

                {result && (
                    <div className="space-y-2 rounded-lg border bg-background px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            {result.ok ? (
                                <Badge variant="success">Verified</Badge>
                            ) : (
                                <Badge variant="danger">Rejected</Badge>
                            )}
                            <span className="text-sand-1100">
                                {result.signerCount} signed · on-chain set has {result.memberCount}
                            </span>
                        </div>
                        <div>
                            <span className="text-xs font-medium text-sand-1100">on-chain aggregate key</span>
                            <p className="mt-1 font-berkeley-mono text-xs break-all text-foreground">
                                {result.aggregateKey}
                            </p>
                        </div>
                        {result.signerAggregateKey && (
                            <div>
                                <span className="text-xs font-medium text-sand-1100">
                                    aggregate key calculated off-chain from the signers
                                </span>
                                <p
                                    className={
                                        'mt-1 font-berkeley-mono text-xs break-all ' +
                                        (result.signerAggregateKey === result.aggregateKey
                                            ? 'text-foreground'
                                            : 'text-destructive')
                                    }
                                >
                                    {result.signerAggregateKey}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {fundingDialog}
            </div>
        </div>
    );
}
