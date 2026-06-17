import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowRight, ChevronRight, Info } from 'lucide-react';

import { PairingTerm, SyscallTerm } from '@/components/glossary-term';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PrimitiveRow {
    comingSoon?: boolean;
    encoding: string;
    example: string;
    featureKey: string;
    kind: string;
    name: string;
    ops: string;
    security: string;
    simd: string;
    simdUrl: string;
    status: string;
    to?: string;
    uses: string[];
}

const SIMD_BASE = 'https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/';

const FEATURE_GATES_URL =
    'https://raw.githubusercontent.com/solana-foundation/explorer/master/app/entities/feature-gate/feature-gates.json';

interface FeatureGateEntry {
    devnet_activation_epoch: number | null;
    key: string;
    mainnet_activation_epoch: number | null;
    testnet_activation_epoch: number | null;
}

function activationStatus(entry: FeatureGateEntry | undefined): string | null {
    if (!entry) return null;
    if (entry.mainnet_activation_epoch != null) return 'mainnet';
    if (entry.devnet_activation_epoch != null) return 'devnet';
    if (entry.testnet_activation_epoch != null) return 'testnet';
    return 'pending';
}

function useFeatureGates() {
    return useQuery({
        queryFn: async (): Promise<FeatureGateEntry[]> => {
            const response = await fetch(FEATURE_GATES_URL);
            if (!response.ok) throw new Error(`feature gates fetch failed: ${response.status}`);
            return (await response.json()) as FeatureGateEntry[];
        },
        queryKey: ['feature-gates'],
        staleTime: Infinity,
    });
}

const ROWS: PrimitiveRow[] = [
    {
        encoding: 'BE / LE',
        example: 'Prove a whole group signed a message with one signature and one on-chain check.',
        featureKey: 'bn1hKNURMGQaQoEVxahcEAcqiX3NwRs6hgKKNSLeKxH',
        kind: 'Syscall',
        name: 'BN254 pairing curve',
        ops: 'Point add, scalar multiply',
        security: '~100-bit',
        simd: 'SIMD-0302',
        simdUrl: `${SIMD_BASE}0302-bn254-g2-syscalls.md`,
        status: 'mainnet',
        to: '/altbn128',
        uses: [
            'BLS multisigs — any number of members, one 64-byte signature, one on-chain check',
            'Oracle & bridge committees — one aggregate attestation instead of N signatures',
        ],
    },
    {
        encoding: 'Zcash BE',
        example: 'Keep one combined group key on-chain and add or remove members anytime.',
        featureKey: 'b1sgUiJ3qu7hYm3tNDyyqZNQd6gLGJmJppnLNa93PCQ',
        kind: 'Syscall',
        name: 'BLS12-381 signature curve',
        ops: 'Add, subtract, scalar multiply (G1 & G2)',
        security: '128-bit',
        simd: 'SIMD-0388',
        simdUrl: `${SIMD_BASE}0388-bls12-381-syscalls.md`,
        status: 'devnet',
        to: '/bls12381',
        uses: ['Aggregate-key registries — members join or leave; the stored key stays one 192-byte point'],
    },
    {
        encoding: 'twisted ElGamal',
        example: 'Prove a fact about an encrypted value without revealing the value.',
        featureKey: 'zkhiy5oLowR7HY4zogXjCjeMXyruLqBwSWH21qcFtnv',
        kind: 'Native program',
        name: 'Zero Knowledge ElGamal proofs',
        ops: 'Verify ZK proofs',
        security: 'n/a',
        simd: 'SIMD-0153',
        simdUrl: `${SIMD_BASE}0153-elgamal-proof-program.md`,
        status: 'mainnet',
        to: '/elgamal',
        uses: [
            'Confidential transfers — Token-2022 hides amounts while the chain validates them',
            'Encrypted-balance apps — prove statements about encrypted values without decrypting',
        ],
    },
    {
        comingSoon: true,
        encoding: 'n/a',
        example: 'Hash data with native SHA-512 on-chain — a 64-byte output for under 100 CU.',
        featureKey: 's512oDwgx8hjMnaQjXfqqrZroVj4HvC6TkN3iSSWXCh',
        kind: 'Syscall',
        name: 'SHA-512 hash',
        ops: 'SHA-512 hash (64-byte output)',
        security: 'n/a',
        simd: 'SIMD-0512',
        simdUrl: `${SIMD_BASE}0512-sha512-syscall.md`,
        status: 'pending',
        to: '/sha512',
        uses: [
            'Cheap on-chain hashing — under 100 CU via the syscall vs thousands computed in BPF',
            'Interop with SHA-512 systems — verify hashes or proofs from chains that standardize on SHA-512',
        ],
    },
];

function renderPrimitiveName(name: string) {
    const term = 'pairing curve';
    const index = name.indexOf(term);
    if (index === -1) return name;
    return (
        <>
            {name.slice(0, index)}
            <PairingTerm>{term}</PairingTerm>
            {name.slice(index + term.length)}
        </>
    );
}

export function Overview() {
    const { data: featureGates } = useFeatureGates();
    const [expanded, setExpanded] = useState<string | null>(null);
    return (
        <div className="space-y-12">
            <section className="hero-entrance max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                    Cryptographic primitives in Agave
                </h1>
                <p className="text-lg text-muted-foreground">
                    Recent additions to the Solana validator's cryptography — curve, <PairingTerm>pairing</PairingTerm>,
                    and zero-knowledge primitives. What each does, how they differ, what they unlock.
                </p>
            </section>

            <section className="max-w-3xl space-y-3 rounded-xl border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">New to this?</h2>
                <p className="text-sm text-muted-foreground">
                    These are just hard math problems the Solana validator solves for you — the kind a program could
                    never afford to work out itself on-chain. Things like proving a big group signed off on something
                    with one signature (
                    <PairingTerm>
                        <em>pairing</em>
                    </PairingTerm>
                    , on an elliptic <em>curve</em>), or proving a number is valid without showing it (
                    <em>zero-knowledge</em>).
                </p>
                <p className="text-sm text-muted-foreground">
                    A program calls them like built-in functions (<em>syscalls</em>) and gets a fast, cheap answer. Here
                    are the three newest.
                </p>
            </section>

            <section className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs tracking-wide text-sand-1100 uppercase">
                            <th className="px-4 py-3 font-medium">Primitive</th>
                            <th className="px-4 py-3 font-medium">SIMD</th>
                            <th className="px-4 py-3 font-medium">Kind</th>
                            <th className="px-4 py-3 font-medium">Operations</th>
                            <th className="px-4 py-3 font-medium">
                                <span className="inline-flex items-center gap-1">
                                    Security
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                aria-label="What does n-bit security mean?"
                                                className="text-sand-900 transition-colors hover:text-foreground"
                                                type="button"
                                            >
                                                <Info className="size-3.5" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            n-bit security means the best known attack needs about 2<sup>n</sup>{' '}
                                            operations — anything near 100 bits is far beyond reach.
                                        </TooltipContent>
                                    </Tooltip>
                                </span>
                            </th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {ROWS.map(row => {
                            const isOpen = expanded === row.name;
                            return (
                                <Fragment key={row.name}>
                                    <tr className={cn(!isOpen && 'border-b last:border-b-0')}>
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            <button
                                                aria-controls={isOpen ? `detail-${row.simd}` : undefined}
                                                aria-expanded={isOpen}
                                                className="inline-flex items-center gap-1.5 text-left hover:text-foreground"
                                                onClick={() => setExpanded(isOpen ? null : row.name)}
                                                type="button"
                                            >
                                                <ChevronRight
                                                    className={cn(
                                                        'size-3.5 shrink-0 text-sand-900 transition-transform',
                                                        isOpen && 'rotate-90',
                                                    )}
                                                />
                                                {renderPrimitiveName(row.name)}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 font-berkeley-mono text-xs">
                                            <a
                                                className="text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                                                href={row.simdUrl}
                                                rel="noopener noreferrer"
                                                target="_blank"
                                            >
                                                {row.simd}
                                            </a>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {row.kind === 'Syscall' ? <SyscallTerm>{row.kind}</SyscallTerm> : row.kind}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{row.ops}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{row.security}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {activationStatus(featureGates?.find(f => f.key === row.featureKey)) ??
                                                row.status}
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.to ? (
                                                <Link
                                                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                                                    to={row.to}
                                                >
                                                    {row.comingSoon ? 'Coming soon' : 'Demo'}{' '}
                                                    <ArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-sand-900">soon</span>
                                            )}
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr className="border-b last:border-b-0" id={`detail-${row.simd}`}>
                                            <td className="px-4 pt-0 pb-4" colSpan={7}>
                                                <div className="space-y-2 pl-5 text-sm">
                                                    <p className="text-foreground">{row.example}</p>
                                                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                                        {row.uses.map(use => (
                                                            <li key={use}>{use}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
