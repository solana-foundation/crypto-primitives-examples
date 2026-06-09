import { bls12_381 } from '@noble/curves/bls12-381.js';

// blstrs/agave uncompressed G2 generator (from the program's BLS12-381 tests).
const BLS_G2_GEN =
    '13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function main() {
    const G2 = bls12_381.G2.Point;
    const bls = bls12_381.shortSignatures; // G1 sigs, G2 pubkeys

    // 1. Format: noble's uncompressed G2 generator vs blstrs/agave.
    const genUncompressed = hex(G2.BASE.toBytes(false));
    console.log('noble G2 gen len:', genUncompressed.length / 2);
    console.log('noble G2 gen == agave gen:', genUncompressed === BLS_G2_GEN);

    // 2. Aggregate keys by G2 point addition (what the program does on-chain).
    const keys = [0, 1, 2].map(() => bls.keygen()); // { secretKey, publicKey: G2 point }
    const aggPoint = keys.reduce((acc, k, i) => (i === 0 ? k.publicKey : acc.add(k.publicKey)), keys[0].publicKey);
    console.log('aggregate pubkey uncompressed len:', aggPoint.toBytes(false).length);

    // 3. Off-chain sign + aggregate + verify (what the demo does after reading the on-chain key).
    const hashed = bls.hash(new TextEncoder().encode('approve proposal #42'));
    const sigs = keys.map(k => bls.sign(hashed, k.secretKey));
    const aggSig = bls.aggregateSignatures(sigs);
    console.log('aggregate verify (all 3):', bls.verify(aggSig, hashed, aggPoint));

    // subset should fail against the full aggregate key
    const subsetSig = bls.aggregateSignatures(sigs.slice(0, 2));
    console.log('subset verify against full key (expect false):', bls.verify(subsetSig, hashed, aggPoint));

    // the on-chain aggregate (uncompressed 192 bytes) re-parses to a point that verifies
    const reparsed = G2.fromBytes(aggPoint.toBytes(false));
    console.log('uncompressed round-trip verifies:', bls.verify(aggSig, hashed, reparsed));
}

main();
