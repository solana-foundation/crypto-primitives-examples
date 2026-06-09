use codama::CodamaErrors;
use pinocchio::error::ProgramError;
use thiserror::Error;

/// Errors that may be returned by the Crypto Primitives Program.
#[derive(Clone, Debug, Eq, PartialEq, Error, CodamaErrors)]
pub enum CryptoPrimitivesProgramError {
    /// (0) Instruction data could not be parsed
    #[error("Instruction data could not be parsed")]
    InvalidInstructionData,
    /// (1) Instruction input was not the expected length
    #[error("Instruction input was not the expected length")]
    InvalidInputLength,
    /// (2) A cryptographic syscall returned a non-zero error code
    #[error("A cryptographic syscall returned a non-zero error code")]
    SyscallFailed,
    /// (3) Syscall is only available on-chain
    #[error("Syscall is only available on-chain")]
    SyscallUnavailable,
    /// (4) Aggregate signature failed pairing verification
    #[error("Aggregate signature failed pairing verification")]
    AggregateVerifyFailed,
    /// (5) Multisig account is not owned by this program or is not writable
    #[error("Multisig account is not owned by this program or is not writable")]
    InvalidMultisigAccount,
    /// (6) Multisig account does not have capacity for more signers
    #[error("Multisig account does not have capacity for more signers")]
    MultisigFull,
}

impl From<CryptoPrimitivesProgramError> for ProgramError {
    fn from(e: CryptoPrimitivesProgramError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_conversion() {
        let error: ProgramError = CryptoPrimitivesProgramError::InvalidInstructionData.into();
        assert_eq!(error, ProgramError::Custom(0));
    }
}
