import { ExternalLink } from 'lucide-react';

import { SyscallTerm } from '@/components/glossary-term';
import { MultisigDemo } from '@/components/multisig-demo';

export function AltBn128() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
                BN254 pairing curve (alt_bn128 G2) (SIMD-0302)
            </h1>
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                    <p className="text-muted-foreground">
                        A program can now check that a whole group signed a message with one small combined signature
                        and one on-chain check, instead of verifying every member separately. BN254 is a curve Solana
                        already supports — but the piece needed to combine public keys this way was missing. This{' '}
                        <SyscallTerm>syscall</SyscallTerm> adds it.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">BLS multisigs</span> — any number of members, one 64-byte
                            aggregate signature (regardless of count), one on-chain pairing check (see the demo)
                        </li>
                        <li>
                            <span className="text-foreground">Oracle and bridge committees</span> — verify one aggregate
                            attestation from N nodes instead of N separate signatures
                        </li>
                    </ul>
                    <p className="text-sm text-sand-1100">
                        <span className="text-foreground">Security:</span> BN254 does not provide a full 128-bit
                        security level; treat it as roughly 100-bit and prefer BLS12-381 for new 128-bit designs when
                        BN254 compatibility is not required.
                    </p>
                    <a
                        className="inline-flex items-center gap-1 text-sm text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                        href="https://github.com/solana-foundation/crypto-primitives-examples/tree/main/program/src/instructions/altbn128_g2"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        View source <ExternalLink className="size-3.5" />
                    </a>
                </div>
                <div className="lg:col-span-2">
                    <MultisigDemo />
                </div>
            </div>
        </div>
    );
}
