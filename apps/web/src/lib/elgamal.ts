import { ristretto255 } from '@noble/curves/ed25519.js';

const Point = ristretto255.Point;

export const U64_MAX = (1n << 64n) - 1n;

export type ComparisonOp = 'eq' | 'gt' | 'lt';

export const COMPARISON_SYMBOL: Record<ComparisonOp, string> = { eq: '==', gt: '>', lt: '<' };

function scalarMulBase(k: bigint) {
    if (k === 0n) return Point.ZERO;
    return k > 0n ? Point.BASE.multiply(k) : Point.BASE.multiply(-k).negate();
}

/**
 * Homomorphically rewrites a twisted ElGamal ciphertext so that proving the
 * result is non-negative (or zero) proves the claimed comparison against the
 * original:
 *
 * - eq: C − claim·G encrypts (value − claim), zero iff value == claim
 * - gt: C − (claim+1)·G encrypts (value − claim − 1), in u64 range iff value > claim
 * - lt: (claim−1)·G − C encrypts (claim − value − 1), in u64 range iff value < claim;
 *   the whole ciphertext is negated, so the decrypt handle flips sign too
 */
/** Adds twisted ElGamal ciphertexts component-wise; the sum encrypts the sum of the amounts. */
export function sumCiphertexts(ciphertexts: Uint8Array[]): Uint8Array {
    const commitment = ciphertexts.map(ct => Point.fromBytes(ct.subarray(0, 32))).reduce((a, b) => a.add(b));
    const handle = ciphertexts.map(ct => Point.fromBytes(ct.subarray(32, 64))).reduce((a, b) => a.add(b));
    const out = new Uint8Array(64);
    out.set(commitment.toBytes(), 0);
    out.set(handle.toBytes(), 32);
    return out;
}

const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

function scalarFromLeBytes(bytes: Uint8Array): bigint {
    let out = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) out = (out << 8n) | BigInt(bytes[i]);
    return out % CURVE_ORDER;
}

/**
 * Decrypts a twisted ElGamal ciphertext by brute force over 0..max. Twisted
 * ElGamal keys satisfy P = s⁻¹·H, so the message point is C − s·D; recovering
 * the amount from it is a discrete log, only feasible for small values.
 */
export function decryptSmallAmount(secretKey: Uint8Array, ciphertext: Uint8Array, max: number): number | null {
    const commitment = Point.fromBytes(ciphertext.subarray(0, 32));
    const handle = Point.fromBytes(ciphertext.subarray(32, 64));
    const messagePoint = commitment.subtract(handle.multiply(scalarFromLeBytes(secretKey)));
    for (let m = 0n; m <= BigInt(max); m++) {
        const candidate = m === 0n ? Point.ZERO : Point.BASE.multiply(m);
        if (candidate.equals(messagePoint)) return Number(m);
    }
    return null;
}

export function shiftCiphertextForClaim(ciphertext: Uint8Array, claim: bigint, op: ComparisonOp): Uint8Array {
    const commitment = Point.fromBytes(ciphertext.subarray(0, 32));
    const handle = Point.fromBytes(ciphertext.subarray(32, 64));
    const out = new Uint8Array(64);
    if (op === 'lt') {
        out.set(
            scalarMulBase(claim - 1n)
                .subtract(commitment)
                .toBytes(),
            0,
        );
        out.set(handle.negate().toBytes(), 32);
        return out;
    }
    const shift = op === 'eq' ? claim : claim + 1n;
    out.set(commitment.subtract(scalarMulBase(shift)).toBytes(), 0);
    out.set(handle.toBytes(), 32);
    return out;
}
