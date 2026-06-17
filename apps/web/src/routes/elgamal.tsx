import { Tab, TabList, TabPanel, Tabs } from '@solana/design-system';
import { ExternalLink } from 'lucide-react';

import { SyscallTerm } from '@/components/glossary-term';
import { BallotDemo } from '@/components/ballot-demo';
import { ElGamalDemo } from '@/components/elgamal-demo';

export function ElGamal() {
    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
                Zero Knowledge ElGamal proofs (ZK ElGamal) (SIMD-0153)
            </h1>
            <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
                    <p className="text-muted-foreground">
                        Encrypt a value with ElGamal, then prove a fact about it — that it equals some number, or falls
                        in a range — without ever revealing the value itself. The chain verifies the proof and accepts
                        the fact while the number stays hidden. That's a zero-knowledge proof: it confirms a statement
                        without exposing the data behind it.
                    </p>
                    <p className="text-muted-foreground">
                        Unlike BN254 and BLS12-381, this isn't a <SyscallTerm>syscall</SyscallTerm> and there is no
                        verifier program in this repository. Solana exposes a native built-in ZK ElGamal Proof program
                        that verifies these proofs.
                    </p>
                    <p className="text-muted-foreground">Here are some examples of what is now possible on Solana:</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        <li>
                            <span className="text-foreground">Confidential transfers</span> — Token-2022 hides amounts
                            and balances while the chain still validates every transfer
                        </li>
                        <li>
                            <span className="text-foreground">Encrypted-balance apps</span> — prove statements about
                            encrypted values without ever decrypting them (see the demos)
                        </li>
                        <li>
                            <span className="text-foreground">Zero-balance checks</span> — prove an encrypted balance is
                            exactly zero, which is useful for empty-balance and close-account flows
                        </li>
                    </ul>
                    <a
                        className="inline-flex items-center gap-1 text-sm text-sand-1100 underline decoration-sand-700 underline-offset-2 hover:text-foreground"
                        href="https://github.com/solana-foundation/crypto-primitives-examples/blob/main/apps/web/src/lib/elgamal.ts"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        View source <ExternalLink className="size-3.5" />
                    </a>
                </div>
                <div className="lg:col-span-2">
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
            </div>
        </div>
    );
}
