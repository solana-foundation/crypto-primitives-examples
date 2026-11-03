use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

use crate::{
    errors::CryptoPrimitivesProgramError,
    syscall::{curve_group_op, curve_pairing_map},
};

const BLS12_381: u64 = 4 | 0x80;
const BLS12_381_G2: u64 = 6 | 0x80;
const GROUP_OP_ADD: u64 = 0;
const GROUP_OP_SUB: u64 = 1;

const G1_POINT: usize = 96;
const G2_POINT: usize = 192;
const GT_ELEMENT: usize = 576;
const COUNT_PREFIX: usize = 2;
const INFINITY_FLAG: u8 = 0x40;

const G2_GENERATOR: [u8; G2_POINT] = [
    0x13, 0xe0, 0x2b, 0x60, 0x52, 0x71, 0x9f, 0x60, 0x7d, 0xac, 0xd3, 0xa0, 0x88, 0x27, 0x4f, 0x65,
    0x59, 0x6b, 0xd0, 0xd0, 0x99, 0x20, 0xb6, 0x1a, 0xb5, 0xda, 0x61, 0xbb, 0xdc, 0x7f, 0x50, 0x49,
    0x33, 0x4c, 0xf1, 0x12, 0x13, 0x94, 0x5d, 0x57, 0xe5, 0xac, 0x7d, 0x05, 0x5d, 0x04, 0x2b, 0x7e,
    0x02, 0x4a, 0xa2, 0xb2, 0xf0, 0x8f, 0x0a, 0x91, 0x26, 0x08, 0x05, 0x27, 0x2d, 0xc5, 0x10, 0x51,
    0xc6, 0xe4, 0x7a, 0xd4, 0xfa, 0x40, 0x3b, 0x02, 0xb4, 0x51, 0x0b, 0x64, 0x7a, 0xe3, 0xd1, 0x77,
    0x0b, 0xac, 0x03, 0x26, 0xa8, 0x05, 0xbb, 0xef, 0xd4, 0x80, 0x56, 0xc8, 0xc1, 0x21, 0xbd, 0xb8,
    0x06, 0x06, 0xc4, 0xa0, 0x2e, 0xa7, 0x34, 0xcc, 0x32, 0xac, 0xd2, 0xb0, 0x2b, 0xc2, 0x8b, 0x99,
    0xcb, 0x3e, 0x28, 0x7e, 0x85, 0xa7, 0x63, 0xaf, 0x26, 0x74, 0x92, 0xab, 0x57, 0x2e, 0x99, 0xab,
    0x3f, 0x37, 0x0d, 0x27, 0x5c, 0xec, 0x1d, 0xa1, 0xaa, 0xa9, 0x07, 0x5f, 0xf0, 0x5f, 0x79, 0xbe,
    0x0c, 0xe5, 0xd5, 0x27, 0x72, 0x7d, 0x6e, 0x11, 0x8c, 0xc9, 0xcd, 0xc6, 0xda, 0x2e, 0x35, 0x1a,
    0xad, 0xfd, 0x9b, 0xaa, 0x8c, 0xbd, 0xd3, 0xa7, 0x6d, 0x42, 0x9a, 0x69, 0x51, 0x60, 0xd1, 0x2c,
    0x92, 0x3a, 0xc9, 0xcc, 0x3b, 0xac, 0xa2, 0x89, 0xe1, 0x93, 0x54, 0x86, 0x08, 0xb8, 0x28, 0x01,
];

fn member_count(data: &[u8]) -> u16 {
    u16::from_le_bytes([data[0], data[1]])
}

fn registry_account<'a>(
    program_id: &Address,
    accounts: &'a [AccountView],
    instruction_data: &[u8],
) -> Result<&'a AccountView, ProgramError> {
    let account = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !account.is_writable() || !account.owned_by(program_id) {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    if instruction_data.len() != G2_POINT {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }
    Ok(account)
}

/// Adds a BLS12-381 G2 public key (192 bytes) to the registry's aggregate key
/// via the G2 addition syscall. The account stores `[count: u16-le][aggregate]`.
pub fn process_bls_registry_add(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let account = registry_account(program_id, accounts, instruction_data)?;
    let mut data = account.try_borrow_mut()?;
    if data.len() < COUNT_PREFIX + G2_POINT {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }

    let count = member_count(&data);
    if count == 0 {
        data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT].copy_from_slice(instruction_data);
    } else {
        let mut current = [0u8; G2_POINT];
        current.copy_from_slice(&data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT]);
        let mut updated = [0u8; G2_POINT];
        curve_group_op(
            BLS12_381_G2,
            GROUP_OP_ADD,
            &current,
            instruction_data,
            &mut updated,
        )?;
        data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT].copy_from_slice(&updated);
    }
    data[..COUNT_PREFIX].copy_from_slice(&(count + 1).to_le_bytes());
    Ok(())
}

/// Removes a BLS12-381 G2 public key from the registry's aggregate key via the
/// G2 subtraction syscall (BLS12-381 has native subtraction).
pub fn process_bls_registry_remove(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let account = registry_account(program_id, accounts, instruction_data)?;
    let mut data = account.try_borrow_mut()?;
    if data.len() < COUNT_PREFIX + G2_POINT {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }

    let count = member_count(&data);
    if count == 0 {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    if count == 1 {
        data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT].fill(0);
    } else {
        let mut current = [0u8; G2_POINT];
        current.copy_from_slice(&data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT]);
        let mut updated = [0u8; G2_POINT];
        curve_group_op(
            BLS12_381_G2,
            GROUP_OP_SUB,
            &current,
            instruction_data,
            &mut updated,
        )?;
        data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT].copy_from_slice(&updated);
    }
    data[..COUNT_PREFIX].copy_from_slice(&(count - 1).to_le_bytes());
    Ok(())
}

/// Verifies an aggregate BLS signature against the registry's on-chain
/// aggregate key with one BLS12-381 pairing call. The instruction data is
/// `aggregate_signature` (G1, 96 bytes) ‖ `negated_message_hash` (G1, 96 bytes);
/// it passes only when `e(signature, G2) * e(-H(m), aggregate_key) == 1`.
pub fn process_bls_registry_verify(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let account = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !account.owned_by(program_id) {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    if instruction_data.len() != G1_POINT * 2 {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    // e(O, Q) = 1 for any Q, so identity inputs would pass the pairing check
    // without any member signing.
    if instruction_data[0] & INFINITY_FLAG != 0 || instruction_data[G1_POINT] & INFINITY_FLAG != 0 {
        return Err(CryptoPrimitivesProgramError::AggregateVerifyFailed.into());
    }

    let data = account.try_borrow()?;
    if data.len() < COUNT_PREFIX + G2_POINT {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    if member_count(&data) == 0 {
        return Err(CryptoPrimitivesProgramError::AggregateVerifyFailed.into());
    }

    let mut g2_points = [0u8; G2_POINT * 2];
    g2_points[..G2_POINT].copy_from_slice(&G2_GENERATOR);
    g2_points[G2_POINT..].copy_from_slice(&data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT]);

    let mut result = [0u8; GT_ELEMENT];
    curve_pairing_map(BLS12_381, 2, instruction_data, &g2_points, &mut result)?;

    let (rest, last) = result.split_at(GT_ELEMENT - 1);
    if last[0] != 1 || rest.iter().any(|&byte| byte != 0) {
        return Err(CryptoPrimitivesProgramError::AggregateVerifyFailed.into());
    }
    Ok(())
}
