import { Tab, TabList, TabPanel, Tabs } from '@solana/design-system';

import { BallotDemo } from '@/components/ballot-demo';
import { ElGamalDemo } from '@/components/elgamal-demo';

export function ElGamal() {
    return (
        <div className="space-y-8">
            <header className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">ZK ElGamal Proof (SIMD-0153)</h1>
                <p className="text-muted-foreground">
                    Unlike the two curve pages, this isn't a syscall and there's no custom program — the validator ships
                    with a built-in verifier for zero-knowledge proofs over encrypted data. You encrypt a value, prove
                    something about it without revealing it, and the chain checks the proof natively.
                </p>
                <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>
                        <span className="text-foreground">Confidential transfers</span> — Token-2022 hides amounts and
                        balances while the chain still validates every transfer
                    </li>
                    <li>
                        <span className="text-foreground">Encrypted-balance apps</span> — prove statements about
                        encrypted values without ever decrypting them (the demos below)
                    </li>
                    <li>
                        <span className="text-foreground">Zero-balance checks</span> — prove an encrypted balance is
                        exactly zero, the check that gates closing a confidential token account
                    </li>
                </ul>
            </header>
            <Tabs defaultValue="compare">
                <TabList>
                    <Tab value="compare">Compare a hidden number</Tab>
                    <Tab value="ballot">Private ballot</Tab>
                </TabList>
                <TabPanel className="mt-4" keepMounted value="compare">
                    <ElGamalDemo />
                </TabPanel>
                <TabPanel className="mt-4" keepMounted value="ballot">
                    <BallotDemo />
                </TabPanel>
            </Tabs>
        </div>
    );
}
