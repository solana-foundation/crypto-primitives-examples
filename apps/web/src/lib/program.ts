import { CRYPTO_PRIMITIVES_PROGRAM_ADDRESS } from '@solana/crypto-primitives-client';
import type { Address } from '@solana/kit';

export function getProgramAddress(): Address {
    return (import.meta.env.VITE_PROGRAM_ID ?? CRYPTO_PRIMITIVES_PROGRAM_ADDRESS) as Address;
}
