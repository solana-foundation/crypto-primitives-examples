import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit';

const SEED_KEY = 'crypto-primitives-demo-wallet-seed';

const viteEnv = import.meta.env as unknown as { readonly VITE_LOCAL_WALLET_SECRET?: string };

function randomSeedSigner(): Promise<KeyPairSigner> {
    const stored = localStorage.getItem(SEED_KEY);
    const seed = stored
        ? Uint8Array.from(atob(stored), c => c.charCodeAt(0))
        : crypto.getRandomValues(new Uint8Array(64));
    if (!stored) localStorage.setItem(SEED_KEY, btoa(String.fromCharCode(...seed)));
    return createKeyPairSignerFromBytes(seed);
}

let cached: Promise<KeyPairSigner> | null = null;

/**
 * The fee-payer for the demo's transactions. On localnet this is the
 * `local-wallet.json` keypair that `just localnet` already funds (injected via
 * `VITE_LOCAL_WALLET_SECRET`). Otherwise falls back to a random localStorage
 * burner. Localnet only — never a real key.
 */
export function getDemoWallet(): Promise<KeyPairSigner> {
    if (!cached) {
        const secret = viteEnv.VITE_LOCAL_WALLET_SECRET;
        cached = secret
            ? createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(secret) as number[]))
            : randomSeedSigner();
    }
    return cached;
}

interface AirdropRpc {
    getBalance(address: KeyPairSigner['address']): { send(): Promise<{ value: bigint }> };
    requestAirdrop(address: KeyPairSigner['address'], lamports: bigint): { send(): Promise<string> };
}

/** Tops the demo wallet up from the faucet only if it is running low. */
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
