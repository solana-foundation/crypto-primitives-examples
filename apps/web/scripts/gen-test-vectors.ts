/**
 * Generates deterministic test vectors for the Rust Mollusk integration tests.
 * Fixed secrets make the output reproducible; paste the printed constants into
 * tests/tests/{bls254_aggregate,multisig,bls_registry}.rs.
 *
 *   pnpm --filter @solana/crypto-primitives-web exec tsx scripts/gen-test-vectors.ts
 */
import { bls12_381 } from '@noble/curves/bls12-381.js';
import * as mcl from 'mcl-wasm';

const MESSAGE = 'approve proposal #42';

const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

const be32 = (n: string) => n.padStart(64, '0');
const chunks32 = (h: string) => h.match(/.{64}/g) ?? [];

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
function frFromInt(n: number): mcl.Fr {
    const fr = new mcl.Fr();
    fr.setStr(String(n), 10);
    return fr;
}

function print(name: string, hex: string) {
    console.log(`pub const ${name}: &str =\n    "${hex}";`);
}

async function bn254() {
    await mcl.init(mcl.BN_SNARK1);
    const generator = g2FromAgave(BN254_G2_GEN);
    const messageHash = mcl.hashAndMapToG1(new TextEncoder().encode(MESSAGE));
    const secrets = [1, 2, 3].map(frFromInt);
    const pubkeys = secrets.map(s => mcl.mul(generator, s));
    const signatures = secrets.map(s => mcl.mul(messageHash, s));

    const aggregate = (sigs: mcl.G1[]) => sigs.reduce((acc, s, i) => (i === 0 ? s : mcl.add(acc, s)));

    console.log('// ===== BN254 (alt_bn128 G2) — message "approve proposal #42", secrets 1,2,3 =====');
    pubkeys.forEach((pk, i) => print(`BN254_PUBKEY_${i + 1}`, g2ToAgave(pk)));
    print('BN254_NEGATED_MESSAGE_HASH', g1ToAgave(mcl.neg(messageHash)));
    print('BN254_AGG_SIG_ALL', g1ToAgave(aggregate(signatures)));
    print('BN254_AGG_SIG_FIRST_TWO', g1ToAgave(aggregate(signatures.slice(0, 2))));
}

function bls12381() {
    const bls = (
        bls12_381 as { shortSignatures: { getPublicKey: (sk: Uint8Array) => { toBytes: (c: boolean) => Uint8Array } } }
    ).shortSignatures;
    const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    const G2 = (
        bls12_381 as {
            G2: {
                Point: {
                    fromBytes: (b: Uint8Array) => {
                        add: (o: unknown) => unknown;
                        subtract: (o: unknown) => { toBytes: (c: boolean) => Uint8Array };
                    };
                };
            };
        }
    ).G2.Point;

    const secrets = [1, 2, 3].map(n => {
        const sk = new Uint8Array(32);
        sk[31] = n;
        return sk;
    });
    const pubkeys = secrets.map(sk => bls.getPublicKey(sk).toBytes(false));
    const points = pubkeys.map(pk => G2.fromBytes(pk));
    const agg = (pts: ReturnType<typeof G2.fromBytes>[]) =>
        hex(
            (pts.reduce((acc, p) => acc.add(p) as typeof acc) as { toBytes: (c: boolean) => Uint8Array }).toBytes(
                false,
            ),
        );

    console.log('\n// ===== BLS12-381 — secrets 1,2,3 =====');
    pubkeys.forEach((pk, i) => print(`BLS_PUBKEY_${i + 1}`, hex(pk)));
    print('BLS_AGG_1_2', agg([points[0], points[1]]));
    print('BLS_AGG_1_2_3', agg([points[0], points[1], points[2]]));
    print('BLS_AGG_1_3', agg([points[0], points[2]]));
}

await bn254();
bls12381();
