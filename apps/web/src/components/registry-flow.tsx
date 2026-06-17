import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';

export function RegistryFlow({
    busy,
    hasRegistry,
    memberCount,
    result,
}: {
    busy: string | null;
    hasRegistry: boolean;
    memberCount: number;
    result: { ok: boolean } | null;
}) {
    const stage1: StageState = !hasRegistry && memberCount === 0 ? 'idle' : busy === 'add' ? 'active' : 'done';
    const stage2: StageState = busy === 'add' || busy?.startsWith('in-') ? 'active' : hasRegistry ? 'done' : 'idle';
    const stage3: StageState = busy === 'verify' ? 'active' : result ? (result.ok ? 'pass' : 'fail') : 'idle';

    return (
        <FlowDiagram title="How it works">
            <Stage location="off-chain" n={1} state={stage1} title="Member keys">
                BLS keypairs in your browser — members join or leave anytime
            </Stage>
            <Connector>join · G2 add · leave · G2 subtract</Connector>
            <Stage location="on-chain" n={2} state={stage2} title="One aggregate key">
                always a single stored key, no matter how big the set gets
            </Stage>
            <Connector>chosen signers' keys aggregated off-chain</Connector>
            <Connector loop>add, remove, and verify in any order — repeat anytime</Connector>
            <Stage location="off-chain" n={3} state={stage3} title="Verify">
                {result
                    ? result.ok
                        ? '✓ signer set matches the registry'
                        : "✗ signers don't match the stored key"
                    : "signers' aggregate vs the stored key (verified off-chain)"}
            </Stage>
        </FlowDiagram>
    );
}
