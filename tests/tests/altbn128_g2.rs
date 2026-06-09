use {
    mollusk_svm::{result::Check, Mollusk},
    solana_instruction::Instruction,
    solana_program_error::ProgramError,
    solana_pubkey::Pubkey,
    std::str::FromStr,
};

const PROGRAM_ID: &str = "EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw";
const IX_ALT_BN128_G2_ADD: u8 = 1;
const IX_ALT_BN128_G2_MUL: u8 = 2;

const G2_POINT_SIZE: usize = 128;
const SCALAR_SIZE: usize = 32;
const G2_ADD_INPUT_SIZE: usize = G2_POINT_SIZE * 2;
const G2_MUL_INPUT_SIZE: usize = G2_POINT_SIZE + SCALAR_SIZE;

// Big-endian alt_bn128 G2 points derived from the BN254 G2 generator and
// cross-checked against solana-bn254's reference implementation:
// GENERATOR + 2*GENERATOR == 3*GENERATOR.
const G2_GENERATOR: &str = "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";
const G2_TWO_GENERATOR: &str = "203e205db4f19b37b60121b83a7333706db86431c6d835849957ed8c3928ad7927dc7234fd11d3e8c36c59277c3e6f149d5cd3cfa9a62aee49f8130962b4b3b9995e8aa5b7827463722b8c153931579d3505566b4edf48d498e185f0509de15204bb53b8977e5f92a0bc372742c4830944a59b4fe6b1c0466e2a6dad122b5d2e";
const G2_THREE_GENERATOR: &str = "1014772f57bb9742735191cd5dcfe4ebbc04156b6878a0a7c9824f32ffb66e8506064e784db10e9051e52826e192715e8d7e478cb09a5e0012defa0694fbc7f5021e2335f3354bb7922ffcc2f38d3323dd9453ac49b55441452aeaca147711b2058e1d5681b5b9e0074b0f9c8d2c68a069b920d74521e79765036d57666c5597";

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

fn g2_add_instruction(program_id: Pubkey, input: &[u8; G2_ADD_INPUT_SIZE]) -> Instruction {
    let mut data = Vec::with_capacity(1 + G2_ADD_INPUT_SIZE);
    data.push(IX_ALT_BN128_G2_ADD);
    data.extend_from_slice(input);
    Instruction::new_with_bytes(program_id, &data, vec![])
}

/// Proves the agave-4.0 `sol_alt_bn128_group_op` G2 syscall executes under Mollusk:
/// the point at infinity (all-zero encoding) added to itself returns the point at
/// infinity, and we surface the compute units the syscall costs.
#[test]
fn g2_add_identity_plus_identity_is_identity() {
    let (mollusk, program_id) = mollusk();

    let input = [0u8; G2_ADD_INPUT_SIZE];
    let identity = [0u8; G2_POINT_SIZE];
    let instruction = g2_add_instruction(program_id, &input);

    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::success(), Check::return_data(&identity)],
    );

    println!(
        "alt_bn128 G2 add (O + O) compute units: {}",
        result.compute_units_consumed
    );
}

/// Verifies real G2 curve arithmetic: GENERATOR + 2*GENERATOR == 3*GENERATOR.
#[test]
fn g2_add_generator_plus_double_is_triple() {
    let (mollusk, program_id) = mollusk();

    let mut input = [0u8; G2_ADD_INPUT_SIZE];
    input[..G2_POINT_SIZE].copy_from_slice(&from_hex(G2_GENERATOR));
    input[G2_POINT_SIZE..].copy_from_slice(&from_hex(G2_TWO_GENERATOR));
    let expected = from_hex(G2_THREE_GENERATOR);

    let instruction = g2_add_instruction(program_id, &input);
    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::success(), Check::return_data(&expected)],
    );

    println!(
        "alt_bn128 G2 add (G + 2G) compute units: {}",
        result.compute_units_consumed
    );
}

/// Verifies real G2 scalar multiplication: GENERATOR * 3 == 3*GENERATOR.
#[test]
fn g2_mul_generator_times_three_is_triple() {
    let (mollusk, program_id) = mollusk();

    let mut input = [0u8; G2_MUL_INPUT_SIZE];
    input[..G2_POINT_SIZE].copy_from_slice(&from_hex(G2_GENERATOR));
    input[G2_MUL_INPUT_SIZE - 1] = 3; // big-endian scalar = 3
    let expected = from_hex(G2_THREE_GENERATOR);

    let mut data = vec![IX_ALT_BN128_G2_MUL];
    data.extend_from_slice(&input);
    let instruction = Instruction::new_with_bytes(program_id, &data, vec![]);

    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::success(), Check::return_data(&expected)],
    );

    println!(
        "alt_bn128 G2 mul (G * 3) compute units: {}",
        result.compute_units_consumed
    );
}

/// Wrong input length must be rejected before the syscall runs.
#[test]
fn g2_add_rejects_wrong_input_length() {
    let (mollusk, program_id) = mollusk();

    let mut data = vec![IX_ALT_BN128_G2_ADD];
    data.extend_from_slice(&[0u8; G2_ADD_INPUT_SIZE - 1]);
    let instruction = Instruction::new_with_bytes(program_id, &data, vec![]);

    mollusk.process_and_validate_instruction(
        &instruction,
        &[],
        &[Check::err(ProgramError::Custom(1))],
    );
}
