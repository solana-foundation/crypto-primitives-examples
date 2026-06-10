use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

use crate::{errors::CryptoPrimitivesProgramError, syscall::curve_group_op};

const BLS12_381_G2: u64 = 6 | 0x80;
const GROUP_OP_ADD: u64 = 0;
const GROUP_OP_SUB: u64 = 1;

const G2_POINT: usize = 192;
const COUNT_PREFIX: usize = 2;

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
        curve_group_op(BLS12_381_G2, GROUP_OP_ADD, &current, instruction_data, &mut updated)?;
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
        curve_group_op(BLS12_381_G2, GROUP_OP_SUB, &current, instruction_data, &mut updated)?;
        data[COUNT_PREFIX..COUNT_PREFIX + G2_POINT].copy_from_slice(&updated);
    }
    data[..COUNT_PREFIX].copy_from_slice(&(count - 1).to_le_bytes());
    Ok(())
}
