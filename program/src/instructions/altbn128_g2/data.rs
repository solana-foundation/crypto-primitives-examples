use pinocchio::error::ProgramError;

use crate::errors::CryptoPrimitivesProgramError;

pub const G2_POINT_SIZE: usize = 128;
pub const SCALAR_SIZE: usize = 32;
pub const G2_ADD_INPUT_SIZE: usize = G2_POINT_SIZE * 2;
pub const G2_MUL_INPUT_SIZE: usize = G2_POINT_SIZE + SCALAR_SIZE;

/// Instruction data for an alt_bn128 G2 addition.
///
/// # Layout
/// Two big-endian G2 points, 128 bytes each (256 bytes total).
pub struct G2AddData<'a> {
    pub input: &'a [u8; G2_ADD_INPUT_SIZE],
}

impl<'a> TryFrom<&'a [u8]> for G2AddData<'a> {
    type Error = ProgramError;

    #[inline(always)]
    fn try_from(input: &'a [u8]) -> Result<Self, Self::Error> {
        let input = input
            .try_into()
            .map_err(|_| CryptoPrimitivesProgramError::InvalidInputLength)?;
        Ok(Self { input })
    }
}

/// Instruction data for an alt_bn128 G2 scalar multiplication.
///
/// # Layout
/// One big-endian G2 point (128 bytes) followed by a big-endian 32-byte scalar.
pub struct G2MulData<'a> {
    pub input: &'a [u8; G2_MUL_INPUT_SIZE],
}

impl<'a> TryFrom<&'a [u8]> for G2MulData<'a> {
    type Error = ProgramError;

    #[inline(always)]
    fn try_from(input: &'a [u8]) -> Result<Self, Self::Error> {
        let input = input
            .try_into()
            .map_err(|_| CryptoPrimitivesProgramError::InvalidInputLength)?;
        Ok(Self { input })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_rejects_wrong_length() {
        assert!(G2AddData::try_from(&[0u8; 255][..]).is_err());
        assert!(G2AddData::try_from(&[0u8; 257][..]).is_err());
    }

    #[test]
    fn add_accepts_exact_length() {
        let bytes = [0u8; G2_ADD_INPUT_SIZE];
        assert_eq!(
            G2AddData::try_from(&bytes[..]).unwrap().input.len(),
            G2_ADD_INPUT_SIZE
        );
    }

    #[test]
    fn mul_accepts_exact_length() {
        let bytes = [0u8; G2_MUL_INPUT_SIZE];
        assert_eq!(
            G2MulData::try_from(&bytes[..]).unwrap().input.len(),
            G2_MUL_INPUT_SIZE
        );
    }
}
