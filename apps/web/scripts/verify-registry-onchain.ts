import { readFileSync } from 'node:fs';

import { bls12_381 } from '@noble/curves/bls12-381.js';
import {
    type Address,
    address,
    appendTransactionMessageInstructions,
    createKeyPairSignerFromBytes,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    generateKeyPairSigner,
    getSignatureFromTransaction,
    type Instruction,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type TransactionSigner,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';

const PROGRAM = address('EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw');
const SIZE = 2 + 192;
const ADD = 12;
const REMOVE = 13;

const bls = bls12_381.shortSignatures;
const G2 = bls12_381.G2.Point;

type BlsMember = ReturnType<typeof bls.keygen>;

const rpc = createSolanaRpc('http://127.0.0.1:8899');
const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

async function send(instructions: Instruction[], payer: TransactionSigner) {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    await sendAndConfirm(signed, { commitment: 'confirmed' });
    return getSignatureFromTransaction(signed);
}

function memberData(point: BlsMember['publicKey'], disc: number) {
    return new Uint8Array([disc, ...point.toBytes(false)]);
}

async function readRegistry(account: Address) {
    const info = await rpc.getAccountInfo(account, { encoding: 'base64' }).send();
    const raw = Buffer.from(info.value!.data[0], 'base64');
    return { aggregate: new Uint8Array(raw.subarray(2, 2 + 192)), count: raw.readUInt16LE(0) };
}

async function main() {
    const payer = await createKeyPairSignerFromBytes(
        Uint8Array.from(
            JSON.parse(
                readFileSync(new URL('../../../keypairs/local-wallet.json', import.meta.url), 'utf8'),
            ) as number[],
        ),
    );

    const registry = await generateKeyPairSigner();
    const lamports = await rpc.getMinimumBalanceForRentExemption(BigInt(SIZE)).send();
    await send(
        [
            getCreateAccountInstruction({
                lamports,
                newAccount: registry,
                payer,
                programAddress: PROGRAM,
                space: BigInt(SIZE),
            }),
        ],
        payer,
    );

    const members = [0, 1, 2].map(() => bls.keygen());
    const acct = { accounts: [{ address: registry.address, role: 1 }], programAddress: PROGRAM };
    for (const m of members) await send([{ ...acct, data: memberData(m.publicKey, ADD) }], payer);

    const hashed = bls.hash(new TextEncoder().encode('approve proposal #42'));
    const sign = (subset: BlsMember[]) => bls.aggregateSignatures(subset.map(m => bls.sign(hashed, m.secretKey)));

    let reg = await readRegistry(registry.address);
    console.log('after 3 adds -> count:', reg.count);
    console.log('all 3 sign -> verify:', bls.verify(sign(members), hashed, G2.fromBytes(reg.aggregate)));

    // remove member #1 (G2 sub on-chain)
    await send([{ ...acct, data: memberData(members[1].publicKey, REMOVE) }], payer);
    reg = await readRegistry(registry.address);
    console.log('after remove -> count:', reg.count);
    console.log(
        'remaining {0,2} sign -> verify:',
        bls.verify(sign([members[0], members[2]]), hashed, G2.fromBytes(reg.aggregate)),
    );
    console.log(
        'all 3 sign vs reduced set -> verify (expect false):',
        bls.verify(sign(members), hashed, G2.fromBytes(reg.aggregate)),
    );
}

void main();
