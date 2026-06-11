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

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import { useClusterConfig } from '@/hooks/use-cluster-config';
import { useRpc } from '@/hooks/useRpc';
import {
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
import { ensureFunded, getDemoWallet } from '@/lib/demo-wallet';
import { getClusterFromClusterId } from '@/lib/explorer';
import { base64ToBytes, bytesToHex } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import { ellipsify } from '@/lib/utils';

interface Row {
    id: number;
    in: boolean;
    pubkey: string;
    sign: boolean;
}

interface VerifyResult {
    aggregateKey: string;
    memberCount: number;
    ok: boolean;
    signerCount: number;
}

interface LastOp {
    computeUnits: bigint | null;
    label: string;
}

interface StoredRegistry {
    registry: string;
    rows: { id: number; in: boolean; secret: string; sign: boolean }[];
}

export function BlsRegistryDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();
    const { id: clusterId } = useClusterConfig();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [registry, setRegistry] = useState<Address | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [message, setMessage] = useState('approve proposal #42');
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
            const restored = stored.rows.map(row => {
                const member = restoreMember(row.secret);
                members.current.set(row.id, member);
                return { id: row.id, in: row.in, pubkey: member.pubkey, sign: row.sign };
            });
            nextId.current = stored.rows.reduce((max, row) => Math.max(max, row.id), -1) + 1;
            setRegistry(stored.registry as Address);
            setRows(restored);
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
        setLastOp({ computeUnits: tx?.meta?.computeUnitsConsumed ?? null, label });
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
            setError(caught instanceof Error ? caught.message : 'Add failed');
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
            setRows(prev => prev.map(r => (r.id === row.id ? { ...r, in: !r.in } : r)));
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
            const aggregateKey = raw.slice(2, 2 + 192);

            const signers = rows.filter(r => r.sign).map(r => members.current.get(r.id)!);
            const ok = memberCount > 0 && verifyAgainstOnChainKey(signers, message, aggregateKey);
            setResult({
                aggregateKey: bytesToHex(aggregateKey),
                memberCount,
                ok,
                signerCount: signers.length,
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Verify failed');
        } finally {
            setBusy(null);
        }
    }

    const inCount = rows.filter(r => r.in).length;

    return (
        <div className="space-y-5 rounded-xl border bg-card p-5">
            <div>
                <h3 className="text-base font-semibold text-foreground">
                    Aggregate-key registry: members join and leave
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    The program keeps one aggregate BLS public key on-chain. Adding a member folds their key in with G2
                    addition (SIMD-0388); removing takes it back out with G2 subtraction — the op alt_bn128 doesn't
                    have. Then pick who signs a message and verify: it checks the aggregate signature against the
                    on-chain key, which only matches when the signers are exactly the current members.{' '}
                    <span className="text-sand-1000">
                        Verification runs off-chain — SIMD-0388 ships group ops only, no pairing syscall yet.
                    </span>
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                    <span className="text-xs font-medium text-sand-1100">Message</span>
                    <input
                        className="mt-1 block w-64 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onChange={e => setMessage(e.target.value)}
                        value={message}
                    />
                </label>
                <Button disabled={!wallet} loading={busy === 'add'} onClick={() => void addMember()} size="sm">
                    Add member
                </Button>
                <Button
                    disabled={!registry || rows.length === 0}
                    loading={busy === 'verify'}
                    onClick={() => void verify()}
                    size="sm"
                    variant="secondary"
                >
                    Verify signatures
                </Button>
            </div>

            {registry && (
                <div className="text-xs text-sand-1100">
                    registry {ellipsify(registry, 4)} · {inCount} active / {rows.length} total
                    {lastOp && lastOp.computeUnits != null && (
                        <>
                            {' '}
                            · last op {lastOp.label} ·{' '}
                            <span className="font-medium text-foreground">{lastOp.computeUnits.toLocaleString()}</span>{' '}
                            CU
                        </>
                    )}
                </div>
            )}

            {rows.length > 0 && (
                <div className="divide-y rounded-lg border bg-background">
                    {rows.map(row => (
                        <div className="flex items-center gap-3 px-3 py-2 text-sm" key={row.id}>
                            <span className="w-6 text-sand-1000">#{row.id + 1}</span>
                            <code className="flex-1 font-berkeley-mono text-xs break-all text-sand-1100">
                                {row.pubkey.slice(0, 16)}…
                            </code>
                            <Badge variant={row.in ? 'success' : 'default'}>{row.in ? 'in' : 'out'}</Badge>
                            <Button
                                loading={busy === `in-${row.id}`}
                                onClick={() => void toggleIn(row)}
                                size="sm"
                                variant="secondary"
                            >
                                {row.in ? 'Remove' : 'Add back'}
                            </Button>
                            <label className="flex items-center gap-1 text-xs text-sand-1100">
                                <input checked={row.sign} onChange={() => toggleSign(row.id)} type="checkbox" />
                                sign
                            </label>
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
                </div>
            )}
        </div>
    );
}
