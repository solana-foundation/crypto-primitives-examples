use pinocchio::error::ProgramError;

use crate::errors::CryptoPrimitivesProgramError;

#[inline(always)]
pub fn alt_bn128_group_op(
    group_op: u64,
    input: &[u8],
    output: &mut [u8],
) -> Result<(), ProgramError> {
    #[cfg(target_os = "solana")]
    {
        let code = unsafe {
            pinocchio::syscalls::sol_alt_bn128_group_op(
                group_op,
                input.as_ptr(),
                input.len() as u64,
                output.as_mut_ptr(),
            )
        };
        match code {
            0 => Ok(()),
            _ => Err(CryptoPrimitivesProgramError::SyscallFailed.into()),
        }
    }
    #[cfg(not(target_os = "solana"))]
    {
        let _ = (group_op, input, output);
        Err(CryptoPrimitivesProgramError::SyscallUnavailable.into())
    }
}

#[inline(always)]
pub fn curve_group_op(
    curve_id: u64,
    group_op: u64,
    left: &[u8],
    right: &[u8],
    output: &mut [u8],
) -> Result<(), ProgramError> {
    #[cfg(target_os = "solana")]
    {
        let code = unsafe {
            pinocchio::syscalls::sol_curve_group_op(
                curve_id,
                group_op,
                left.as_ptr(),
                right.as_ptr(),
                output.as_mut_ptr(),
            )
        };
        match code {
            0 => Ok(()),
            _ => Err(CryptoPrimitivesProgramError::SyscallFailed.into()),
        }
    }
    #[cfg(not(target_os = "solana"))]
    {
        let _ = (curve_id, group_op, left, right, output);
        Err(CryptoPrimitivesProgramError::SyscallUnavailable.into())
    }
}

#[inline(always)]
pub fn set_return_data(data: &[u8]) {
    #[cfg(target_os = "solana")]
    unsafe {
        pinocchio::syscalls::sol_set_return_data(data.as_ptr(), data.len() as u64);
    }
    #[cfg(not(target_os = "solana"))]
    {
        let _ = data;
    }
}
