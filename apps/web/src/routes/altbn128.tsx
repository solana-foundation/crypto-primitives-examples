import { MultisigDemo } from '@/components/multisig-demo';

export function AltBn128() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">alt_bn128 G2 (SIMD-0302)</h1>
                <p className="text-muted-foreground">
                    BN254 is the curve Solana programs already use for ZK proof verification, but only half of it was
                    exposed. This syscall adds the other half (G2) — the math for combining public keys. A program can
                    now check that a whole group signed something with one small signature and one check, instead of
                    verifying everyone individually.
                </p>
                <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>
                        <span className="text-foreground">BLS multisigs</span> — any number of members, one 64-byte
                        signature on the transaction, one on-chain check (the demo below)
                    </li>
                    <li>
                        <span className="text-foreground">Oracle and bridge committees</span> — verify one aggregate
                        attestation from N nodes instead of N separate signatures
                    </li>
                    <li>
                        <span className="text-foreground">Ethereum-compatible ZK tooling</span> — same curve as
                        Ethereum's precompiles, so Groth16/PLONK verification keys and circuits carry over
                    </li>
                </ul>
            </header>
            <MultisigDemo />
        </div>
    );
}
