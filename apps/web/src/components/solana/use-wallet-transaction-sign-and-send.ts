import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    type Instruction,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type TransactionSigner,
} from '@solana/kit';
import { useCallback } from 'react';

import { useRpc } from '@/hooks/useRpc';

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 60;

/**
 * Signs and sends a transaction, then confirms it by polling signature status
 * over HTTP. Avoids the RPC websocket subscription so the app works behind a
 * plain HTTP tunnel and against a validator whose pubsub port isn't proxied.
 */
export function useWalletTransactionSignAndSend() {
    const rpc = useRpc();

    return useCallback(
        async (instructions: readonly Instruction[], signer: TransactionSigner): Promise<string> => {
            const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

            const txMessage = pipe(
                createTransactionMessage({ version: 0 }),
                tx => setTransactionMessageFeePayerSigner(signer, tx),
                tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                tx => appendTransactionMessageInstructions(instructions, tx),
            );

            const signedTx = await signTransactionMessageWithSigners(txMessage);
            const signature = getSignatureFromTransaction(signedTx);

            await rpc
                .sendTransaction(getBase64EncodedWireTransaction(signedTx), {
                    encoding: 'base64',
                    preflightCommitment: 'confirmed',
                })
                .send();

            for (let i = 0; i < MAX_POLLS; i++) {
                const { value } = await rpc.getSignatureStatuses([signature]).send();
                const status = value[0];
                if (status?.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
                }
                if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
                    return signature;
                }
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
            throw new Error('Transaction was not confirmed in time');
        },
        [rpc],
    );
}
