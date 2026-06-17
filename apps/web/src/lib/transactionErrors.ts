import {
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
} from '@solana/kit';

const PROGRAM_ERROR_MESSAGES: Record<number, string> = {
    0: 'Instruction data could not be parsed',
    1: 'Instruction input was not the expected length',
    2: 'A cryptographic syscall returned a non-zero error code',
    3: 'Syscall is only available on-chain',
    4: 'Aggregate signature failed pairing verification',
    5: 'Multisig account is not owned by this program or is not writable',
    6: 'Multisig account does not have capacity for more signers',
};

const RPC_TRANSPORT_HTTP_ERROR = 8100002;
const JSON_RPC_PREFLIGHT_FAILURE = -32002;

function errorContext(error: unknown): Record<string, unknown> | undefined {
    if (error && typeof error === 'object' && 'context' in error) {
        const context = (error as { context?: unknown }).context;
        if (context && typeof context === 'object') return context as Record<string, unknown>;
    }
    return undefined;
}

function recentLogs(context: Record<string, unknown> | undefined): string | undefined {
    const logs = context?.logs;
    if (Array.isArray(logs) && logs.length > 0) {
        return (logs as string[]).slice(-2).join(' | ');
    }
    return undefined;
}

export function customErrorCode(error: unknown): number | undefined {
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

export function extractErrorMessage(error: unknown): string {
    if (!error) return 'Transaction failed';
    if (typeof error === 'string') return error;
    if (!(error instanceof Error)) return 'Transaction failed';

    const parts: string[] = [];
    const context = errorContext(error);
    const code = context?.__code;
    if (typeof code === 'string' || typeof code === 'number') parts.push(`Error ${code}`);
    else parts.push(error.message);

    const logs = recentLogs(context);
    if (logs) parts.push(logs);
    if (error.cause instanceof Error) parts.push(error.cause.message);

    return parts.join(' — ');
}

export function formatTransactionError(error: unknown): string {
    const programCode = customErrorCode(error);
    if (programCode != null && programCode in PROGRAM_ERROR_MESSAGES) {
        return PROGRAM_ERROR_MESSAGES[programCode];
    }

    const context = errorContext(error);
    const code = Number(context?.__code);

    if (code === RPC_TRANSPORT_HTTP_ERROR) {
        const status = Number(context?.statusCode);
        if (status === 429) {
            return 'RPC rate limit reached (HTTP 429). Switch to a custom RPC endpoint, or wait a moment and retry.';
        }
        return `Could not reach the RPC endpoint${Number.isFinite(status) ? ` (HTTP ${status})` : ''}. Check your network or cluster.`;
    }

    if (code === JSON_RPC_PREFLIGHT_FAILURE) {
        const logs = recentLogs(context);
        return logs ? `Transaction simulation failed: ${logs}` : 'Transaction simulation failed before sending.';
    }

    return extractErrorMessage(error);
}
