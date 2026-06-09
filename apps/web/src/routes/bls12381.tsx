import { BlsRegistryDemo } from '@/components/bls-registry-demo';

export function Bls12381() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">BLS12-381 (SIMD-0388)</h1>
                <p className="text-muted-foreground">
                    BLS12-381 is the newer, stronger cousin of BN254 — the curve behind Ethereum consensus and Solana's
                    upcoming Alpenglow. This syscall family brings its core math on-chain, on both halves of the curve
                    (G1 and G2). Unlike alt_bn128 it includes subtraction, so a program can take a key back out of a
                    combined key as cheaply as it added it.
                </p>
                <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>
                        <span className="text-foreground">Aggregate-key registries</span> — members join and leave, the
                        program stores one 192-byte key no matter how big the set gets (the demo below)
                    </li>
                </ul>
            </header>
            <BlsRegistryDemo />
        </div>
    );
}
