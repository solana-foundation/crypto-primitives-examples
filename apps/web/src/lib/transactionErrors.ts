import { type CryptoPrimitivesError, getCryptoPrimitivesErrorMessage } from '@solana/crypto-primitives-client';
import {
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
} from '@solana/kit';

const KNOWN_ERROR_CODES = new Set([0, 1, 2, 3]);

function customErrorCode(error: unknown): number | undefined {
    if (isSolanaError(error, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
        return Number(error.context.code);
    }
    if (
        isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE) &&
        error.cause != null
    ) {
        return customErrorCode(error.cause);
    }
    return undefined;
}

export function formatTransactionError(error: unknown): string {
    const code = customErrorCode(error);
    if (code != null && KNOWN_ERROR_CODES.has(code)) {
        return getCryptoPrimitivesErrorMessage(code as CryptoPrimitivesError);
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return 'Transaction failed';
}
