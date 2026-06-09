use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

use crate::{
    bn254::{aggregate_g2, aggregate_verify, G1_POINT, G2_POINT},
    errors::CryptoPrimitivesProgramError,
    syscall::set_return_data,
};

const COUNT_PREFIX: usize = 2;
const VERIFY_INPUT: usize = G1_POINT * 2;

fn signer_count(data: &[u8]) -> usize {
    u16::from_le_bytes([data[0], data[1]]) as usize
}

/// Processes the MultisigAddSigners instruction.
///
/// Account 0 is the multisig account (writable, owned by this program). Its data
/// is `[count: u16-le][G2 pubkey; count]`. The instruction data is a chunk of one
/// or more big-endian G2 public keys (128 bytes each) appended to the account.
pub fn process_multisig_add_signers(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let multisig = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !multisig.is_writable() || !multisig.owned_by(program_id) {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    if instruction_data.is_empty() || !instruction_data.len().is_multiple_of(G2_POINT) {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    let mut data = multisig.try_borrow_mut()?;
    if data.len() < COUNT_PREFIX {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }

    let count = signer_count(&data);
    let added = instruction_data.len() / G2_POINT;
    let start = COUNT_PREFIX + count * G2_POINT;
    let end = start + instruction_data.len();
    if end > data.len() {
        return Err(CryptoPrimitivesProgramError::MultisigFull.into());
    }

    data[start..end].copy_from_slice(instruction_data);
    let new_count = (count + added) as u16;
    data[..COUNT_PREFIX].copy_from_slice(&new_count.to_le_bytes());
    Ok(())
}

/// Processes the MultisigVerify instruction.
///
/// Account 0 is the multisig account (owned by this program). The instruction
/// data is `aggregate_signature` (G1, 64 bytes) ‖ `negated_message_hash` (G1, 64
/// bytes). Every stored public key is aggregated on-chain via the G2 addition
/// syscall, then the BLS pairing relation is checked — it only holds when every
/// stored signer contributed to the aggregate signature.
pub fn process_multisig_verify(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let multisig = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !multisig.owned_by(program_id) {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    if instruction_data.len() != VERIFY_INPUT {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    let aggregate_signature = &instruction_data[..G1_POINT];
    let negated_message_hash = &instruction_data[G1_POINT..];

    let data = multisig.try_borrow()?;
    if data.len() < COUNT_PREFIX {
        return Err(CryptoPrimitivesProgramError::InvalidMultisigAccount.into());
    }
    let count = signer_count(&data);
    let pubkeys = &data[COUNT_PREFIX..COUNT_PREFIX + count * G2_POINT];

    let aggregate_pubkey = aggregate_g2(pubkeys)?;
    if !aggregate_verify(aggregate_signature, negated_message_hash, &aggregate_pubkey)? {
        return Err(CryptoPrimitivesProgramError::AggregateVerifyFailed.into());
    }

    set_return_data(&aggregate_pubkey);
    Ok(())
}
