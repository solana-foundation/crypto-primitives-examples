import { ElGamalDemo } from '@/components/elgamal-demo';

export function ElGamal() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">ZK ElGamal Proof (SIMD-0153)</h1>
                <p className="text-muted-foreground">
                    Unlike the two curve families, this isn't a syscall and isn't our program. The ZK ElGamal Proof
                    program is a native verifier that ships with the validator; proofs are generated client-side and
                    submitted for on-chain verification. It underpins Token-2022 confidential transfers — encrypted
                    balances you can still compute on.
                </p>
            </header>
            <div className="grid gap-5 lg:grid-cols-2">
                <ElGamalDemo />
            </div>
        </div>
    );
}
