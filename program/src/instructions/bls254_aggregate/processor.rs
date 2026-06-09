use pinocchio::{account::AccountView, Address, ProgramResult};

use crate::{
    bn254::{aggregate_g2, aggregate_verify, G1_POINT, G2_POINT},
    errors::CryptoPrimitivesProgramError,
    syscall::set_return_data,
};

const HEADER: usize = G1_POINT * 2;

/// Processes the Bls254AggregateVerify instruction.
///
/// # Layout
/// `aggregate_signature` (G1, 64 bytes) ‖ `negated_message_hash` (G1, 64 bytes)
/// ‖ one or more big-endian G2 public keys (128 bytes each).
///
/// Aggregates the public keys on-chain via the G2 addition syscall, then checks
/// the BLS pairing relation `e(aggSig, G2) · e(-H(m), aggPk) == 1`. Returns the
/// on-chain aggregate public key as return data.
pub fn process_bls254_aggregate_verify(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() < HEADER + G2_POINT
        || !(instruction_data.len() - HEADER).is_multiple_of(G2_POINT)
    {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    let aggregate_signature = &instruction_data[..G1_POINT];
    let negated_message_hash = &instruction_data[G1_POINT..HEADER];
    let aggregate_pubkey = aggregate_g2(&instruction_data[HEADER..])?;

    if !aggregate_verify(aggregate_signature, negated_message_hash, &aggregate_pubkey)? {
        return Err(CryptoPrimitivesProgramError::AggregateVerifyFailed.into());
    }

    set_return_data(&aggregate_pubkey);
    Ok(())
}
