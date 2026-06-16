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
