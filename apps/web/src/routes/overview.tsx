import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';

interface PrimitiveRow {
    encoding: string;
    kind: string;
    name: string;
    ops: string;
    security: string;
    simd: string;
    status: string;
    to?: string;
}

const ROWS: PrimitiveRow[] = [
    {
        encoding: 'BE / LE',
        kind: 'syscall (sol_alt_bn128_group_op)',
        name: 'alt_bn128 G2',
        ops: 'add, scalar-mul',
        security: '~100-bit',
        simd: 'SIMD-0302',
        status: 'devnet',
        to: '/altbn128',
    },
    {
        encoding: 'Zcash BE',
        kind: 'syscall (sol_curve_group_op)',
        name: 'BLS12-381',
        ops: 'G1/G2 add, sub, scalar-mul',
        security: '128-bit',
        simd: 'SIMD-0388',
        status: 'devnet',
        to: '/bls12381',
    },
    {
        encoding: 'twisted ElGamal',
        kind: 'native program (ZkE1Gama1Proof111…)',
        name: 'ZK ElGamal',
        ops: 'verify ZK proofs',
        security: 'n/a',
        simd: 'SIMD-0153',
        status: 'mainnet (coming soon here)',
    },
];

export function Overview() {
    return (
        <div className="space-y-12">
            <section className="hero-entrance max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                    New cryptographic primitives landing in Agave
                </h1>
                <p className="text-lg text-muted-foreground">
                    Three new cryptographic capabilities shipped in the Solana validator — what each does, how they
                    differ, and what they make newly possible. Run them live on devnet and see the real compute-unit
                    cost of every operation.
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
                            <th className="px-4 py-3 font-medium">Security</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {ROWS.map(row => (
                            <tr className="border-b last:border-b-0" key={row.name}>
                                <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                                <td className="px-4 py-3 font-berkeley-mono text-xs text-sand-1100">{row.simd}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.kind}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.ops}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.security}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                                <td className="px-4 py-3">
                                    {row.to ? (
                                        <Link
                                            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                                            to={row.to}
                                        >
                                            Demo <ArrowRight className="h-3.5 w-3.5" />
                                        </Link>
                                    ) : (
                                        <span className="text-xs text-sand-900">soon</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section className="max-w-3xl space-y-2 text-sm text-muted-foreground">
                <p>
                    Compute units shown throughout are measured against an agave 4.0 runtime. The two curve families are
                    live on devnet; mainnet activation is still pending for the curve syscalls.
                </p>
            </section>
        </div>
    );
}
