import { Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '@/components/app-layout';
import { AppProviders } from '@/components/app-providers';
import { AltBn128 } from '@/routes/altbn128';
import { Bls12381 } from '@/routes/bls12381';
import { Overview } from '@/routes/overview';

export function App() {
    return (
        <AppProviders>
            <Routes>
                <Route
                    path="/"
                    element={
                        <AppLayout>
                            <Overview />
                        </AppLayout>
                    }
                />
                <Route
                    path="/altbn128"
                    element={
                        <AppLayout>
                            <AltBn128 />
                        </AppLayout>
                    }
                />
                <Route
                    path="/bls12381"
                    element={
                        <AppLayout>
                            <Bls12381 />
                        </AppLayout>
                    }
                />
                <Route path="*" element={<Navigate replace to="/" />} />
            </Routes>
        </AppProviders>
    );
}
