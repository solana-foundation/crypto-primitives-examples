import { bls12_381 } from '@noble/curves/bls12-381.js';

// Short signatures: signatures in G1, public keys in G2 (what we aggregate on-chain).
const bls = bls12_381.shortSignatures;
const G1Point = bls12_381.G1.Point;
const G2Point = bls12_381.G2.Point;

export const REGISTRY_ADD_DISCRIMINATOR = 12;
export const REGISTRY_REMOVE_DISCRIMINATOR = 13;
export const REGISTRY_VERIFY_DISCRIMINATOR = 15;
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
 * Instruction data for the on-chain pairing check: discriminator + the signers'
 * aggregate signature (G1) + the negated hash of the message (G1). With no
 * signers the signature is the identity point, which the program rejects.
 */
export function verifyInstructionData(signingMembers: Member[], message: string): Uint8Array {
    const hashed = bls.hash(new TextEncoder().encode(message));
    const aggregateSignature =
        signingMembers.length === 0
            ? G1Point.ZERO
            : bls.aggregateSignatures(signingMembers.map(m => bls.sign(hashed, m.secretKey)));
    return new Uint8Array([
        REGISTRY_VERIFY_DISCRIMINATOR,
        ...aggregateSignature.toBytes(false),
        ...hashed.negate().toBytes(false),
    ]);
}
