//! # Crypto Primitives
//!
//! A stateless Solana program that will wrap cryptographic syscalls.
//!
//! ## Architecture
//! Built with Pinocchio (no_std). Clients auto-generated via Codama.

#![no_std]

use pinocchio::address::declare_id;

pub mod bn254;
pub mod errors;
pub mod instructions;
pub mod syscall;

#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

declare_id!("EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw");
