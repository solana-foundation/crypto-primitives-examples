import { Binary, Home, Shapes } from 'lucide-react';

export interface NavItem {
    icon: typeof Home;
    label: string;
    path: string;
}

export const NAV_ITEMS: NavItem[] = [
    { icon: Home, label: 'Overview', path: '/' },
    { icon: Binary, label: 'alt_bn128 G2', path: '/altbn128' },
    { icon: Shapes, label: 'BLS12-381', path: '/bls12381' },
];
