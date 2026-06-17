import type { ReactNode } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';

import { cn } from '@/lib/utils';

export type StageState = 'active' | 'done' | 'fail' | 'idle' | 'pass';

const STAGE_STYLES: Record<StageState, string> = {
    active: 'border-foreground/40 bg-accent',
    done: 'border-border bg-card',
    fail: 'border-destructive/40 bg-destructive/10',
    idle: 'border-border bg-card opacity-60',
    pass: 'border-[var(--badge-success-bg)] bg-[var(--badge-success-bg)]/10',
};

export function FlowDiagram({ children, title }: { children: ReactNode; title: string }) {
    return (
        <div className="space-y-2 rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold tracking-wide text-sand-1100 uppercase">{title}</h3>
            {children}
        </div>
    );
}

export function Stage({
    children,
    location,
    n,
    state,
    title,
}: {
    children: ReactNode;
    location: string;
    n: number;
    state: StageState;
    title: string;
}) {
    return (
        <div className={cn('rounded-lg border px-3 py-2 transition-colors', STAGE_STYLES[state])}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-sand-200 text-[10px] font-medium text-sand-1100">
                        {n}
                    </span>
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    {state === 'active' && (
                        <span className="size-1.5 rounded-full bg-foreground motion-safe:animate-pulse" />
                    )}
                </div>
                <span className="text-[10px] tracking-wide text-sand-900 uppercase">{location}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
        </div>
    );
}

export function Connector({ children, loop = false }: { children: ReactNode; loop?: boolean }) {
    const Icon = loop ? Repeat : ChevronDown;
    return (
        <div className={cn('flex items-center gap-2 pl-2 text-[11px]', loop ? 'text-foreground/70' : 'text-sand-1000')}>
            <Icon className="size-3.5 shrink-0" />
            <span>{children}</span>
        </div>
    );
}
