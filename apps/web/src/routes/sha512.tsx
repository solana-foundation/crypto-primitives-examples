import { ExternalLink } from 'lucide-react';

import { SyscallTerm } from '@/components/glossary-term';

export function Sha512() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
                SHA-512 hash (SIMD-0512)
            </h1>
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                    <p className="text-muted-foreground">
                        Hashing is the one everyday primitive Solana programs still compute the slow way. This{' '}
                        <SyscallTerm>syscall</SyscallTerm> adds a native SHA-512 — the same interface as the existing{' '}
                        <code className="font-berkeley-mono text-xs text-foreground">sol_sha256</code> — producing a
                        64-byte digest for a fraction of the compute a pure-BPF implementation costs.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what it would enable:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">Cheap on-chain hashing</span> — a short SHA-512 costs
                            under 100 CU via the syscall, versus thousands computed in BPF
                        </li>
                        <li>
                            <span className="text-foreground">Interop with SHA-512 systems</span> — verify digests,
                            commitments, or Merkle proofs produced by chains and protocols that standardize on SHA-512
                        </li>
                        <li>
                            <span className="text-foreground">Ed25519-family checks</span> — SHA-512 is the hash inside
                            Ed25519, so programs reimplementing those steps get it natively
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
                            in SIMD-0512 with a feature gate reserved, but it is not activated on any cluster yet and
                            needs Agave v4.1+. There is nothing to call on-chain until then.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Once it activates, this page will hash an input both in the browser and on-chain and compare
                            the 64-byte digests alongside the real compute-unit cost — the same live,
                            against-a-validator format as the other demos.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
