import { DemoPanel } from '@/components/demo-panel';
import { demosForGroup } from '@/lib/primitives';

export function Bls12381() {
    const demos = demosForGroup('bls12381');
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">BLS12-381 (SIMD-0388)</h1>
                <p className="text-muted-foreground">
                    A new syscall family exposing group operations — add, subtract, scalar-mul — in both G1 and G2 on
                    the 128-bit-security, Ethereum-compatible BLS12-381 curve. Foundation for BLS signature aggregation
                    and Alpenglow consensus. This SIMD ships group ops only — no pairing or hash-to-curve yet.
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
