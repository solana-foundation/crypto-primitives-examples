use pinocchio::{account::AccountView, Address, ProgramResult};

use crate::{
    instructions::altbn128_g2::{G2AddData, G2MulData, G2_POINT_SIZE},
    syscall::{alt_bn128_group_op, set_return_data},
};

pub const ALT_BN128_G2_ADD: u64 = 4;
pub const ALT_BN128_G2_MUL: u64 = 6;

/// Processes the AltBn128G2Add instruction.
///
/// Adds two big-endian G2 points via the `sol_alt_bn128_group_op` syscall and
/// returns the resulting 128-byte G2 point as return data.
pub fn process_altbn128_g2_add(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let data = G2AddData::try_from(instruction_data)?;

    let mut result = [0u8; G2_POINT_SIZE];
    alt_bn128_group_op(ALT_BN128_G2_ADD, data.input, &mut result)?;

    set_return_data(&result);
    Ok(())
}

/// Processes the AltBn128G2Mul instruction.
///
/// Multiplies a big-endian G2 point by a big-endian 32-byte scalar via the
/// `sol_alt_bn128_group_op` syscall and returns the resulting 128-byte G2 point
/// as return data.
pub fn process_altbn128_g2_mul(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let data = G2MulData::try_from(instruction_data)?;

    let mut result = [0u8; G2_POINT_SIZE];
    alt_bn128_group_op(ALT_BN128_G2_MUL, data.input, &mut result)?;

    set_return_data(&result);
    Ok(())
}
