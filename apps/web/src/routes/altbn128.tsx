import { BlsAggregateDemo } from '@/components/bls-aggregate-demo';
import { DemoPanel } from '@/components/demo-panel';
import { demosForGroup } from '@/lib/primitives';

export function AltBn128() {
    const demos = demosForGroup('altbn128');
    return (
        <div className="space-y-10">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">alt_bn128 G2 (SIMD-0302)</h1>
                <p className="text-muted-foreground">
                    Native G2 point arithmetic on BN254 — add and scalar-mul. The missing piece that lets you combine G2
                    elements on-chain (the curve already had G1 ops and pairings). Below: a real use case it unlocks,
                    then the raw operations for developers.
                </p>
            </header>

            <section className="space-y-3">
                <h2 className="text-sm font-medium tracking-wide text-sand-1100 uppercase">What it unlocks</h2>
                <BlsAggregateDemo />
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-medium tracking-wide text-sand-1100 uppercase">The raw operations</h2>
                <div className="grid gap-5 lg:grid-cols-2">
                    {demos.map(demo => (
                        <DemoPanel demo={demo} key={demo.id} />
                    ))}
                </div>
            </section>
        </div>
    );
}
