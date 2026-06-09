import { readFileSync } from 'node:fs';

import {
    address,
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
} from '@solana/kit';

const PROGRAM = address('EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw');

// BN254 G2: generator, 2*generator, expected 3*generator (big-endian, 128 bytes).
const GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';
const TWO =
    '203e205db4f19b37b60121b83a7333706db86431c6d835849957ed8c3928ad7927dc7234fd11d3e8c36c59277c3e6f149d5cd3cfa9a62aee49f8130962b4b3b9995e8aa5b7827463722b8c153931579d3505566b4edf48d498e185f0509de15204bb53b8977e5f92a0bc372742c4830944a59b4fe6b1c0466e2a6dad122b5d2e';
const THREE =
    '1014772f57bb9742735191cd5dcfe4ebbc04156b6878a0a7c9824f32ffb66e8506064e784db10e9051e52826e192715e8d7e478cb09a5e0012defa0694fbc7f5021e2335f3354bb7922ffcc2f38d3323dd9453ac49b55441452aeaca147711b2058e1d5681b5b9e0074b0f9c8d2c68a069b920d74521e79765036d57666c5597';

function hexBytes(hex: string): Uint8Array {
    return Uint8Array.from(hex.match(/../g)!.map(byte => parseInt(byte, 16)));
}

async function main() {
    const rpc = createSolanaRpc('http://127.0.0.1:8899');
    const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');

    const keypairBytes = Uint8Array.from(
        JSON.parse(readFileSync(new URL('../keypairs/local-wallet.json', import.meta.url), 'utf8')) as number[],
    );
    const signer = await createKeyPairSignerFromBytes(keypairBytes);

    const data = new Uint8Array([1, ...hexBytes(GEN), ...hexBytes(TWO)]);
    const instruction: Instruction = { accounts: [], data, programAddress: PROGRAM };

    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(signer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions([instruction], m),
    );

    const signedTx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTx, { commitment: 'confirmed' });

    const tx = await rpc
        .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
        .send();

    const returnData = tx?.meta?.returnData?.data;
    const base64 = Array.isArray(returnData) ? returnData[0] : (returnData as string | undefined);
    const output = base64 ? Buffer.from(base64, 'base64').toString('hex') : null;

    console.log('signature:', signature);
    console.log('compute units:', tx?.meta?.computeUnitsConsumed);
    console.log('output:   ', output);
    console.log('expected: ', THREE);
    console.log('MATCH:', output === THREE);
    process.exit(output === THREE ? 0 : 1);
}

void main();
