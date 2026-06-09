import { BlsAggregateDemo } from '@/components/bls-aggregate-demo';

export function AltBn128() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">alt_bn128 G2 (SIMD-0302)</h1>
                <p className="text-muted-foreground">
                    Native G2 point arithmetic on BN254 — adding and scalar-multiplying G2 points on-chain. The curve
                    already had G1 ops and pairings; this is the missing piece that makes BLS-style signature
                    aggregation possible directly in a program.
                </p>
            </header>
            <BlsAggregateDemo />
        </div>
    );
}
