use curve25519_dalek::{constants::ED25519_BASEPOINT_COMPRESSED, scalar::Scalar};
use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

use crate::{
    errors::CryptoPrimitivesProgramError,
    syscall::{curve_group_op, curve_multiscalar_mul, sha512},
};

const CURVE25519_EDWARDS: u64 = 0;
const ADD: u64 = 0;
const POINT: usize = 32;
const HEADER: usize = POINT * 3;
const IDENTITY: [u8; POINT] = {
    let mut point = [0u8; POINT];
    point[0] = 1;
    point
};

/// Processes the Ed25519Verify instruction.
///
/// # Layout
/// `pubkey` (32 bytes) ‖ `signature` (`R` 32 bytes ‖ `S` 32 bytes) ‖ `message`.
///
/// Checks `[S]B - [k]A == R` with `k = SHA-512(R ‖ A ‖ message) mod L`, using
/// `sol_sha512` for the hash and `sol_curve_multiscalar_mul` for the curve math.
/// Applies the precompile's strict rules: `S` must be canonical and neither `A`
/// nor `R` may be a small-order point.
pub fn process_ed25519_verify(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() < HEADER {
        return Err(CryptoPrimitivesProgramError::InvalidInputLength.into());
    }

    let (pubkey, rest) = instruction_data.split_at(POINT);
    let (r, rest) = rest.split_at(POINT);
    let (s, message) = rest.split_at(POINT);

    if !verify(pubkey, r, s, message)? {
        return Err(CryptoPrimitivesProgramError::SignatureVerifyFailed.into());
    }
    Ok(())
}

fn verify(pubkey: &[u8], r: &[u8], s: &[u8], message: &[u8]) -> Result<bool, ProgramError> {
    let Some(s) = Option::<Scalar>::from(Scalar::from_canonical_bytes(s.try_into().unwrap()))
    else {
        return Ok(false);
    };
    if is_invalid_or_small_order(pubkey) || is_invalid_or_small_order(r) {
        return Ok(false);
    }

    let mut hash = [0u8; 64];
    sha512(&[r, pubkey, message], &mut hash)?;
    let k = Scalar::from_bytes_mod_order_wide(&hash);

    let mut scalars = [0u8; POINT * 2];
    scalars[..POINT].copy_from_slice(s.as_bytes());
    scalars[POINT..].copy_from_slice((-k).as_bytes());
    let mut points = [0u8; POINT * 2];
    points[..POINT].copy_from_slice(ED25519_BASEPOINT_COMPRESSED.as_bytes());
    points[POINT..].copy_from_slice(pubkey);

    let mut expected_r = [0u8; POINT];
    curve_multiscalar_mul(CURVE25519_EDWARDS, &scalars, &points, 2, &mut expected_r)?;
    Ok(expected_r == r)
}

fn is_invalid_or_small_order(point: &[u8]) -> bool {
    let mut multiple: [u8; POINT] = point.try_into().unwrap();
    for _ in 0..3 {
        let doubled = multiple;
        if curve_group_op(CURVE25519_EDWARDS, ADD, &doubled, &doubled, &mut multiple).is_err() {
            return true;
        }
    }
    multiple == IDENTITY
}
