import { useCallback, useRef, useState } from 'react';
import { getTransferSolInstruction } from '@solana-program/system';
import { useKitTransactionSigner, useWallet } from '@solana/connector/react';
import { Button, TextInput } from '@solana/design-system';
import { type Address, lamports } from '@solana/kit';

import { useWalletTransactionSignAndSend } from '@/components/solana/use-wallet-transaction-sign-and-send';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatTransactionError } from '@/lib/transactionErrors';
import { ellipsify } from '@/lib/utils';

const DEFAULT_AMOUNT = '0.1';

interface FundingRequest {
    address: Address;
    onFunded: () => void;
}

export function useDemoWalletFunding() {
    const signAndSend = useWalletTransactionSignAndSend();
    const { signer } = useKitTransactionSigner();
    const { isConnected } = useWallet();

    const [request, setRequest] = useState<FundingRequest | null>(null);
    const [amount, setAmount] = useState(DEFAULT_AMOUNT);
    const [funding, setFunding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    const requestFunding = useCallback((req: FundingRequest) => {
        setError(null);
        setAmount(DEFAULT_AMOUNT);
        setRequest(req);
    }, []);

    function close() {
        requestIdRef.current += 1;
        setFunding(false);
        setRequest(null);
    }

    async function fund() {
        if (!request || !signer) return;
        const sol = Number(amount);
        if (!Number.isFinite(sol) || sol <= 0) {
            setError('Enter an amount greater than 0');
            return;
        }
        const requestId = (requestIdRef.current += 1);
        setFunding(true);
        setError(null);
        try {
            const instruction = getTransferSolInstruction({
                amount: lamports(BigInt(Math.round(sol * 1e9))),
                destination: request.address,
                source: signer,
            });
            await signAndSend([instruction], signer);
            if (requestIdRef.current !== requestId) return;
            const { onFunded } = request;
            setRequest(null);
            onFunded();
        } catch (caught) {
            if (requestIdRef.current !== requestId) return;
            setError(formatTransactionError(caught));
        } finally {
            if (requestIdRef.current === requestId) setFunding(false);
        }
    }

    const dialog = (
        <Dialog
            onOpenChange={open => {
                if (!open) close();
            }}
            open={request !== null}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Fund the demo wallet</DialogTitle>
                    <DialogDescription>
                        The demo runs on an in-browser wallet that pays the devnet fees, so you sign once here instead
                        of approving every step. Top it up from your connected wallet.
                    </DialogDescription>
                </DialogHeader>
                {request && (
                    <div className="space-y-3 text-sm">
                        <div className="text-muted-foreground">
                            Demo wallet{' '}
                            <span className="font-berkeley-mono text-foreground">{ellipsify(request.address, 4)}</span>
                        </div>
                        <label className="block space-y-1">
                            <span className="text-xs font-medium text-sand-1100">Amount (SOL)</span>
                            <TextInput
                                disabled={funding}
                                inputClassName="font-mono"
                                inputMode="decimal"
                                onChange={e => setAmount(e.currentTarget.value)}
                                value={amount}
                            />
                        </label>
                        {!isConnected && (
                            <p className="text-destructive">Connect your wallet (top right) to fund the demo.</p>
                        )}
                        {error && <p className="break-words whitespace-pre-wrap text-destructive">{error}</p>}
                    </div>
                )}
                <DialogFooter>
                    <Button onClick={close} variant="secondary">
                        Cancel
                    </Button>
                    <Button disabled={!isConnected || funding} loading={funding} onClick={() => void fund()}>
                        Fund &amp; continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    return { dialog, requestFunding };
}
