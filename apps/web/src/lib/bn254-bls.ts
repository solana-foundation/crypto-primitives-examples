import * as mcl from 'mcl-wasm';

// Canonical BN254 G2 generator, big-endian (matches the program's hardcoded value).
const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

export const G2_POINT_BYTES = 128;
export const ADD_SIGNERS_DISCRIMINATOR = 10;
export const VERIFY_DISCRIMINATOR = 11;
// Each pubkey is 128 bytes; keep chunks comfortably under the 1232-byte tx limit.
export const MAX_KEYS_PER_TX = 7;

let ready: Promise<void> | null = null;
function init(): Promise<void> {
    if (!ready) ready = mcl.init(mcl.BN_SNARK1);
    return ready;
}

const be32 = (n: string) => n.padStart(64, '0');
const chunks32 = (h: string) => h.match(/.{64}/g) ?? [];
function bytes(hex: string): Uint8Array {
    return Uint8Array.from(hex.match(/../g)!.map(b => parseInt(b, 16)));
}

// agave G2 (BE) = x.c1 | x.c0 | y.c1 | y.c0 ; mcl getStr = "<flag> x.c0 x.c1 y.c0 y.c1"
function g2ToAgave(p: mcl.G2): string {
    const [, x0, x1, y0, y1] = p.getStr(16).split(' ');
    return be32(x1) + be32(x0) + be32(y1) + be32(y0);
}
function g2FromAgave(hex: string): mcl.G2 {
    const [x1, x0, y1, y0] = chunks32(hex);
    const p = new mcl.G2();
    p.setStr(`1 0x${x0} 0x${x1} 0x${y0} 0x${y1}`, 16);
    return p;
}
function g1ToAgave(p: mcl.G1): string {
    const [, x, y] = p.getStr(16).split(' ');
    return be32(x) + be32(y);
}

interface KeyMaterial {
    pubkey: string;
    secret: mcl.Fr;
}

export interface MemberSet {
    keys: KeyMaterial[];
    /** Big-endian G2 public keys, hex (for display and on-chain storage). */
    pubkeys: string[];
}

/** Generates `count` BLS keypairs in memory. The signers are not Solana wallets. */
export async function generateMembers(count: number): Promise<MemberSet> {
    await init();
    const generator = g2FromAgave(BN254_G2_GEN);
    const keys: KeyMaterial[] = Array.from({ length: count }, () => {
        const secret = new mcl.Fr();
        secret.setByCSPRNG();
        return { pubkey: g2ToAgave(mcl.mul(generator, secret)), secret };
    });
    return { keys, pubkeys: keys.map(k => k.pubkey) };
}

export function memberSecrets(set: MemberSet): string[] {
    return set.keys.map(k => k.secret.serializeToHexStr());
}

export async function restoreMembers(secrets: string[]): Promise<MemberSet> {
    await init();
    const generator = g2FromAgave(BN254_G2_GEN);
    const keys: KeyMaterial[] = secrets.map(s => {
        const secret = mcl.deserializeHexStrToFr(s);
        return { pubkey: g2ToAgave(mcl.mul(generator, secret)), secret };
    });
    return { keys, pubkeys: keys.map(k => k.pubkey) };
}

export interface AggregateSignature {
    aggregateSignature: string;
    negatedMessageHash: string;
}

/** Has the members at `signerIndices` sign `message`, returns the aggregate. */
export async function signMessage(
    set: MemberSet,
    message: string,
    signerIndices: number[],
): Promise<AggregateSignature> {
    if (signerIndices.length === 0) throw new Error('At least one member must sign');
    await init();
    const messageHash = mcl.hashAndMapToG1(new TextEncoder().encode(message));
    const signatures = signerIndices.map(i => mcl.mul(messageHash, set.keys[i].secret));
    const aggregate = signatures.reduce((acc, signature) => mcl.add(acc, signature));
    return {
        aggregateSignature: g1ToAgave(aggregate),
        negatedMessageHash: g1ToAgave(mcl.neg(messageHash)),
    };
}

/** Folds G2 public keys (agave BE hex) into one aggregate, same op the program runs. */
export async function aggregatePubkeysHex(pubkeys: string[]): Promise<string> {
    if (pubkeys.length === 0) return '';
    await init();
    const points = pubkeys.map(g2FromAgave);
    const aggregate = points.reduce((acc, point) => mcl.add(acc, point));
    return g2ToAgave(aggregate);
}

/** Parses the multisig account data (u16 LE count + 128-byte G2 keys) into hex keys. */
export function parseStoredPubkeys(data: Uint8Array): string[] {
    const count = data[0] | (data[1] << 8);
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
        const start = 2 + i * G2_POINT_BYTES;
        let key = '';
        for (const byte of data.subarray(start, start + G2_POINT_BYTES)) {
            key += byte.toString(16).padStart(2, '0');
        }
        keys.push(key);
    }
    return keys;
}

export function addSignersInstructionData(pubkeys: string[]): Uint8Array {
    return new Uint8Array([ADD_SIGNERS_DISCRIMINATOR, ...bytes(pubkeys.join(''))]);
}

export function verifyInstructionData(aggregate: AggregateSignature): Uint8Array {
    return new Uint8Array([
        VERIFY_DISCRIMINATOR,
        ...bytes(aggregate.aggregateSignature + aggregate.negatedMessageHash),
    ]);
}
