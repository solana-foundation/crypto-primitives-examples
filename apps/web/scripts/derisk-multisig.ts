import { readFileSync } from 'node:fs';

import { getCreateAccountInstruction } from '@solana-program/system';
import {
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
import * as mcl from 'mcl-wasm';

const PROGRAM = address('EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw');
const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

const N = 20;
const CHUNK = 7;
const G2_POINT = 128;
const ADD_SIGNERS = 10;
const VERIFY = 11;

const be32 = (n: string) => n.padStart(64, '0');
const toBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));
const chunks32 = (h: string) => h.match(/.{64}/g)!;
const g2ToAgave = (p: mcl.G2) => {
    const [, x0, x1, y0, y1] = p.getStr(16).split(' ');
    return be32(x1) + be32(x0) + be32(y1) + be32(y0);
};
const g2FromAgave = (h: string) => {
    const [x1, x0, y1, y0] = chunks32(h);
    const p = new mcl.G2();
    p.setStr(`1 0x${x0} 0x${x1} 0x${y0} 0x${y1}`, 16);
    return p;
};
const g1ToAgave = (p: mcl.G1) => {
    const [, x, y] = p.getStr(16).split(' ');
    return be32(x) + be32(y);
};

const rpc = createSolanaRpc('http://127.0.0.1:8899');
const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

async function send(instructions: Instruction[], feePayer: TransactionSigner) {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
    );
    const signedTx = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signedTx);
    await sendAndConfirm(signedTx, { commitment: 'confirmed' });
    return signature;
}

async function main() {
    await mcl.init(mcl.BN_SNARK1);
    const payer = await createKeyPairSignerFromBytes(
        Uint8Array.from(
            JSON.parse(readFileSync(new URL('../../../keypairs/local-wallet.json', import.meta.url), 'utf8')),
        ),
    );

    // 1. Create the multisig account (owned by the program).
    const space = BigInt(2 + N * G2_POINT);
    const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
    const multisig = await generateKeyPairSigner();
    await send(
        [getCreateAccountInstruction({ lamports: rent, newAccount: multisig, payer, programAddress: PROGRAM, space })],
        payer,
    );
    console.log('multisig account:', multisig.address);

    // 2. Generate N BLS keypairs, sign the same message.
    const generator = g2FromAgave(BN254_G2_GEN);
    const hm = mcl.hashAndMapToG1(new TextEncoder().encode('approve proposal #42'));
    const signers = Array.from({ length: N }, () => {
        const sk = new mcl.Fr();
        sk.setByCSPRNG();
        return { pk: mcl.mul(generator, sk), sig: mcl.mul(hm, sk) };
    });
    const pubkeys = signers.map(s => g2ToAgave(s.pk));

    // 3. Add signers to the account in chunks.
    for (let i = 0; i < N; i += CHUNK) {
        const chunk = pubkeys.slice(i, i + CHUNK).join('');
        const data = new Uint8Array([ADD_SIGNERS, ...toBytes(chunk)]);
        await send([{ accounts: [{ address: multisig.address, role: 1 }], data, programAddress: PROGRAM }], payer);
    }
    const stored = (await rpc.getAccountInfo(multisig.address, { encoding: 'base64' }).send()).value!.data[0];
    const count = Buffer.from(stored, 'base64').readUInt16LE(0);
    console.log('stored signers:', count);

    // 4. Verify with ALL signers -> must pass.
    const negHm = g1ToAgave(mcl.neg(hm));
    const aggAll = g1ToAgave(signers.reduce((a, s, i) => (i ? mcl.add(a, s.sig) : s.sig), signers[0].sig));
    const verifyData = (aggSigHex: string) => new Uint8Array([VERIFY, ...toBytes(aggSigHex + negHm)]);
    const account = { accounts: [{ address: multisig.address, role: 0 }], programAddress: PROGRAM };
    try {
        const sig = await send([{ ...account, data: verifyData(aggAll) }], payer);
        const tx = await rpc
            .getTransaction(sig, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 })
            .send();
        console.log(`ALL ${N} signed -> verified ✅  CU: ${tx?.meta?.computeUnitsConsumed}`);
    } catch {
        console.log(`ALL ${N} signed -> unexpectedly FAILED ❌`);
    }

    // 5. Verify with N-1 signers -> must fail.
    const partial = signers.slice(0, N - 1);
    const aggPartial = g1ToAgave(partial.reduce((a, s, i) => (i ? mcl.add(a, s.sig) : s.sig), partial[0].sig));
    try {
        await send([{ ...account, data: verifyData(aggPartial) }], payer);
        console.log(`${N - 1}/${N} signed -> unexpectedly ACCEPTED ❌`);
    } catch {
        console.log(`${N - 1}/${N} signed -> rejected ✅`);
    }
}

void main();
