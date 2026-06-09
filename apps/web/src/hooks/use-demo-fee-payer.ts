import { useKitTransactionSigner } from '@solana/connector/react';
import type { TransactionSigner } from '@solana/kit';
import { useEffect, useState } from 'react';

import { useClusterConfig } from '@/hooks/use-cluster-config';
import { getDemoWallet } from '@/lib/demo-wallet';
import { getClusterFromClusterId } from '@/lib/explorer';

export interface DemoFeePayer {
    isLocalnet: boolean;
    ready: boolean;
    signer: TransactionSigner | null;
}

export function useDemoFeePayer(): DemoFeePayer {
    const { id: clusterId } = useClusterConfig();
    const isLocalnet = getClusterFromClusterId(clusterId) === 'localnet';
    const { ready: walletReady, signer: connectedSigner } = useKitTransactionSigner();
    const [burner, setBurner] = useState<TransactionSigner | null>(null);

    useEffect(() => {
        if (!isLocalnet) {
            setBurner(null);
            return;
        }
        let cancelled = false;
        getDemoWallet()
            .then(signer => {
                if (!cancelled) setBurner(signer);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [isLocalnet]);

    return {
        isLocalnet,
        ready: isLocalnet ? burner !== null : walletReady,
        signer: isLocalnet ? burner : connectedSigner,
    };
}
