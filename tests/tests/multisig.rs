//! Integration tests for the stateful multisig instructions (10 add-signers,
//! 11 verify). Test vectors are generated deterministically by
//! `apps/web/scripts/gen-test-vectors.ts`.

use {
    mollusk_svm::{result::Check, Mollusk},
    solana_account::Account,
    solana_instruction::{AccountMeta, Instruction},
    solana_program_error::ProgramError,
    solana_pubkey::Pubkey,
    std::str::FromStr,
};

const PROGRAM_ID: &str = "EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw";
const IX_MULTISIG_ADD_SIGNERS: u8 = 10;
const IX_MULTISIG_VERIFY: u8 = 11;

const G2_POINT: usize = 128;
const COUNT_PREFIX: usize = 2;

const PUBKEY_1: &str = "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";
const PUBKEY_2: &str = "203e205db4f19b37b60121b83a7333706db86431c6d835849957ed8c3928ad7927dc7234fd11d3e8c36c59277c3e6f149d5cd3cfa9a62aee49f8130962b4b3b9195e8aa5b7827463722b8c153931579d3505566b4edf48d498e185f0509de15204bb53b8977e5f92a0bc372742c4830944a59b4fe6b1c0466e2a6dad122b5d2e";
const PUBKEY_3: &str = "1014772f57bb9742735191cd5dcfe4ebbc04156b6878a0a7c9824f32ffb66e8506064e784db10e9051e52826e192715e8d7e478cb09a5e0012defa0694fbc7f5021e2335f3354bb7922ffcc2f38d3323dd9453ac49b55441452aeaca147711b2058e1d5681b5b9e0074b0f9c8d2c68a069b920d74521e79765036d57666c5597";
const NEGATED_MESSAGE_HASH: &str = "093cccf0e7508f50d86197799d553d23be9a52fecf9fa7d309f3f6a6a0bae1dd25592fd60d368265921cb7232eec3492210e46b4b95682469e7590b0d2df6f28";
const AGG_SIG_ALL: &str = "06a6497a71f97597f1acf925b1f67eca5b5dd8011f7140e08f484e57dc79bff61b8268216fa30b6505352cdde4fc0d71a005296166f81bfe8edbde2352a6abbf";
const AGG_SIG_FIRST_TWO: &str = "29da90779ff721fffa657af0a02eb50fcb18cc8176e4d63127827a1767d69c7e227c651364e066d84349de32d97fd6b7f423a1e2b9a162ba061337d5a29e9303";

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

/// A program-owned multisig account sized for `capacity` signers, holding
/// `members` already-registered pubkeys.
fn multisig_account(program_id: &Pubkey, capacity: usize, members: &[&str]) -> Account {
    let space = COUNT_PREFIX + capacity * G2_POINT;
    let mut account = Account::new(1_000_000_000, space, program_id);
    account.data[..COUNT_PREFIX].copy_from_slice(&(members.len() as u16).to_le_bytes());
    for (i, member) in members.iter().enumerate() {
        let start = COUNT_PREFIX + i * G2_POINT;
        account.data[start..start + G2_POINT].copy_from_slice(&from_hex(member));
    }
    account
}

fn add_instruction(program_id: Pubkey, account: Pubkey, pubkeys: &[&str]) -> Instruction {
    let mut data = vec![IX_MULTISIG_ADD_SIGNERS];
    for pubkey in pubkeys {
        data.extend_from_slice(&from_hex(pubkey));
    }
    Instruction::new_with_bytes(program_id, &data, vec![AccountMeta::new(account, false)])
}

fn verify_instruction(program_id: Pubkey, account: Pubkey, agg_sig: &str) -> Instruction {
    let mut data = vec![IX_MULTISIG_VERIFY];
    data.extend_from_slice(&from_hex(agg_sig));
    data.extend_from_slice(&from_hex(NEGATED_MESSAGE_HASH));
    Instruction::new_with_bytes(program_id, &data, vec![AccountMeta::new(account, false)])
}

/// Adding three signers writes the count and appends each pubkey to the account.
#[test]
fn add_signers_appends_to_account() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = multisig_account(&program_id, 3, &[]);

    let instruction = add_instruction(program_id, account_key, &[PUBKEY_1, PUBKEY_2, PUBKEY_3]);

    let mut expected = (3u16).to_le_bytes().to_vec();
    expected.extend_from_slice(&from_hex(PUBKEY_1));
    expected.extend_from_slice(&from_hex(PUBKEY_2));
    expected.extend_from_slice(&from_hex(PUBKEY_3));

    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key).data(&expected).build(),
        ],
    );
}

/// Adding more pubkeys than the account can hold is rejected.
#[test]
fn add_signers_beyond_capacity_is_rejected() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = multisig_account(&program_id, 2, &[]); // capacity 2

    let instruction = add_instruction(program_id, account_key, &[PUBKEY_1, PUBKEY_2, PUBKEY_3]);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[Check::err(ProgramError::Custom(6))], // MultisigFull
    );
}

/// An aggregate signature from every registered member passes the pairing check.
#[test]
fn verify_all_signers_succeeds() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = multisig_account(&program_id, 3, &[PUBKEY_1, PUBKEY_2, PUBKEY_3]);

    let instruction = verify_instruction(program_id, account_key, AGG_SIG_ALL);
    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[Check::success()],
    );
    println!(
        "multisig verify (3 signers) compute units: {}",
        result.compute_units_consumed
    );
}

/// An aggregate signature missing one registered member is rejected on-chain.
#[test]
fn verify_with_missing_signer_is_rejected() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = multisig_account(&program_id, 3, &[PUBKEY_1, PUBKEY_2, PUBKEY_3]);

    let instruction = verify_instruction(program_id, account_key, AGG_SIG_FIRST_TWO);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[Check::err(ProgramError::Custom(4))], // AggregateVerifyFailed
    );
}

/// An account not owned by the program is rejected.
#[test]
fn verify_rejects_foreign_account() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let mut account = multisig_account(&program_id, 3, &[PUBKEY_1, PUBKEY_2, PUBKEY_3]);
    account.owner = Pubkey::new_unique(); // not the program

    let instruction = verify_instruction(program_id, account_key, AGG_SIG_ALL);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[Check::err(ProgramError::Custom(5))], // InvalidMultisigAccount
    );
}
