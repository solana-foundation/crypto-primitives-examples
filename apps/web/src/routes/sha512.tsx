import { ExternalLink } from 'lucide-react';

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
                        <HashTerm>Hashing</HashTerm> already has native SHA-256, Keccak, and Blake3 paths on Solana.
                        SIMD-0512 proposes the missing SHA-512 counterpart: a <SyscallTerm>syscall</SyscallTerm> with
                        the same interface as the existing{' '}
                        <code className="font-berkeley-mono text-xs text-foreground">sol_sha256</code>, producing a
                        64-byte digest for a fraction of the compute a pure-BPF implementation costs.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what it would enable:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">Cheap on-chain hashing</span> —{' '}
                            <code className="font-berkeley-mono text-xs text-foreground">sol_sha512</code> would follow{' '}
                            <code className="font-berkeley-mono text-xs text-foreground">sol_sha256</code>&apos;s cost
                            model, so a short hash lands under 100 CU via syscall versus thousands computed in BPF
                        </li>
                        <li>
                            <span className="text-foreground">Interop with SHA-512 systems</span> — verify hashes,
                            commitments, or Merkle proofs from external systems that use SHA-512 (rather than SHA-256 or
                            Keccak)
                        </li>
                        <li>
                            <span className="text-foreground">Ed25519-adjacent checks</span> — SHA-512 is the hash used
                            inside Ed25519, so programs that need that same hashing step would get it natively
                        </li>
                    </ul>
                    <a
                        className="inline-flex items-center gap-1 text-sm text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                        href="https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0512-sha512-syscall.md"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        Read SIMD-0512 <ExternalLink className="size-3.5" />
                    </a>
                </div>
                <div className="lg:col-span-2">
                    <div className="space-y-3 rounded-xl border border-dashed bg-card p-6">
                        <span className="inline-flex items-center rounded-full bg-sand-200 px-2.5 py-0.5 text-xs font-medium text-sand-1100">
                            Coming soon
                        </span>
                        <h2 className="text-lg font-semibold text-foreground">No live demo yet</h2>
                        <p className="text-sm text-muted-foreground">
                            <code className="font-berkeley-mono text-xs text-foreground">sol_sha512</code> is proposed
                            in SIMD-0512 and tracked in the feature-gate registry, but it is not activated on any
                            cluster yet.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
