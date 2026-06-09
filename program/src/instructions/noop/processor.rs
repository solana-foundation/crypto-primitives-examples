use pinocchio::{account::AccountView, Address, ProgramResult};
use pinocchio_log::log;

use crate::instructions::NoopData;

/// Processes the Noop instruction.
///
/// Logs the length of the instruction input and returns successfully.
pub fn process_noop(
    _program_id: &Address,
    _accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let data = NoopData::try_from(instruction_data)?;
    log!("noop input length: {}", data.input.len());
    Ok(())
}
