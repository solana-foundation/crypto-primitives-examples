use pinocchio::{account::AccountView, entrypoint, error::ProgramError, Address, ProgramResult};

use crate::instructions::{
    process_altbn128_g2_add, process_altbn128_g2_mul, process_bls12_381_g1_add,
    process_bls12_381_g1_mul, process_bls12_381_g1_sub, process_bls12_381_g2_add,
    process_bls12_381_g2_mul, process_bls12_381_g2_sub, process_bls254_aggregate_verify,
    process_multisig_add_signers, process_multisig_verify, process_noop,
    CryptoPrimitivesInstructionDiscriminators,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let (discriminator, instruction_data) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    let ix_discriminator = CryptoPrimitivesInstructionDiscriminators::try_from(*discriminator)?;

    match ix_discriminator {
        CryptoPrimitivesInstructionDiscriminators::Noop => {
            process_noop(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::AltBn128G2Add => {
            process_altbn128_g2_add(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::AltBn128G2Mul => {
            process_altbn128_g2_mul(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G1Add => {
            process_bls12_381_g1_add(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G1Sub => {
            process_bls12_381_g1_sub(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G1Mul => {
            process_bls12_381_g1_mul(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G2Add => {
            process_bls12_381_g2_add(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G2Sub => {
            process_bls12_381_g2_sub(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls12381G2Mul => {
            process_bls12_381_g2_mul(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::Bls254AggregateVerify => {
            process_bls254_aggregate_verify(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::MultisigAddSigners => {
            process_multisig_add_signers(program_id, accounts, instruction_data)
        }
        CryptoPrimitivesInstructionDiscriminators::MultisigVerify => {
            process_multisig_verify(program_id, accounts, instruction_data)
        }
    }
}
