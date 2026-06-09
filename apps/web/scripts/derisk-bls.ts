import * as mcl from 'mcl-wasm';

const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

function be32(numHex: string): string {
    return numHex.padStart(64, '0');
}
function hexToBytes(h: string): Uint8Array {
    return Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));
}
function chunks32(h: string): string[] {
    return h.match(/.{64}/g)!;
}

// agave G2 (BE) = x.c1 | x.c0 | y.c1 | y.c0 ; mcl getStr = "1 x.c0 x.c1 y.c0 y.c1"
function g2ToAgave(p: mcl.G2): string {
    const [, x0, x1, y0, y1] = p.getStr(16).split(' ');
    return be32(x1) + be32(x0) + be32(y1) + be32(y0);
}
function g2FromAgave(h: string): mcl.G2 {
    const [x1, x0, y1, y0] = chunks32(h);
    const p = new mcl.G2();
    p.setStr(`1 0x${x0} 0x${x1} 0x${y0} 0x${y1}`, 16);
    return p;
}
// agave G1 (BE) = x | y ; mcl getStr = "1 x y"
function g1ToAgave(p: mcl.G1): string {
    const [, x, y] = p.getStr(16).split(' ');
    return be32(x) + be32(y);
}

function gtEq(a: mcl.GT, b: mcl.GT): boolean {
    return Buffer.from(a.serialize()).equals(Buffer.from(b.serialize()));
}

async function main() {
    await mcl.init(mcl.BN_SNARK1);

    // 1. Converter correctness: import agave generator -> mcl -> back to agave, must match.
    const g2gen = g2FromAgave(BN254_G2_GEN);
    const roundtrip = g2ToAgave(g2gen);
    console.log('G2 generator round-trips through mcl:', roundtrip === BN254_G2_GEN);
    console.log('on curve / valid:', g2gen.isValid());

    // 2. BLS aggregate (short sigs: sig in G1, pubkey in G2), 3 signers, same message.
    const msg = new TextEncoder().encode('approve proposal #42');
    const hm = mcl.hashAndMapToG1(msg);
    function keypair() {
        const sk = new mcl.Fr();
        sk.setByCSPRNG();
        return { pk: mcl.mul(g2gen, sk), sig: mcl.mul(hm, sk) };
    }
    const ks = [keypair(), keypair(), keypair()];
    const aggPk = ks.reduce((acc, k, i) => (i === 0 ? k.pk : mcl.add(acc, k.pk)), ks[0].pk);
    const aggSig = ks.reduce((acc, k, i) => (i === 0 ? k.sig : mcl.add(acc, k.sig)), ks[0].sig);

    // 3. Pairing-product the syscall will check: e(aggSig,g2)*e(-H(m),aggPk) == 1
    const negHm = mcl.neg(hm);
    const product = mcl.mul(mcl.pairing(aggSig, g2gen), mcl.pairing(negHm, aggPk));
    const one = new mcl.GT();
    one.setInt(1);
    console.log('aggregate verify (pairing product == 1):', gtEq(product, one));

    // 4. Emit agave-format bytes for the on-chain pairing test.
    console.log('--- agave-format operands (3 signers) ---');
    console.log('AGG_SIG_G1 =', g1ToAgave(aggSig));
    console.log('NEG_HM_G1  =', g1ToAgave(negHm));
    console.log('AGG_PK_G2  =', g2ToAgave(aggPk));
    console.log('individual pubkeys:');
    ks.forEach((k, i) => console.log(`PK${i} =`, g2ToAgave(k.pk)));
}

void main();
