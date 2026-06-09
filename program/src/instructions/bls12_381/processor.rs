use pinocchio::{account::AccountView, Address, ProgramResult};

use crate::{
    instructions::bls12_381::{
        split_operands, BLS_G1_POINT_SIZE, BLS_G2_POINT_SIZE, BLS_SCALAR_SIZE,
    },
    syscall::{curve_group_op, set_return_data},
};

const BLS12_381_G1: u64 = 5 | 0x80;
const BLS12_381_G2: u64 = 6 | 0x80;
const ADD: u64 = 0;
const SUB: u64 = 1;
const MUL: u64 = 2;

#[inline(always)]
fn point_op<const POINT: usize>(
    curve_id: u64,
    group_op: u64,
    instruction_data: &[u8],
) -> ProgramResult {
    let (left, right) = split_operands(instruction_data, POINT, POINT)?;
    let mut result = [0u8; POINT];
    curve_group_op(curve_id, group_op, left, right, &mut result)?;
    set_return_data(&result);
    Ok(())
}

#[inline(always)]
fn scalar_mul<const POINT: usize>(curve_id: u64, instruction_data: &[u8]) -> ProgramResult {
    let (scalar, point) = split_operands(instruction_data, BLS_SCALAR_SIZE, POINT)?;
    let mut result = [0u8; POINT];
    curve_group_op(curve_id, MUL, scalar, point, &mut result)?;
    set_return_data(&result);
    Ok(())
}

/// Adds two big-endian BLS12-381 G1 points (96 bytes each).
pub fn process_bls12_381_g1_add(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    point_op::<BLS_G1_POINT_SIZE>(BLS12_381_G1, ADD, instruction_data)
}

/// Subtracts two big-endian BLS12-381 G1 points (96 bytes each).
pub fn process_bls12_381_g1_sub(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    point_op::<BLS_G1_POINT_SIZE>(BLS12_381_G1, SUB, instruction_data)
}

/// Multiplies a big-endian BLS12-381 G1 point by a 32-byte big-endian scalar.
pub fn process_bls12_381_g1_mul(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    scalar_mul::<BLS_G1_POINT_SIZE>(BLS12_381_G1, instruction_data)
}

/// Adds two big-endian BLS12-381 G2 points (192 bytes each).
pub fn process_bls12_381_g2_add(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    point_op::<BLS_G2_POINT_SIZE>(BLS12_381_G2, ADD, instruction_data)
}

/// Subtracts two big-endian BLS12-381 G2 points (192 bytes each).
pub fn process_bls12_381_g2_sub(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    point_op::<BLS_G2_POINT_SIZE>(BLS12_381_G2, SUB, instruction_data)
}

/// Multiplies a big-endian BLS12-381 G2 point by a 32-byte big-endian scalar.
pub fn process_bls12_381_g2_mul(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    scalar_mul::<BLS_G2_POINT_SIZE>(BLS12_381_G2, instruction_data)
}
