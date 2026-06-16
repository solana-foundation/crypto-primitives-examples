import { ExternalLink } from 'lucide-react';

import { SyscallTerm } from '@/components/glossary-term';
import { BlsRegistryDemo } from '@/components/bls-registry-demo';

export function Bls12381() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
                BLS12-381 signature curve (SIMD-0388)
            </h1>
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                    <p className="text-muted-foreground">
                        BLS12-381 is the newer, stronger cousin of BN254 — the curve behind Ethereum consensus and
                        Solana's upcoming Alpenglow. This <SyscallTerm>syscall</SyscallTerm> family brings its core math
                        on-chain, on both halves of the curve (G1 and G2). Unlike alt_bn128 it includes subtraction, so
                        a program can take a key back out of a combined key as cheaply as it added it.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">Aggregate-key registries</span> — members join and leave,
                            the program stores one 192-byte key no matter how big the set gets (see the demo)
                        </li>
                    </ul>
                    <p className="text-sm text-sand-1100">
                        <span className="text-foreground">Security:</span> BLS12-381 is a bigger curve designed after
                        the attacks that weakened BN254, so it keeps the full 128 bits.
                    </p>
                    <a
                        className="inline-flex items-center gap-1 text-sm text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                        href="https://github.com/solana-foundation/crypto-primitives-examples/tree/main/program/src/instructions/bls12_381"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        View source <ExternalLink className="size-3.5" />
                    </a>
                </div>
                <div className="lg:col-span-2">
                    <BlsRegistryDemo />
                </div>
            </div>
        </div>
    );
}
