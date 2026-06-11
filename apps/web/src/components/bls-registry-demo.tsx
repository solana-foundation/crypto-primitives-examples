import { useEffect, useRef, useState } from 'react';
import { getCreateAccountInstruction } from '@solana-program/system';
import { Badge, Button } from '@solana/design-system';
import { AccountRole, type Address, generateKeyPairSigner, type Instruction, type KeyPairSigner } from '@solana/kit';

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import {
    generateMember,
    type Member,
    memberInstructionData,
    REGISTRY_ACCOUNT_SIZE,
    REGISTRY_ADD_DISCRIMINATOR,
    REGISTRY_REMOVE_DISCRIMINATOR,
    verifyAgainstOnChainKey,
} from '@/lib/bls12381';
import { ensureFunded, getDemoWallet } from '@/lib/demo-wallet';
import { base64ToBytes, bytesToHex } from '@/lib/hex';
import { getProgramAddress } from '@/lib/program';
import { ellipsify } from '@/lib/utils';
import { useRpc } from '@/hooks/useRpc';

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

export function BlsRegistryDemo() {
    const rpc = useRpc();
    const signAndSend = useWalletTransactionSignAndSend();

    const [wallet, setWallet] = useState<KeyPairSigner | null>(null);
    const [registry, setRegistry] = useState<Address | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [message, setMessage] = useState('approve proposal #42');
    const [busy, setBusy] = useState<string | null>(null);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const members = useRef(new Map<number, Member>());
    const nextId = useRef(0);

    useEffect(() => {
        getDemoWallet()
            .then(setWallet)
            .catch(() => undefined);
    }, []);

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

    async function addMember() {
        if (!wallet) return;
        setBusy('add');
        setError(null);
        setResult(null);
        try {
            await ensureFunded(rpc, wallet);
            const registryAddress = await ensureRegistry(wallet);
            const member = generateMember();
            await signAndSend([instructionFor(member, registryAddress, REGISTRY_ADD_DISCRIMINATOR)], wallet);
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
            await signAndSend([instructionFor(member, registry, discriminator)], wallet);
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
                        className="mt-1 w-64 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
