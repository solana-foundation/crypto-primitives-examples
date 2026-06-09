import * as mcl from 'mcl-wasm';

// Canonical BN254 G2 generator, big-endian (matches the program's hardcoded value).
const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

const BLS254_AGGREGATE_VERIFY_DISCRIMINATOR = 9;

let ready: Promise<void> | null = null;
function init(): Promise<void> {
    if (!ready) {
        ready = mcl.init(mcl.BN_SNARK1);
    }
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

export interface AggregateSignature {
    aggregateSignature: string;
    instructionData: Uint8Array;
    pubkeys: string[];
}

/**
 * Generates `signerCount` BLS keypairs, signs `message` with each, and builds the
 * instruction data for the on-chain aggregate-verify (discriminator + aggregate
 * signature + negated message hash + every public key). Everything runs locally.
 */
export async function buildAggregateSignature(message: string, signerCount: number): Promise<AggregateSignature> {
    await init();
    const generator = g2FromAgave(BN254_G2_GEN);
    const messageHash = mcl.hashAndMapToG1(new TextEncoder().encode(message));

    const signers = Array.from({ length: signerCount }, () => {
        const secret = new mcl.Fr();
        secret.setByCSPRNG();
        return { pubkey: mcl.mul(generator, secret), signature: mcl.mul(messageHash, secret) };
    });

    const aggregateSignaturePoint = signers.reduce(
        (acc, signer, i) => (i === 0 ? signer.signature : mcl.add(acc, signer.signature)),
        signers[0].signature,
    );

    const aggregateSignature = g1ToAgave(aggregateSignaturePoint);
    const negatedMessageHash = g1ToAgave(mcl.neg(messageHash));
    const pubkeys = signers.map(signer => g2ToAgave(signer.pubkey));

    const body = aggregateSignature + negatedMessageHash + pubkeys.join('');
    const instructionData = new Uint8Array([BLS254_AGGREGATE_VERIFY_DISCRIMINATOR, ...bytes(body)]);

    return { aggregateSignature, instructionData, pubkeys };
}
