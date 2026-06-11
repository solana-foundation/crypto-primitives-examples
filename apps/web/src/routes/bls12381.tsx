import { BlsRegistryDemo } from '@/components/bls-registry-demo';

export function Bls12381() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">BLS12-381 (SIMD-0388)</h1>
                <p className="text-muted-foreground">
                    Native group operations — add, subtract, scalar-mul — in both G1 and G2 on the 128-bit-security,
                    Ethereum-compatible BLS12-381 curve. The foundation for BLS signature aggregation and Alpenglow
                    consensus.
                </p>
            </header>
            <BlsRegistryDemo />
        </div>
    );
}
