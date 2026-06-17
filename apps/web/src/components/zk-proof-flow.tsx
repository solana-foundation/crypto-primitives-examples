import { Connector, FlowDiagram, Stage, type StageState } from '@/components/flow-diagram';

export function ZkProofFlow({
    encryptLabel,
    failLabel,
    passLabel,
    prepared,
    result,
    running,
}: {
    encryptLabel: string;
    failLabel: string;
    passLabel: string;
    prepared: boolean;
    result: { ok: boolean } | null;
    running: boolean;
}) {
    const stage1: StageState = prepared || running || result ? 'done' : 'idle';
    const stage2: StageState = running ? 'active' : result ? 'done' : 'idle';
    const stage3: StageState = result ? (result.ok ? 'pass' : 'fail') : 'idle';

    return (
        <FlowDiagram title="What happens on-chain">
            <Stage location="off-chain" n={1} state={stage1} title="Encrypt in your browser">
                {encryptLabel}
            </Stage>
            <Connector>build a zero-knowledge proof about it</Connector>
            <Stage location="on-chain" n={2} state={stage2} title="Send the proof">
                proof bytes → ZK ElGamal verifier program (nothing else is sent)
            </Stage>
            <Connector>the program checks the proof</Connector>
            <Stage location="on-chain" n={3} state={stage3} title="Verified — no state stored">
                {result
                    ? result.ok
                        ? passLabel
                        : failLabel
                    : 'the program verifies and writes no account state — your secret value never leaves the browser'}
            </Stage>
        </FlowDiagram>
    );
}
