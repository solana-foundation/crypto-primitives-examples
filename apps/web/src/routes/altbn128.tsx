import { DemoPanel } from '@/components/demo-panel';
import { demosForGroup } from '@/lib/primitives';

export function AltBn128() {
    const demos = demosForGroup('altbn128');
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">alt_bn128 G2 (SIMD-0302)</h1>
                <p className="text-muted-foreground">
                    Extends the existing BN254 syscall with native G2 point arithmetic. Previously only G1 ops, pairing,
                    and G2 compression existed — G2 add and scalar-mul had to be emulated client-side. Useful for
                    Groth16 verifiers and proof compression. Note: agave 4.0 ships add and scalar-mul only — there is no
                    G2 subtraction op (BLS12-381 has one).
                </p>
            </header>
            <div className="grid gap-5 lg:grid-cols-2">
                {demos.map(demo => (
                    <DemoPanel demo={demo} key={demo.id} />
                ))}
            </div>
        </div>
    );
}
