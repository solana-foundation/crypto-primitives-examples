import { readFileSync } from 'node:fs';

import {
    appendTransactionMessageInstructions,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    getSignatureFromTransaction,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';
import { ElGamalKeypair, PubkeyValidityProofData } from '@solana/zk-sdk/node';
import { verifyPubkeyValidity } from '@solana-program/zk-elgamal-proof';

async function main() {
    const rpc = createSolanaRpc('http://127.0.0.1:8899');
    const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');

    const keypairBytes = Uint8Array.from(
        JSON.parse(readFileSync(new URL('../../../keypairs/local-wallet.json', import.meta.url), 'utf8')) as number[],
    );
    const payer = await createKeyPairSignerFromBytes(keypairBytes);

    const elgamal = new ElGamalKeypair();
    const proof = new PubkeyValidityProofData(elgamal);
    proof.verify();
    const proofBytes = proof.toBytes();
    console.log('pubkey:', Buffer.from(proof.context().toBytes()).toString('hex'));
    console.log('proof bytes:', proofBytes.length);

    const instructions = await verifyPubkeyValidity({ payer, proofData: proofBytes, rpc });

    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    const signedTx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTx, { commitment: 'confirmed' });

    const tx = await rpc
        .getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
        .send();

    console.log('signature:', signature);
    console.log('compute units:', tx?.meta?.computeUnitsConsumed);
    console.log('on-chain verify OK:', tx?.meta?.err == null);
    process.exit(tx?.meta?.err == null ? 0 : 1);
}

void main();
