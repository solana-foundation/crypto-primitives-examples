import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function GlossaryTerm({ children, definition }: { children: ReactNode; definition: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted decoration-sand-700 underline-offset-2">
                    {children}
                </span>
            </TooltipTrigger>
            <TooltipContent>{definition}</TooltipContent>
        </Tooltip>
    );
}

const SYSCALL_DEFINITION =
    'A built-in validator function a program calls directly, instead of computing the heavy math itself.';

export function SyscallTerm({ children }: { children: ReactNode }) {
    return <GlossaryTerm definition={SYSCALL_DEFINITION}>{children}</GlossaryTerm>;
}

const PAIRING_DEFINITION =
    'A curve is just a set of (x, y) points; a key or signature is one point on it. Pairing is a special check that two points correspond — the trick that lets one signature prove a whole group signed.';

export function PairingTerm({ children }: { children: ReactNode }) {
    return <GlossaryTerm definition={PAIRING_DEFINITION}>{children}</GlossaryTerm>;
}

const HASH_DEFINITION =
    'A one-way function: any input produces a fixed-size output you cannot reverse, and it is infeasible to find two inputs that produce the same output (a collision).';

export function HashTerm({ children }: { children: ReactNode }) {
    return <GlossaryTerm definition={HASH_DEFINITION}>{children}</GlossaryTerm>;
}

const BLS_DEFINITION =
    'A signature scheme where many public keys add into one key, and many signatures add into one signature — so a whole group verifies as cheaply as a single signer.';

export function BlsTerm({ children }: { children: ReactNode }) {
    return <GlossaryTerm definition={BLS_DEFINITION}>{children}</GlossaryTerm>;
}
