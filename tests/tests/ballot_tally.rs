//! Integration tests for the stateful encrypted-ballot tally instruction (14).
//! The program keeps a running twisted ElGamal tally ciphertext in an account
//! and folds each ballot in with two ristretto255 additions. Vectors are
//! deterministic ristretto basepoint multiples summed with `@noble/curves`:
//! BALLOT_A = [2G || 3G], BALLOT_B = [5G || 7G], SUM = [7G || 10G].

use {
    mollusk_svm::{result::Check, Mollusk},
    solana_account::Account,
    solana_instruction::{AccountMeta, Instruction},
    solana_program_error::ProgramError,
    solana_pubkey::Pubkey,
    std::str::FromStr,
};

const PROGRAM_ID: &str = "EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw";
const IX_BALLOT_TALLY_ADD: u8 = 14;

const CIPHERTEXT: usize = 64;
const COUNT_PREFIX: usize = 2;

const BALLOT_A: &str = "6a493210f7499cd17fecb510ae0cea23a110e8d5b901f8acadd3095c73a3b91994741f5d5d52755ece4f23f044ee27d5d1ea1e2bd196b462166b16152a9d0259";
const BALLOT_B: &str = "e882b131016b52c1d3337080187cf768423efccbb517bb495ab812c4160ff44e44f53520926ec81fbd5a387845beb7df85a96a24ece18738bdcfa6a7822a176d";
const SUM_AB: &str = "44f53520926ec81fbd5a387845beb7df85a96a24ece18738bdcfa6a7822a176d20706fd788b2720a1ed2a5dad4952b01f413bcf0e7564de8cdc816689e2db95f";

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

/// A program-owned tally account holding `count` ballots and the given tally
/// ciphertext (empty tally = all-zero).
fn tally_account(program_id: &Pubkey, count: u16, tally: Option<&str>) -> Account {
    let mut account = Account::new(1_000_000_000, COUNT_PREFIX + CIPHERTEXT, program_id);
    account.data[..COUNT_PREFIX].copy_from_slice(&count.to_le_bytes());
    if let Some(tally) = tally {
        account.data[COUNT_PREFIX..].copy_from_slice(&from_hex(tally));
    }
    account
}

fn add_instruction(program_id: Pubkey, account: Pubkey, ballot: &str) -> Instruction {
    let mut data = vec![IX_BALLOT_TALLY_ADD];
    data.extend_from_slice(&from_hex(ballot));
    Instruction::new_with_bytes(program_id, &data, vec![AccountMeta::new(account, false)])
}

/// The first ballot becomes the tally verbatim, count goes to 1.
#[test]
fn add_first_ballot_stores_ciphertext() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = tally_account(&program_id, 0, None);

    let instruction = add_instruction(program_id, account_key, BALLOT_A);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(1u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &from_hex(BALLOT_A))
                .build(),
        ],
    );
}

/// Adding a second ballot folds it into the tally via two ristretto255
/// additions (commitment + handle), so [2G||3G] + [5G||7G] = [7G||10G].
#[test]
fn add_second_ballot_sums() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = tally_account(&program_id, 1, Some(BALLOT_A));

    let instruction = add_instruction(program_id, account_key, BALLOT_B);
    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(2u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &from_hex(SUM_AB))
                .build(),
        ],
    );
    println!(
        "ballot tally ristretto add compute units: {}",
        result.compute_units_consumed
    );
}

/// Instruction data that isn't exactly one 64-byte ciphertext is rejected.
#[test]
fn add_rejects_wrong_length() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = tally_account(&program_id, 0, None);

    let data = vec![IX_BALLOT_TALLY_ADD, 0u8, 1u8, 2u8];
    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![AccountMeta::new(account_key, false)],
    );
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[Check::err(ProgramError::Custom(1))], // InvalidInputLength
    );
}
