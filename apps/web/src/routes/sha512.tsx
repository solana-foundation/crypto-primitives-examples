import { ExternalLink } from 'lucide-react';

import { Ed25519Demo } from '@/components/ed25519-demo';
import { HashTerm, SyscallTerm } from '@/components/glossary-term';

export function Sha512() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
                SHA-512 hash (SIMD-0512)
            </h1>
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                    <p className="text-muted-foreground">
                        Every Solana wallet signs with Ed25519, and Ed25519 is built on the SHA-512{' '}
                        <HashTerm>hash</HashTerm>. Until now, programs could not check those signatures themselves: they
                        relied on the Ed25519 precompile, a built-in checker that lives outside the program.
                    </p>
                    <p className="text-muted-foreground">
                        SIMD-0568 proposes removing the precompiles because they are rigid and hard to use safely. The
                        new <code className="font-berkeley-mono text-xs text-foreground">sol_sha512</code>{' '}
                        <SyscallTerm>syscall</SyscallTerm>, combined with the existing curve25519 syscalls, is what
                        replaces them: the program verifies the signature itself.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">Signed permissions</span>: a user signs off-chain and
                            anyone can submit it; the program checks who signed (see the demo)
                        </li>
                        <li>
                            <span className="text-foreground">Composable checks</span>: verification works inside calls
                            from other programs and on data read from accounts, which the precompile cannot do
                        </li>
                    </ul>
                    <a
                        className="inline-flex items-center gap-1 text-sm text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                        href="https://github.com/solana-foundation/crypto-primitives-examples/tree/main/program/src/instructions/ed25519"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        View source <ExternalLink className="size-3.5" />
                    </a>
                </div>
                <div className="lg:col-span-2">
                    <Ed25519Demo />
                </div>
            </div>
        </div>
    );
}
