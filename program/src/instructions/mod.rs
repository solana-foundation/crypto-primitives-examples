pub mod altbn128_g2;
pub mod bls12_381;
pub mod bls254_aggregate;
pub mod definition;
pub mod noop;

pub use altbn128_g2::*;
pub use bls12_381::*;
pub use bls254_aggregate::*;
#[cfg(feature = "idl")]
pub use definition::*;
pub use noop::*;

use pinocchio::error::ProgramError;

/// Discriminators for the Crypto Primitives Program instructions.
#[repr(u8)]
pub enum CryptoPrimitivesInstructionDiscriminators {
    Noop = 0,
    AltBn128G2Add = 1,
    AltBn128G2Mul = 2,
    Bls12381G1Add = 3,
    Bls12381G1Sub = 4,
    Bls12381G1Mul = 5,
    Bls12381G2Add = 6,
    Bls12381G2Sub = 7,
    Bls12381G2Mul = 8,
    Bls254AggregateVerify = 9,
}

impl TryFrom<u8> for CryptoPrimitivesInstructionDiscriminators {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Noop),
            1 => Ok(Self::AltBn128G2Add),
            2 => Ok(Self::AltBn128G2Mul),
            3 => Ok(Self::Bls12381G1Add),
            4 => Ok(Self::Bls12381G1Sub),
            5 => Ok(Self::Bls12381G1Mul),
            6 => Ok(Self::Bls12381G2Add),
            7 => Ok(Self::Bls12381G2Sub),
            8 => Ok(Self::Bls12381G2Mul),
            9 => Ok(Self::Bls254AggregateVerify),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}
