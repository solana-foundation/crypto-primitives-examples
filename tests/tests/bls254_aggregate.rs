//! Integration tests for the inline BN254 aggregate-signature verification
//! (instruction 9). Test vectors are generated deterministically by
//! `apps/web/scripts/gen-test-vectors.ts` (message "approve proposal #42",
//! BLS secrets 1, 2, 3).

use {
    mollusk_svm::{result::Check, Mollusk},
    solana_instruction::Instruction,
    solana_program_error::ProgramError,
    solana_pubkey::Pubkey,
    std::str::FromStr,
};

const PROGRAM_ID: &str = "EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw";
const IX_BLS254_AGGREGATE_VERIFY: u8 = 9;

const BN254_PUBKEY_1: &str = "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";
const BN254_PUBKEY_2: &str = "203e205db4f19b37b60121b83a7333706db86431c6d835849957ed8c3928ad7927dc7234fd11d3e8c36c59277c3e6f149d5cd3cfa9a62aee49f8130962b4b3b9195e8aa5b7827463722b8c153931579d3505566b4edf48d498e185f0509de15204bb53b8977e5f92a0bc372742c4830944a59b4fe6b1c0466e2a6dad122b5d2e";
const BN254_PUBKEY_3: &str = "1014772f57bb9742735191cd5dcfe4ebbc04156b6878a0a7c9824f32ffb66e8506064e784db10e9051e52826e192715e8d7e478cb09a5e0012defa0694fbc7f5021e2335f3354bb7922ffcc2f38d3323dd9453ac49b55441452aeaca147711b2058e1d5681b5b9e0074b0f9c8d2c68a069b920d74521e79765036d57666c5597";
const BN254_NEGATED_MESSAGE_HASH: &str = "093cccf0e7508f50d86197799d553d23be9a52fecf9fa7d309f3f6a6a0bae1dd25592fd60d368265921cb7232eec3492210e46b4b95682469e7590b0d2df6f28";
const BN254_AGG_SIG_ALL: &str = "06a6497a71f97597f1acf925b1f67eca5b5dd8011f7140e08f484e57dc79bff61b8268216fa30b6505352cdde4fc0d71a005296166f81bfe8edbde2352a6abbf";
const BN254_AGG_SIG_FIRST_TWO: &str = "29da90779ff721fffa657af0a02eb50fcb18cc8176e4d63127827a1767d69c7e227c651364e066d84349de32d97fd6b7f423a1e2b9a162ba061337d5a29e9303";

fn from_hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

fn mollusk() -> (Mollusk, Pubkey) {
    std::env::set_var(
        "SBF_OUT_DIR",
        concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy"),
    );
    let program_id = Pubkey::from_str(PROGRAM_ID).unwrap();
    (Mollusk::new(&program_id, "crypto_primitives"), program_id)
}

/// `aggregate_signature ‖ negated_message_hash ‖ pubkey...`
fn verify_instruction(program_id: Pubkey, agg_sig: &str, pubkeys: &[&str]) -> Instruction {
    let mut data = vec![IX_BLS254_AGGREGATE_VERIFY];
    data.extend_from_slice(&from_hex(agg_sig));
    data.extend_from_slice(&from_hex(BN254_NEGATED_MESSAGE_HASH));
    for pubkey in pubkeys {
        data.extend_from_slice(&from_hex(pubkey));
    }
    Instruction::new_with_bytes(program_id, &data, vec![])
}

/// The aggregate of all three signatures satisfies the pairing relation against
/// the aggregate of all three public keys.
#[test]
fn aggregate_of_all_signers_verifies() {
    let (mollusk, program_id) = mollusk();
    let instruction = verify_instruction(
        program_id,
        BN254_AGG_SIG_ALL,
        &[BN254_PUBKEY_1, BN254_PUBKEY_2, BN254_PUBKEY_3],
    );
    let result = mollusk.process_and_validate_instruction(&instruction, &[], &[Check::success()]);
    println!(
        "bls254 aggregate-verify (3 signers) compute units: {}",
        result.compute_units_consumed
    );
}

/// A signature aggregated from only two of the three signers must fail the
/// pairing check against all three public keys.
#[test]
fn partial_aggregate_is_rejected() {
    let (mollusk, program_id) = mollusk();
    let instruction = verify_instruction(
        program_id,
        BN254_AGG_SIG_FIRST_TWO,
        &[BN254_PUBKEY_1, BN254_PUBKEY_2, BN254_PUBKEY_3],
    );
    mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::err(ProgramError::Custom(4))], // AggregateVerifyFailed
    );
}

/// Instruction data that isn't a header plus whole G2 points is rejected.
#[test]
fn malformed_input_is_rejected() {
    let (mollusk, program_id) = mollusk();
    let mut data = vec![IX_BLS254_AGGREGATE_VERIFY];
    data.extend_from_slice(&from_hex(BN254_AGG_SIG_ALL));
    data.extend_from_slice(&from_hex(BN254_NEGATED_MESSAGE_HASH));
    data.extend_from_slice(&[0u8; 64]); // half a G2 point
    let instruction = Instruction::new_with_bytes(program_id, &data, vec![]);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::err(ProgramError::Custom(1))], // InvalidInputLength
    );
}
