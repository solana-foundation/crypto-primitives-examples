use pinocchio::error::ProgramError;

use crate::errors::CryptoPrimitivesProgramError;

pub const BLS_G1_POINT_SIZE: usize = 96;
pub const BLS_G2_POINT_SIZE: usize = 192;
pub const BLS_SCALAR_SIZE: usize = 32;

/// Splits instruction data into two operands, requiring an exact total length.
///
/// For point addition/subtraction both operands are points; for scalar
/// multiplication the left operand is the scalar and the right is the point.
#[inline(always)]
pub fn split_operands(
    data: &[u8],
    left_len: usize,
    right_len: usize,
) -> Result<(&[u8], &[u8]), ProgramError> {
    if data.len() != left_len + right_len {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }
    Ok(data.split_at(left_len))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_at_boundary() {
        let data = [7u8; BLS_G1_POINT_SIZE * 2];
        let (l, r) = split_operands(&data, BLS_G1_POINT_SIZE, BLS_G1_POINT_SIZE).unwrap();
        assert_eq!(l.len(), BLS_G1_POINT_SIZE);
        assert_eq!(r.len(), BLS_G1_POINT_SIZE);
    }

    #[test]
    fn rejects_wrong_total() {
        let data = [0u8; BLS_G1_POINT_SIZE * 2 - 1];
        assert!(split_operands(&data, BLS_G1_POINT_SIZE, BLS_G1_POINT_SIZE).is_err());
    }
}
