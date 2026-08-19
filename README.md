# Crypto Primitives Examples

Runnable, interactive demos for the activated BN254, BLS12-381, and ZK ElGamal features, plus a status page for the pending SHA-512 syscall proposal — what each one does, how they differ, and what they make newly possible on Solana.

> [!WARNING]
> This is **educational example code**, not a production library. The program has **not been audited**, the demos cut corners for clarity (in-browser throwaway keys, simplified flows), and nothing here is meant to be deployed as-is or relied on for real value. Use it to learn the primitives, then build your own.

## Overview

This repo covers four Solana cryptography surfaces: three activated features exercised through demos, and one pending SHA-512 syscall proposal tracked in the feature-gate registry.

| Primitive                | SIMD                                                                                                                        | Kind                                  | Security       | Operations                   | Status                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------- | ---------------------------- | ------------------------------ |
| alt_bn128 G2             | [0302](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0302-bn254-g2-syscalls.md)     | syscall (`sol_alt_bn128_group_op`)    | ~100-bit       | G2 add, scalar-mul           | mainnet epoch 985              |
| BLS12-381                | [0388](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0388-bls12-381-syscalls.md)    | syscall (`sol_curve_group_op`)        | 128-bit        | G1/G2 add, sub, scalar-mul   | mainnet epoch 986              |
| ZK ElGamal Proof Program | [0153](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0153-elgamal-proof-program.md) | native program (`ZkE1Gama1Proof111…`) | proof-specific | verify zero-knowledge proofs | mainnet epoch 731              |
| SHA-512                  | [0512](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0512-sha512-syscall.md)        | proposed syscall (`sol_sha512`)       | hash-specific  | SHA-512 hash, 64-byte output | pending; no cluster activation |

The two curve families add point arithmetic over [`alt_bn128`](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0302-bn254-g2-syscalls.md) (BN254) and [BLS12-381](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0388-bls12-381-syscalls.md) — the building blocks this repo uses for BLS-style signature aggregation demos. The ZK ElGamal Proof program is a native verifier for zero-knowledge proofs over encrypted values; it underpins Token-2022 confidential transfers. SIMD-0512 proposes `sol_sha512` with the same interface as Solana's existing hash syscalls, but it is not activated on any cluster yet.

This repository contains:

- A Rust Solana program built with [Pinocchio](https://github.com/anza-xyz/pinocchio) that wraps the active curve syscalls used by the demos
- IDL generation via [Codama](https://github.com/codama-idl/codama)
- Generated clients via Codama:
    - TypeScript client (`@solana/crypto-primitives-client`) in `clients/typescript`
    - Rust client (`crypto-primitives`) in `clients/rust`
- An interactive demo web app in `apps/web/`
- CI pipeline with build, test, lint, format, and IDL freshness checks

## Demos

The web app leads each primitive with a use case, not an opcode.

### alt_bn128 G2 → on-chain BLS multisig (`/altbn128`)

Register a set of members on-chain, then prove they all approved a message with a single aggregate signature. The program folds every stored public key with G2 addition and runs one pairing check — it passes only if **every** member signed. Toggle members off and the aggregate no longer matches the registered set; the verify lands on-chain and is rejected. The demo shows the aggregate key the program folds from the stored keys next to the key your selected signers represent, so a mismatch is visible. **Fully verified on-chain.**

### BLS12-381 → aggregate-key registry (`/bls12381`)

The program keeps one aggregate BLS public key on-chain. Adding a member folds their key in with G2 addition; removing takes it back out with G2 subtraction — the operation this repo does not expose for `alt_bn128`. Pick who signs and verify the aggregate signature against the on-chain key, which only matches when the signers are exactly the current members. **Verification runs off-chain in this demo** — the checked-in program wraps BLS12-381 group add/sub/mul, so its on-chain role is maintaining the aggregate key.

### ZK ElGamal → encrypted-value proofs (`/elgamal`)

Two tabs, both generating proofs client-side (WebAssembly, `@solana/zk-sdk`) and submitting them to the native verifier:

- **Compare a hidden number** — encrypt a value, then prove on-chain how it compares (`==`, `>`, `<`) to a public number without revealing it. `==` is one zero-ciphertext proof; `>` / `<` add a Bulletproof range proof plus an equality proof.
- **Private ballot** — voters encrypt 0/1 ballots; one batched range proof per five voters shows each ballot is valid, and the encrypted ballots are summed homomorphically so only the total is ever decrypted. A stuffed ballot is caught on-chain.

### SHA-512 → pending hash syscall (`/sha512`)

SIMD-0512 proposes `sol_sha512`, a native SHA-512 syscall with the same slice-based interface as `sol_sha256`, `sol_keccak256`, and `sol_blake3`. The feature is listed in the registry with no testnet, devnet, or mainnet activation epoch, so the web app has a status page rather than a live transaction demo.

## Program

```
EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw
```

The program is a thin wrapper over the active syscalls plus a few stateful accounts, with 14 instructions. It does not wrap the pending SHA-512 syscall.

| Discriminator | Instruction                             | Notes                                                 |
| ------------- | --------------------------------------- | ----------------------------------------------------- |
| 0             | `Noop`                                  | Pipeline / warm-up                                    |
| 1, 2          | `AltBn128G2Add` / `AltBn128G2Mul`       | `sol_alt_bn128_group_op` (BN254 G2)                   |
| 3–5           | `Bls12381G1Add` / `Sub` / `Mul`         | `sol_curve_group_op`, curve G1                        |
| 6–8           | `Bls12381G2Add` / `Sub` / `Mul`         | `sol_curve_group_op`, curve G2                        |
| 9             | `Bls254AggregateVerify`                 | Folds G2 pubkeys, runs one pairing check              |
| 10, 11        | `MultisigAddSigners` / `MultisigVerify` | Stateful account; all members must sign               |
| 12, 13        | `BlsRegistryAdd` / `BlsRegistryRemove`  | Stateful account; G2 add / sub on a running aggregate |

Compute units, measured on an agave 4.0 runtime:

| Operation                        | CU                   |
| -------------------------------- | -------------------- |
| alt_bn128 G2 add / mul           | ~700 / ~15,800       |
| BLS12-381 G1 add / sub / mul     | ~300 / ~300 / ~4,800 |
| BLS12-381 G2 add / sub / mul     | ~375 / ~375 / ~8,400 |
| Multisig verify (20 signers)     | ~60,700              |
| ZK ElGamal zero-ciphertext proof | ~6,000               |
| ZK ElGamal equality proof        | ~6,400               |
| ZK ElGamal batched range proof   | ~111,000             |

## Repository Structure

```text
crypto-primitives/
├── program/                       # Rust Solana program (Pinocchio)
│   └── src/
│       ├── instructions/          # Instruction handlers (altbn128_g2, bls12_381, bls254_aggregate, multisig, bls_registry, noop)
│       ├── bn254.rs               # BN254 G2 generator + aggregate/pairing helpers
│       ├── syscall.rs             # Wrappers over the active curve syscalls
│       ├── entrypoint.rs          # Discriminator dispatch
│       └── errors.rs              # Error codes
├── tests/                         # Mollusk integration tests (agave 4.0)
├── idl/                           # Generated IDL (crypto_primitives.json)
├── clients/
│   ├── typescript/                # TypeScript client (@solana/crypto-primitives-client)
│   └── rust/                      # Rust generated client
├── apps/web/                      # Demo UI (React 19 + Vite + Tailwind)
│   ├── src/lib/                   # Curve/proof helpers (bn254-bls, bls12381, elgamal)
│   └── scripts/                   # On-chain verification scripts
├── scripts/                       # localnet.sh, client generation
├── .github/                       # CI workflows + shared setup action
└── justfile                       # Build/test/dev task runner
```

## Quick Start

```bash
git clone git@github.com:solana-foundation/crypto-primitives-examples.git
cd crypto-primitives
just install
just toolchain    # one-time: pin agave 4.0
just build        # IDL + clients + SBF program
```

Run the demos against a local validator:

```bash
just localnet     # fresh validator + deploy + fund the local wallet (holds port 8899)
just web-dev      # vite dev server → http://localhost:5173
```

Open http://localhost:5173. In dev the cluster defaults to Localnet and the alt_bn128 and BLS12-381 demos use a pre-funded local wallet — no browser wallet needed. The ZK ElGamal demo requires a connected wallet to pay the proof-verification fee.

## Prerequisites

The BN254 G2 and BLS12-381 syscalls used by this program require Agave 4.0, and the older `cargo-build-sbf` cannot parse the 4.0 dependency tree, so the toolchain version matters. SHA-512 is tracked in the feature-gate registry, is not activated on any cluster, and is not exercised by this repo.

| Tool      | Version | Notes                                                     |
| --------- | ------- | --------------------------------------------------------- |
| Rust      | 1.92    | Pinned in `rust-toolchain.toml`                           |
| Agave CLI | 4.2.1   | Pinned in `.solana-version`; `just toolchain` installs it |
| Node.js   | 24.13.0 | Pinned in `.nvmrc`                                        |
| pnpm      | latest  | Package manager                                           |
| Just      | latest  | Task runner                                               |

Install the toolchain:

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Agave 4.0 (pinned)
just toolchain

# pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Just
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin
```

## Build and Test

The `justfile` is the main entrypoint for day-to-day development.

| Recipe                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `just build`            | Generate IDL + clients, then build the SBF program           |
| `just build-sbf`        | Compile the SBF program only (`.so`)                         |
| `just generate-idl`     | Regenerate `idl/crypto_primitives.json`                      |
| `just generate-clients` | Regenerate TypeScript and Rust clients from IDL via Codama   |
| `just unit-test`        | Run Rust unit tests                                          |
| `just integration-test` | Run Mollusk integration tests (builds the SBF program first) |
| `just web-build`        | Build the demo web app                                       |
| `just web-dev`          | Run the demo web app dev server                              |

### Code Quality

| Recipe                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `just check`           | `cargo check` + format check + lint               |
| `just fmt`             | Auto-format Rust and TypeScript                   |
| `just fmt-check`       | Check Rust and TypeScript formatting (no writes)  |
| `just lint-check`      | Check Rust (clippy) and TypeScript (ESLint)       |
| `just check-generated` | Verify committed IDL and clients match the source |

## Testing

The integration tests use [Mollusk](https://github.com/anza-xyz/mollusk), which runs on agave 4.0 and therefore has the active curve syscalls. `surfpool` and `litesvm` are pinned to agave 3.1 and lack these syscalls, so they cannot be used here.

```bash
just unit-test          # Rust unit tests
just integration-test   # Mollusk integration tests
```

Integration tests cover the curve syscalls (`altbn128_g2`, `bls12_381`) and the stateful instructions (`bls254_aggregate`, `multisig`, `bls_registry`). The BLS/BN254 test vectors are generated deterministically by `apps/web/scripts/gen-test-vectors.ts` (fixed secrets), so they're reproducible and documented at their source.

## Web App

A Vite + React 19 single-page app under `apps/web/`.

**Tech stack**: React 19, Vite, Tailwind CSS 4, `@solana/kit`, `@solana/connector`, `@solana/design-system`. Client-side cryptography uses `mcl-wasm` (BN254), `@noble/curves` (BLS12-381), and `@solana/zk-sdk` (ElGamal proofs).

| Route       | Demo                                              |
| ----------- | ------------------------------------------------- |
| `/`         | Overview of the four covered primitives/proposals |
| `/altbn128` | alt_bn128 G2 → on-chain BLS multisig              |
| `/bls12381` | BLS12-381 → aggregate-key registry                |
| `/elgamal`  | ZK ElGamal → encrypted-value proofs (2 tabs)      |
| `/sha512`   | SHA-512 → pending syscall proposal                |

A network selector supports Localnet (dev), Devnet, Testnet, and Mainnet, plus a custom RPC override (the endpoint's genesis hash auto-detects the cluster).

## CI Pipeline

GitHub Actions runs split workflows on PRs and pushes to `main`:

| Workflow      | Description                                          |
| ------------- | ---------------------------------------------------- |
| **Build**     | Build the program, clients, and web app              |
| **Test**      | Run Rust unit and Mollusk integration tests          |
| **Format**    | Check Rust and TypeScript formatting                 |
| **Lint**      | Check Rust clippy and TypeScript ESLint              |
| **IDL Check** | Verify committed IDL and generated clients are fresh |

## Notes & Gotchas

- **This repo treats alt_bn128 G2 as add/mul only.** The pinned Agave 4.2.1 runtime path used here dispatches the G2 add (op 4) and mul (op 6) opcodes. SIMD-0302 also describes subtraction, but this checked-in program does not expose an alt_bn128 G2 subtraction instruction. BLS12-381 does have subtraction in this repo, which is why the registry demo can remove a supplied member key.
- **The BLS12-381 registry demo verifies signatures off-chain.** SIMD-0388 covers group operations, validation, pairing, and decompression, but this program currently wraps only group add/sub/mul. Its on-chain role is maintaining the aggregate G2 key.
- **Byte formats differ.** alt_bn128 G2 is 128 bytes in EIP-197 big-endian order; BLS12-381 is uncompressed Zcash/blstrs big-endian (G1 96 bytes, G2 192 bytes). See `apps/web/src/lib/` for the converters.
- **Transaction size cap (1232 bytes)** limits inline 128-byte pubkeys to ~7 per transaction; the multisig stores all keys in chunked transactions, while the registry stores only the running aggregate (one point) so it scales freely.
- The demo wallet and any keys generated in the browser are throwaway material for local development only — never real keys.

## License

[MIT](LICENSE)
