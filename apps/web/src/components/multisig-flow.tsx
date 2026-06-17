import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';

export function MultisigFlow({
    hasMultisig,
    memberCount,
    phase,
    result,
    signerCount,
}: {
    hasMultisig: boolean;
    memberCount: number;
    phase: 'creating' | 'idle' | 'ready' | 'verifying';
    result: { ok: boolean } | null;
    signerCount: number;
}) {
    const stage1: StageState = phase === 'idle' && !hasMultisig ? 'idle' : 'done';
    const stage2: StageState = phase === 'creating' ? 'active' : hasMultisig ? 'done' : 'idle';
    const stage3: StageState = phase === 'verifying' ? 'active' : result ? (result.ok ? 'pass' : 'fail') : 'idle';

    return (
        <FlowDiagram title="What happens on-chain">
            <Stage location="off-chain" n={1} state={stage1} title="Member keys">
                {memberCount} BLS keypairs, generated in your browser
            </Stage>
            <Connector>register · each key stored on-chain</Connector>
            <Stage location="on-chain" n={2} state={stage2} title="Member keys stored">
                all member keys kept on-chain — the full set, not yet combined
            </Stage>
            <Connector>chosen signers sign the message → one aggregate signature</Connector>
            <Stage location="on-chain" n={3} state={stage3} title="One pairing check">
                {result
                    ? result.ok
                        ? `✓ all ${memberCount} signed`
                        : `✗ only ${signerCount} of ${memberCount} signed — rejected`
                    : 'folds the stored keys with G2 addition, then one pairing check — passes only if every member signed'}
            </Stage>
        </FlowDiagram>
    );
}
