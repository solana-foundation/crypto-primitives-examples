import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from '@solana/kit';

const SEED_KEY = 'crypto-primitives-demo-wallet-seed';

function loadOrCreateSeed(): Uint8Array {
    const stored = localStorage.getItem(SEED_KEY);
    if (stored) {
        return Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    }
    const seed = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(SEED_KEY, btoa(String.fromCharCode(...seed)));
    return seed;
}

let cached: Promise<KeyPairSigner> | null = null;

/**
 * A throwaway fee-payer kept in localStorage — used only to pay for the demo's
 * transactions on localnet. Not a real wallet; it just needs lamports from the
 * faucet so the demo can run without a browser wallet.
 */
export function getDemoWallet(): Promise<KeyPairSigner> {
    if (!cached) {
        cached = createKeyPairSignerFromPrivateKeyBytes(loadOrCreateSeed());
    }
    return cached;
}

interface AirdropRpc {
    getBalance(address: KeyPairSigner['address']): { send(): Promise<{ value: bigint }> };
    requestAirdrop(address: KeyPairSigner['address'], lamports: bigint): { send(): Promise<string> };
}

/** Tops the demo wallet up from the faucet if it is running low (localnet only). */
export async function ensureFunded(rpc: AirdropRpc, signer: KeyPairSigner, minSol = 5): Promise<void> {
    const balance = (await rpc.getBalance(signer.address).send()).value;
    if (balance >= BigInt(minSol) * 1_000_000_000n) return;

    await rpc.requestAirdrop(signer.address, 100n * 1_000_000_000n).send();
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if ((await rpc.getBalance(signer.address).send()).value > 0n) return;
    }
    throw new Error('Faucet airdrop did not confirm — is the local validator running?');
}
