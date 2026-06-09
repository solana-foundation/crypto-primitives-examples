//! Integration tests for the stateful BLS12-381 aggregate-key registry
//! instructions (12 add, 13 remove). The program maintains a running aggregate
//! G2 key via the curve add/sub syscalls. Test vectors are generated
//! deterministically by `apps/web/scripts/gen-test-vectors.ts`.

use {
    mollusk_svm::{result::Check, Mollusk},
    solana_account::Account,
    solana_instruction::{AccountMeta, Instruction},
    solana_program_error::ProgramError,
    solana_pubkey::Pubkey,
    std::str::FromStr,
};

const PROGRAM_ID: &str = "EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw";
const IX_REGISTRY_ADD: u8 = 12;
const IX_REGISTRY_REMOVE: u8 = 13;

const G2_POINT: usize = 192;
const COUNT_PREFIX: usize = 2;

const PUBKEY_1: &str = "13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801";
const PUBKEY_2: &str = "0a4edef9c1ed7f729f520e47730a124fd70662a904ba1074728114d1031e1572c6c886f6b57ec72a6178288c47c335771638533957d540a9d2370f17cc7ed5863bc0b995b8825e0ee1ea1e1e4d00dbae81f14b0bf3611b78c952aacab827a0530f6d4552fa65dd2638b361543f887136a43253d9c66c411697003f7a13c308f5422e1aa0a59c8967acdefd8b6e36ccf30468fb440d82b0630aeb8dca2b5256789a66da69bf91009cbfe6bd221e47aa8ae88dece9764bf3bd999d95d71e4c9899";
const AGG_1_2: &str = "09380275bbc8e5dcea7dc4dd7e0550ff2ac480905396eda55062650f8d251c96eb480673937cc6d9d6a44aaa56ca66dc122915c824a0857e2ee414a3dccb23ae691ae54329781315a0c75df1c04d6d7a50a030fc866f09d516020ef82324afae08f239ba329b3967fe48d718a36cfe5f62a7e42e0bf1c1ed714150a166bfbd6bcf6b3b58b975b9edea56d53f23a0e8490b21da7955969e61010c7a1abc1a6f0136961d1e3b20b1a7326ac738fef5c721479dfd948b52fdf2455e44813ecfd892";
const AGG_1_2_3: &str = "03f4b4e761936d90fd5f55f99087138a07a69755ad4a46e4dd1c2cfe6d11371e1cc033111a0595e3bba98d0f538db45119e384121b7d70927c49e6d044fd8517c36bc6ed2813a8956dd64f049869e8a77f7e46930240e6984abe26fa6a89658f088bb5832f4a4a452edda646ebaa2853a54205d56329960b44b2450070734724a74daaa401879bad142132316e9b340117a31a4fccfb5f768a2157517c77a4f8aaf0dee8f260d96e02e1175a8754d09600923beae02a019afc327b65a2fdbbfc";
const AGG_1_3: &str = "070227d3f13684fdb7ce31b8065ba3acb35f7bde6fe2ddfefa359f8b35d08a9ab9537b43e24f4ffb720b5a0bda2a82f20e7a30979a8853a077454eb63b8dcee75f106221b262886bb8e01b0abb043368da82f60899cc1412e33e4120195fc5570782c14e2c4ee61cbe7be6e462a66b2e3509f42d53ff333efc9bfe9a00307cd2f68b007606446d98a75fb808a405d8b90701377cb7da22789d032737eabcea2b2eee6bb4634c4365864511a43c2caad50422993ccd3e99636eb8a5f189454b18";

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

/// A program-owned registry account holding `count` members and the given
/// aggregate key (empty aggregate = all-zero).
fn registry_account(program_id: &Pubkey, count: u16, aggregate: Option<&str>) -> Account {
    let mut account = Account::new(1_000_000_000, COUNT_PREFIX + G2_POINT, program_id);
    account.data[..COUNT_PREFIX].copy_from_slice(&count.to_le_bytes());
    if let Some(aggregate) = aggregate {
        account.data[COUNT_PREFIX..].copy_from_slice(&from_hex(aggregate));
    }
    account
}

fn member_instruction(
    program_id: Pubkey,
    account: Pubkey,
    discriminator: u8,
    pubkey: &str,
) -> Instruction {
    let mut data = vec![discriminator];
    data.extend_from_slice(&from_hex(pubkey));
    Instruction::new_with_bytes(program_id, &data, vec![AccountMeta::new(account, false)])
}

/// The first member becomes the aggregate verbatim, count goes to 1.
#[test]
fn add_first_member_stores_key() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = registry_account(&program_id, 0, None);

    let instruction = member_instruction(program_id, account_key, IX_REGISTRY_ADD, PUBKEY_1);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(1u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &from_hex(PUBKEY_1))
                .build(),
        ],
    );
}

/// Adding a second member folds it into the aggregate via G2 addition.
#[test]
fn add_second_member_aggregates() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = registry_account(&program_id, 1, Some(PUBKEY_1));

    let instruction = member_instruction(program_id, account_key, IX_REGISTRY_ADD, PUBKEY_2);
    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(2u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &from_hex(AGG_1_2))
                .build(),
        ],
    );
    println!(
        "bls registry G2 add compute units: {}",
        result.compute_units_consumed
    );
}

/// Removing a member subtracts it from the aggregate via G2 subtraction, so
/// removing member 2 from {1,2,3} leaves the aggregate of {1,3}.
#[test]
fn remove_member_subtracts() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = registry_account(&program_id, 3, Some(AGG_1_2_3));

    let instruction = member_instruction(program_id, account_key, IX_REGISTRY_REMOVE, PUBKEY_2);
    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(2u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &from_hex(AGG_1_3))
                .build(),
        ],
    );
    println!(
        "bls registry G2 sub compute units: {}",
        result.compute_units_consumed
    );
}

/// Removing the last member zeroes the aggregate and resets the count.
#[test]
fn remove_last_member_clears_aggregate() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = registry_account(&program_id, 1, Some(PUBKEY_1));

    let instruction = member_instruction(program_id, account_key, IX_REGISTRY_REMOVE, PUBKEY_1);
    mollusk.process_and_validate_instruction(
        &instruction,
        &[(account_key, account)],
        &[
            Check::success(),
            Check::account(&account_key)
                .data_slice(0, &(0u16).to_le_bytes())
                .build(),
            Check::account(&account_key)
                .data_slice(COUNT_PREFIX, &[0u8; G2_POINT])
                .build(),
        ],
    );
}

/// Instruction data that isn't exactly one G2 point is rejected.
#[test]
fn add_rejects_wrong_length() {
    let (mollusk, program_id) = mollusk();
    let account_key = Pubkey::new_unique();
    let account = registry_account(&program_id, 0, None);

    let data = vec![IX_REGISTRY_ADD, 0u8, 1u8, 2u8];
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
