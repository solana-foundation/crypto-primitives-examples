import { readFileSync } from 'node:fs';
import os from 'node:os';

import {
    appendTransactionMessageInstructions,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    getSignatureFromTransaction,
    type Instruction,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    address,
} from '@solana/kit';
import * as mcl from 'mcl-wasm';

const PROGRAM = address('EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw');
const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

const be32 = (n: string) => n.padStart(64, '0');
const toBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));
const chunks32 = (h: string) => h.match(/.{64}/g)!;

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
function g1ToAgave(p: mcl.G1): string {
    const [, x, y] = p.getStr(16).split(' ');
    return be32(x) + be32(y);
}

async function send(rpc: any, rpcSubscriptions: any, signer: any, data: Uint8Array) {
    const instruction: Instruction = { accounts: [], data, programAddress: PROGRAM };
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m: any) => setTransactionMessageFeePayerSigner(signer, m),
        (m: any) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m: any) => appendTransactionMessageInstructions([instruction], m),
    );
    const signedTx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTx, { commitment: 'confirmed' });
    const tx = await rpc
        .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
        .send();
    return tx;
}

async function main() {
    await mcl.init(mcl.BN_SNARK1);
    const rpc = createSolanaRpc('http://127.0.0.1:8899');
    const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
    const signer = await createKeyPairSignerFromBytes(
        Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8')) as number[]),
    );

    const g2gen = g2FromAgave(BN254_G2_GEN);
    const hm = mcl.hashAndMapToG1(new TextEncoder().encode('approve proposal #42'));
    const negHm = g1ToAgave(mcl.neg(hm));
    const ks = [0, 1, 2].map(() => {
        const sk = new mcl.Fr();
        sk.setByCSPRNG();
        return { pk: mcl.mul(g2gen, sk), sig: mcl.mul(hm, sk) };
    });
    const aggSig = g1ToAgave(ks.reduce((a, k, i) => (i ? mcl.add(a, k.sig) : k.sig), ks[0].sig));
    const pubkeys = ks.map(k => g2ToAgave(k.pk));

    const body = aggSig + negHm + pubkeys.join('');
    const data = new Uint8Array([9, ...toBytes(body)]);

    const ok = await send(rpc, rpcSubscriptions, signer, data);
    console.log('VALID aggregate -> CU:', ok?.meta?.computeUnitsConsumed, '| err:', ok?.meta?.err);

    // Tamper: corrupt the aggregate signature -> must be rejected.
    const tampered = new Uint8Array(data);
    tampered[1] ^= 0x01;
    try {
        await send(rpc, rpcSubscriptions, signer, tampered);
        console.log('TAMPERED: unexpectedly accepted ❌');
    } catch (e) {
        console.log('TAMPERED rejected ✅ (', e instanceof Error ? e.message.split('\n')[0] : e, ')');
    }
}

void main();
