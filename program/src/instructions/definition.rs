use codama::CodamaInstructions;

/// Instructions for the Crypto Primitives Program.
#[repr(C, u8)]
#[derive(Clone, Debug, PartialEq, CodamaInstructions)]
#[allow(clippy::large_enum_variant)]
pub enum CryptoPrimitivesInstruction {
    /// No-op instruction proving the build/IDL/client pipeline.
    Noop {} = 0,

    /// Adds two big-endian alt_bn128 G2 points (128 bytes each) via the
    /// `sol_alt_bn128_group_op` syscall, returning the 128-byte sum as return data.
    AltBn128G2Add { input: [u8; 256] } = 1,

    /// Multiplies a big-endian alt_bn128 G2 point (128 bytes) by a big-endian
    /// 32-byte scalar via the `sol_alt_bn128_group_op` syscall, returning the
    /// 128-byte product as return data.
    AltBn128G2Mul { input: [u8; 160] } = 2,

    /// Adds two big-endian BLS12-381 G1 points (96 bytes each) via the
    /// `sol_curve_group_op` syscall, returning the 96-byte sum as return data.
    Bls12381G1Add { input: [u8; 192] } = 3,

    /// Subtracts two big-endian BLS12-381 G1 points (96 bytes each) via the
    /// `sol_curve_group_op` syscall, returning the 96-byte difference as return data.
    Bls12381G1Sub { input: [u8; 192] } = 4,

    /// Multiplies a big-endian BLS12-381 G1 point (96 bytes) by a big-endian
    /// 32-byte scalar (scalar first) via the `sol_curve_group_op` syscall,
    /// returning the 96-byte product as return data.
    Bls12381G1Mul { input: [u8; 128] } = 5,

    /// Adds two big-endian BLS12-381 G2 points (192 bytes each) via the
    /// `sol_curve_group_op` syscall, returning the 192-byte sum as return data.
    Bls12381G2Add { input: [u8; 384] } = 6,

    /// Subtracts two big-endian BLS12-381 G2 points (192 bytes each) via the
    /// `sol_curve_group_op` syscall, returning the 192-byte difference as return data.
    Bls12381G2Sub { input: [u8; 384] } = 7,

    /// Multiplies a big-endian BLS12-381 G2 point (192 bytes) by a big-endian
    /// 32-byte scalar (scalar first) via the `sol_curve_group_op` syscall,
    /// returning the 192-byte product as return data.
    Bls12381G2Mul { input: [u8; 224] } = 8,

    /// Verifies an aggregate BLS signature over a provided set of G2 public keys:
    /// `signature` (G1, 64 bytes) ‖ `negated_message_hash` (G1, 64 bytes) ‖ one
    /// or more big-endian G2 public keys (128 bytes each). Returns the aggregate
    /// public key as return data.
    Bls254AggregateVerify {
        signature: [u8; 64],
        negated_message_hash: [u8; 64],
        #[codama(type = bytes)]
        pubkeys: [u8; 0],
    } = 9,

    /// Appends one or more big-endian G2 public keys (128 bytes each) to the
    /// multisig account's stored signer set.
    MultisigAddSigners {
        #[codama(account(name = "multisig", writable))]
        multisig: pinocchio::Address,
        #[codama(type = bytes)]
        keys: [u8; 0],
    } = 10,

    /// Verifies an aggregate BLS signature against the multisig account's stored
    /// G2 keys: `aggregate_signature` (G1, 64 bytes) ‖ `negated_message_hash`
    /// (G1, 64 bytes). Returns the on-chain aggregate public key as return data.
    MultisigVerify {
        #[codama(account(name = "multisig"))]
        multisig: pinocchio::Address,
        input: [u8; 128],
    } = 11,

    /// Adds a BLS12-381 G2 public key (192 bytes) to the registry account's
    /// running aggregate via the `sol_curve_group_op` G2 addition syscall.
    BlsRegistryAdd {
        #[codama(account(name = "registry", writable))]
        registry: pinocchio::Address,
        key: [u8; 192],
    } = 12,

    /// Removes a BLS12-381 G2 public key (192 bytes) from the registry account's
    /// running aggregate via the `sol_curve_group_op` G2 subtraction syscall.
    BlsRegistryRemove {
        #[codama(account(name = "registry", writable))]
        registry: pinocchio::Address,
        key: [u8; 192],
    } = 13,
}
