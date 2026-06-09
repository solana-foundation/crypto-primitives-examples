import { bls12_381 } from '@noble/curves/bls12-381.js';

// Short signatures: signatures in G1, public keys in G2 (what we aggregate on-chain).
const bls = bls12_381.shortSignatures;
const G2Point = bls12_381.G2.Point;

export const REGISTRY_ADD_DISCRIMINATOR = 12;
export const REGISTRY_REMOVE_DISCRIMINATOR = 13;
export const G2_POINT_BYTES = 192;
export const REGISTRY_ACCOUNT_SIZE = 2 + G2_POINT_BYTES;

export interface Member {
    /** Uncompressed G2 public key (192 bytes), hex — what's stored/added on-chain. */
    pubkey: string;
    secretKey: Uint8Array;
}

function hex(bytes: Uint8Array): string {
    let out = '';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
}
function toBytes(h: string): Uint8Array {
    return Uint8Array.from(h.match(/../g)!.map(b => parseInt(b, 16)));
}

export function generateMember(): Member {
    const { publicKey, secretKey } = bls.keygen();
    return { pubkey: hex(publicKey.toBytes(false)), secretKey };
}

export function memberSecret(member: Member): string {
    return hex(member.secretKey);
}

export function restoreMember(secret: string): Member {
    const secretKey = toBytes(secret);
    return { pubkey: hex(bls.getPublicKey(secretKey).toBytes(false)), secretKey };
}

/** Instruction data to add/remove a member's key: discriminator + uncompressed G2. */
export function memberInstructionData(member: Member, discriminator: number): Uint8Array {
    return new Uint8Array([discriminator, ...toBytes(member.pubkey)]);
}

/** Aggregates the members' public keys off-chain (G2 addition), uncompressed hex. */
export function aggregatePubkeys(members: Member[]): string {
    if (members.length === 0) return '';
    const aggregate = bls.aggregatePublicKeys(members.map(m => G2Point.fromBytes(toBytes(m.pubkey))));
    return hex(aggregate.toBytes(false));
}

/**
 * Off-chain BLS verification (SIMD-0388 has no pairing syscall): aggregates the
 * signing members' signatures and checks them against the aggregate key read
 * from the on-chain account. Passes only if the signing set equals the on-chain
 * member set.
 */
export function verifyAgainstOnChainKey(
    signingMembers: Member[],
    message: string,
    onChainAggregateKey: Uint8Array,
): boolean {
    if (signingMembers.length === 0) return false;
    const hashed = bls.hash(new TextEncoder().encode(message));
    const aggregateSignature = bls.aggregateSignatures(signingMembers.map(m => bls.sign(hashed, m.secretKey)));
    const onChainKey = G2Point.fromBytes(onChainAggregateKey);
    return bls.verify(aggregateSignature, hashed, onChainKey);
}
