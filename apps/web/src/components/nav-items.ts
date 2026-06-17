import { Binary, EyeOff, Hash, Home, Shapes } from 'lucide-react';

export interface NavItem {
    icon: typeof Home;
    label: string;
    path: string;
}

export const NAV_ITEMS: NavItem[] = [
    { icon: Home, label: 'Overview', path: '/' },
    { icon: Binary, label: 'BN254 pairing curve', path: '/altbn128' },
    { icon: Shapes, label: 'BLS12-381 signature curve', path: '/bls12381' },
    { icon: EyeOff, label: 'Zero Knowledge ElGamal proofs', path: '/elgamal' },
    { icon: Hash, label: 'SHA-512 hash', path: '/sha512' },
];
