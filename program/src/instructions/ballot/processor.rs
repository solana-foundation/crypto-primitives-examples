use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

use crate::{errors::CryptoPrimitivesProgramError, syscall::curve_group_op};

const CURVE25519_RISTRETTO: u64 = 1;
const GROUP_OP_ADD: u64 = 0;

const POINT: usize = 32;
const CIPHERTEXT: usize = 64;
const COUNT_PREFIX: usize = 2;

fn ballot_count(data: &[u8]) -> u16 {
    u16::from_le_bytes([data[0], data[1]])
}

fn tally_account<'a>(
    program_id: &Address,
    accounts: &'a [AccountView],
    instruction_data: &[u8],
) -> Result<&'a AccountView, ProgramError> {
    let account = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !account.is_writable() || !account.owned_by(program_id) {
        return Err(CryptoPrimitivesProgramError::InvalidBallotAccount.into());
    }
    if instruction_data.len() != CIPHERTEXT {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }
    Ok(account)
}

/// Adds a twisted ElGamal ballot ciphertext (64 bytes: 32-byte commitment then
/// 32-byte decrypt handle) to the tally account's running encrypted total via
/// two ristretto255 additions. The account stores `[count: u16-le][tally: 64]`.
pub fn process_ballot_tally_add(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let account = tally_account(program_id, accounts, instruction_data)?;
    let mut data = account.try_borrow_mut()?;
    if data.len() < COUNT_PREFIX + CIPHERTEXT {
        return Err(CryptoPrimitivesProgramError::InvalidBallotAccount.into());
    }

    let count = ballot_count(&data);
    if count == 0 {
        data[COUNT_PREFIX..COUNT_PREFIX + CIPHERTEXT].copy_from_slice(instruction_data);
    } else {
        for offset in [0, POINT] {
            let mut current = [0u8; POINT];
            current.copy_from_slice(&data[COUNT_PREFIX + offset..COUNT_PREFIX + offset + POINT]);
            let mut updated = [0u8; POINT];
            curve_group_op(
                CURVE25519_RISTRETTO,
                GROUP_OP_ADD,
                &current,
                &instruction_data[offset..offset + POINT],
                &mut updated,
            )?;
            data[COUNT_PREFIX + offset..COUNT_PREFIX + offset + POINT].copy_from_slice(&updated);
        }
    }
    data[..COUNT_PREFIX].copy_from_slice(&(count + 1).to_le_bytes());
    Ok(())
}
