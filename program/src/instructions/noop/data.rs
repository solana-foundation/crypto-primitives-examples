use pinocchio::error::ProgramError;

/// Instruction data for Noop.
///
/// # Layout
/// Borrows the raw instruction data; any length is accepted.
pub struct NoopData<'a> {
    pub input: &'a [u8],
}

impl<'a> TryFrom<&'a [u8]> for NoopData<'a> {
    type Error = ProgramError;

    #[inline(always)]
    fn try_from(input: &'a [u8]) -> Result<Self, Self::Error> {
        Ok(Self { input })
    }
}
