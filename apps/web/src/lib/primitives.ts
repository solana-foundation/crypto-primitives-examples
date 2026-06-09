import {
    getAltBn128G2AddInstruction,
    getAltBn128G2MulInstruction,
    getBls12381G1AddInstruction,
    getBls12381G1MulInstruction,
    getBls12381G1SubInstruction,
    getBls12381G2AddInstruction,
    getBls12381G2MulInstruction,
    getBls12381G2SubInstruction,
} from '@solana/crypto-primitives-client';
import type { Address, Instruction } from '@solana/kit';

export type PrimitiveGroup = 'altbn128' | 'bls12381';

export interface Operand {
    /** Label shown above the input field. */
    label: string;
    /** Expected byte length of this operand. */
    bytes: number;
    /** Whether this operand is a scalar (vs. a curve point). */
    scalar?: boolean;
}

export interface Demo {
    id: string;
    group: PrimitiveGroup;
    title: string;
    /** Short symbolic operation, e.g. "P + Q". */
    op: string;
    description: string;
    operands: Operand[];
    /** Valid example input, big-endian hex, one entry per operand. */
    example: string[];
    outputBytes: number;
    /** Compute units measured under Mollusk (agave 4.0). */
    measuredCu: number;
    build: (input: number[], programAddress: Address) => Instruction;
}

const SCALAR_THREE = '0000000000000000000000000000000000000000000000000000000000000003';

// alt_bn128 BN254 G2 generator, 2*generator (big-endian, 128 bytes each).
const BN254_G2_GEN =
    '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';
const BN254_G2_TWO =
    '203e205db4f19b37b60121b83a7333706db86431c6d835849957ed8c3928ad7927dc7234fd11d3e8c36c59277c3e6f149d5cd3cfa9a62aee49f8130962b4b3b9995e8aa5b7827463722b8c153931579d3505566b4edf48d498e185f0509de15204bb53b8977e5f92a0bc372742c4830944a59b4fe6b1c0466e2a6dad122b5d2e';

// BLS12-381 generators and 2*generator (big-endian; G1 96 bytes, G2 192 bytes).
const BLS_G1_GEN =
    '17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1';
const BLS_G1_TWO =
    '0572cbea904d67468808c8eb50a9450c9721db309128012543902d0ac358a62ae28f75bb8f1c7c42c39a8c5529bf0f4e166a9d8cabc673a322fda673779d8e3822ba3ecb8670e461f73bb9021d5fd76a4c56d9d4cd16bd1bba86881979749d28';
const BLS_G2_GEN =
    '13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801';
const BLS_G2_TWO =
    '0a4edef9c1ed7f729f520e47730a124fd70662a904ba1074728114d1031e1572c6c886f6b57ec72a6178288c47c335771638533957d540a9d2370f17cc7ed5863bc0b995b8825e0ee1ea1e1e4d00dbae81f14b0bf3611b78c952aacab827a0530f6d4552fa65dd2638b361543f887136a43253d9c66c411697003f7a13c308f5422e1aa0a59c8967acdefd8b6e36ccf30468fb440d82b0630aeb8dca2b5256789a66da69bf91009cbfe6bd221e47aa8ae88dece9764bf3bd999d95d71e4c9899';

const POINT_G2 = (label: string): Operand => ({ bytes: 128, label });
const BLS_POINT = (label: string, bytes: number): Operand => ({ bytes, label });
const SCALAR: Operand = { bytes: 32, label: 'Scalar (32 bytes, big-endian)', scalar: true };

export const DEMOS: Demo[] = [
    {
        build: (input, programAddress) => getAltBn128G2AddInstruction({ input }, { programAddress }),
        description:
            'Adds two BN254 G2 points natively (SIMD-0302). Before this, G2 arithmetic had to be emulated client-side.',
        example: [BN254_G2_GEN, BN254_G2_TWO],
        group: 'altbn128',
        id: 'altbn128-g2-add',
        measuredCu: 702,
        op: 'P + Q',
        operands: [POINT_G2('Point P (G2, 128 bytes)'), POINT_G2('Point Q (G2, 128 bytes)')],
        outputBytes: 128,
        title: 'G2 Addition',
    },
    {
        build: (input, programAddress) => getAltBn128G2MulInstruction({ input }, { programAddress }),
        description: 'Multiplies a BN254 G2 point by a scalar. Full subgroup validation; ~22x the cost of addition.',
        example: [BN254_G2_GEN, SCALAR_THREE],
        group: 'altbn128',
        id: 'altbn128-g2-mul',
        measuredCu: 15839,
        op: 'P * s',
        operands: [POINT_G2('Point P (G2, 128 bytes)'), SCALAR],
        outputBytes: 128,
        title: 'G2 Scalar Multiplication',
    },
    {
        build: (input, programAddress) => getBls12381G1AddInstruction({ input }, { programAddress }),
        description: 'Adds two BLS12-381 G1 points (SIMD-0388). 128-bit security pairing curve, Ethereum-compatible.',
        example: [BLS_G1_GEN, BLS_G1_TWO],
        group: 'bls12381',
        id: 'bls-g1-add',
        measuredCu: 302,
        op: 'P + Q',
        operands: [BLS_POINT('Point P (G1, 96 bytes)', 96), BLS_POINT('Point Q (G1, 96 bytes)', 96)],
        outputBytes: 96,
        title: 'G1 Addition',
    },
    {
        build: (input, programAddress) => getBls12381G1SubInstruction({ input }, { programAddress }),
        description: 'Subtracts two BLS12-381 G1 points. Native subtraction — unlike alt_bn128, which has no sub op.',
        example: [BLS_G1_TWO, BLS_G1_GEN],
        group: 'bls12381',
        id: 'bls-g1-sub',
        measuredCu: 301,
        op: 'P - Q',
        operands: [BLS_POINT('Point P (G1, 96 bytes)', 96), BLS_POINT('Point Q (G1, 96 bytes)', 96)],
        outputBytes: 96,
        title: 'G1 Subtraction',
    },
    {
        build: (input, programAddress) => getBls12381G1MulInstruction({ input }, { programAddress }),
        description: 'Multiplies a BLS12-381 G1 point by a scalar. Note the scalar comes first in the input layout.',
        example: [SCALAR_THREE, BLS_G1_GEN],
        group: 'bls12381',
        id: 'bls-g1-mul',
        measuredCu: 4799,
        op: 's * P',
        operands: [SCALAR, BLS_POINT('Point P (G1, 96 bytes)', 96)],
        outputBytes: 96,
        title: 'G1 Scalar Multiplication',
    },
    {
        build: (input, programAddress) => getBls12381G2AddInstruction({ input }, { programAddress }),
        description: 'Adds two BLS12-381 G2 points. Cheaper than alt_bn128 G2 addition despite higher security.',
        example: [BLS_G2_GEN, BLS_G2_TWO],
        group: 'bls12381',
        id: 'bls-g2-add',
        measuredCu: 375,
        op: 'P + Q',
        operands: [BLS_POINT('Point P (G2, 192 bytes)', 192), BLS_POINT('Point Q (G2, 192 bytes)', 192)],
        outputBytes: 192,
        title: 'G2 Addition',
    },
    {
        build: (input, programAddress) => getBls12381G2SubInstruction({ input }, { programAddress }),
        description: 'Subtracts two BLS12-381 G2 points.',
        example: [BLS_G2_TWO, BLS_G2_GEN],
        group: 'bls12381',
        id: 'bls-g2-sub',
        measuredCu: 376,
        op: 'P - Q',
        operands: [BLS_POINT('Point P (G2, 192 bytes)', 192), BLS_POINT('Point Q (G2, 192 bytes)', 192)],
        outputBytes: 192,
        title: 'G2 Subtraction',
    },
    {
        build: (input, programAddress) => getBls12381G2MulInstruction({ input }, { programAddress }),
        description: 'Multiplies a BLS12-381 G2 point by a scalar. The heaviest of the group ops.',
        example: [SCALAR_THREE, BLS_G2_GEN],
        group: 'bls12381',
        id: 'bls-g2-mul',
        measuredCu: 8429,
        op: 's * P',
        operands: [SCALAR, BLS_POINT('Point P (G2, 192 bytes)', 192)],
        outputBytes: 192,
        title: 'G2 Scalar Multiplication',
    },
];

export function demosForGroup(group: PrimitiveGroup): Demo[] {
    return DEMOS.filter(demo => demo.group === group);
}
