# Solana New Cryptographic Primitives — Showcase Plan

> Source: Linear **TOO-383** — "Research + example of different cryptography algorithm added to Agave"
> Status: **Phases 1-2 done** — both curve syscall families implemented in the Pinocchio
> program and verified on agave 4.0 via Mollusk (18 tests green). Phases 3-5 (web, ElGamal,
> polish) remain.

## 0. Naming (resolved)

Repo renamed to **`crypto-primitives`**. These are **not** hash functions:

- **alt_bn128 G2** — elliptic-curve group arithmetic on a pairing curve
- **BLS12-381** — elliptic-curve group arithmetic on a pairing curve (+ enables BLS signatures)
- **ElGamal** — homomorphic public-key encryption + zero-knowledge proofs

Framing: **"New cryptographic primitives landing in Agave."**

## 1. Goal & success criteria

Showcase, to ecosystem + devs, three new crypto capabilities in the Solana validator:
what each does, how they differ, what's newly possible, what they're good/bad for —
with **live, interactive devnet demos**.

Done when:

- A deployed web app lets a user feed inputs to each primitive and see real on-chain
  output + compute-unit (CU) cost + an explorer link, on devnet.
- Each primitive has layered content: narrative ("why care") on top, drill-down
  ("syscall signature, encoding, code, CU") for devs.
- Content is technically correct and verified against live devnet behavior (not docs).

## 2. The three primitives (verified state)

All three verified **live on devnet** on 2026-06-08 via direct RPC (not docs — docs are stale):

| Primitive                | SIMD              | Kind                                       | Devnet | Testnet | Mainnet    |
| ------------------------ | ----------------- | ------------------------------------------ | ------ | ------- | ---------- |
| alt_bn128 G2             | 0302              | syscall (extends `sol_alt_bn128_group_op`) | ✅     | ✅      | ⏳ pending |
| BLS12-381                | 0388              | new syscall family                         | ✅     | ✅      | ⏳ pending |
| ZK ElGamal Proof Program | 0153 (re-enabled) | native program `ZkE1Gama1Proof111…`        | ✅     | ✅      | ✅         |

Re-enable feature gate `zkexuyPRdyTVbZqEAREueqL2xvvoBhRgth9xGSc1tMN` activated on devnet
(slot 455760000), testnet, and mainnet. ZK ElGamal Proof Program builtin is executable on devnet.

### 2a. alt_bn128 G2 (SIMD-0302)

- **What:** extends existing BN254 syscall to native **G2** point arithmetic — **add and scalar-mul only**. Previously only G1 ops + pairing + G2 compression existed; G2 arithmetic was missing (not in the Ethereum precompile it was modeled on).
- **No subtraction:** the SIMD draft mentions sub, but shipped agave 4.0 `sol_alt_bn128_group_op` implements **only** add/mul/pairing — sub op-codes (G1=1, G2=5) return `InvalidAttribute` (verified in `agave-syscalls-4.0.0`). Contrast: BLS12-381 _does_ expose native sub. Good showcase talking point.
- **Differs:** incremental completion of BN254. Add skips the subgroup check (curve-equation check only) for cheap accumulation; scalar-mul does full validation (field + curve + subgroup) to safely allow endomorphism-based mul.
- **Encoding:** big-endian, plus little-endian variants per SIMD-0284 (`OP | 0x80`) — LE matches `ark-bn254`, friendlier to Ethereum/ZK tooling.
- **Good for:** Groth16 verifiers, Groth16 proof **compression** (256→128 bytes/proof), ZK apps on the existing curve, removing client-side G2 workarounds.
- **Bad for:** BN254 is ~100-bit security, not 128-bit. Not for high-security protocols.
- **VERIFIED (Phase 2):** `sol_alt_bn128_group_op(group_op, input, input_size, result)`, single concatenated input buffer. G2 ADD=4, MUL=6 (LE = `|0x80`). G2 point = 128 B uncompressed. add: 256→128 B. mul: 160 B (128 point + 32 B BE scalar) → 128 B. Measured CU (Mollusk/agave 4.0): **add 702, mul 15839**.

### 2b. BLS12-381 (SIMD-0388) — the headline

- **What:** new syscall family. Group ops (add, sub/negate, scalar-mul) in **both G1 and G2**. 128-bit security pairing-friendly curve; same curve Ethereum uses.
- **Differs:** higher security than BN254; cross-ecosystem standard; foundation for **Alpenglow consensus** (SIMD-0326) and **BLS signature aggregation**.
- **Encoding:** Zcash canonical big-endian. G1 = 48B compressed / 96B uncompressed; G2 = 96B / 192B.
- **Good for:** BLS signatures + aggregation, Proof-of-Possession, high-security Groth16, Ethereum interop, consensus primitives.
- **Bad for:** heavier compute than BN254. **Scope limit:** this SIMD ships group ops only — **no pairing, no hash-to-curve** yet (out of scope). Demos must not imply full BLS verify is one syscall.
- **VERIFIED (Phase 2):** uses the shared `sol_curve_group_op(curve_id, group_op, left, right, result)` syscall (NOT a bespoke family) — separate left/right pointers. curve_id BE: G1 = `5|0x80` = 133, G2 = `6|0x80` = 134. group_op ADD=0, SUB=1, MUL=2 (**sub supported**). G1 point 96 B, G2 point 192 B, scalar 32 B. add/sub: left+right both points; mul: left = scalar, right = point. BE encoding = blstrs uncompressed. Reachable via `pinocchio::syscalls` (no extra dep). Measured CU: **G1 add 302 / sub 301 / mul 4799; G2 add 375 / sub 376 / mul 8429**.

### 2c. ZK ElGamal Proof Program (SIMD-0153, re-enabled)

- **What:** native program that **verifies zero-knowledge proofs** over ElGamal ciphertexts and Pedersen commitments. Underpins Token-2022 confidential transfers (twisted ElGamal — encrypt balances, still do homomorphic addition).
- **Context:** disabled June 2025 (Fiat-Shamir "phantom challenge" soundness bug — a challenge value omitted from the transcript allowed forged sigma-OR proofs). Audited, hardened, **re-enabled** (confirmed live on devnet).
- **Differs from the other two:** NOT a syscall and NOT our program — proofs are **generated client-side** (`solana-zk-sdk`), then submitted to the native program for verification. Instruction set includes e.g. VerifyPubkeyValidity, VerifyZeroCiphertext, VerifyCiphertextCommitmentEquality, VerifyCiphertextCiphertextEquality, VerifyBatchedRangeProofU64/U128/U256, VerifyGroupedCiphertext2/3Handles, VerifyPercentageWithCap.
- **Good for:** confidential token balances/transfers, encrypted amounts you can audit/compute on.
- **Bad for:** complex; proof generation cost; narrower use case than general curve ops.
- **TBD-verify in Phase 1:** exact instruction list + proof-context account model in the re-enabled version; WASM build path for browser proof generation (or generate server-side).

## 3. Architecture

Monorepo:

```
/program     [DONE] Pinocchio program — instructions wrapping the SYSCALLS only:
               - altbn128_g2_add / _mul              (sol_alt_bn128_group_op; no sub)
               - bls12381_g1_add / _sub / _mul        (sol_curve_group_op)
               - bls12381_g2_add / _sub / _mul        (sol_curve_group_op)
             Each ix: take input bytes, call syscall, return result via set_return_data.
             CU measured by Mollusk in tests/.
/apps/web    [TODO] Vite + React 19 + React Router v7 + Tailwind v4. @solana/design-system
             + @solana/connector (wallet-standard) + @solana/kit. Mirrors the
             ~/git-solana/subscriptions and ~/git-solana/rewards design system.
             Devnet. Per primitive: input form -> build tx (generated Codama TS client)
             -> send -> show output + CU + explorer link. Layered content.
/elgamal     [TODO] Client-side proof generation (solana-zk-sdk via WASM, or a small
             helper service) -> submit to native ZkE1Gama1Proof111... -> show verify result.
             No custom program needed.
```

**Why Pinocchio:** minimal runtime overhead → cleanest CU attribution to the syscall itself
(the showcase's whole point is "what does this op cost"). Anchor's boilerplate would muddy CU.
Consult `sf-solana-programs-skill` + `pinocchio-scaffold` at build time.

**Why only 2 of 3 need a program:** syscalls are callable only from within a BPF program →
need the Pinocchio wrapper. ElGamal verification is a native program already on-chain →
call it directly from the client.

## 4. Layered audience model

Each primitive page:

- **Top (everyone):** one-line "what's now possible", a use-case or two, the good/bad-for, a diagram.
- **Drill-down (devs):** syscall signature / instruction, byte encoding, copy-paste call snippet,
  measured CU, explorer link to a live example tx.
- **Live demo:** the interactive panel.

A landing page compares all three side by side (kind, security level, encoding, use cases, status).

## 5. Phasing / milestones

1. ✅ **Scaffold + pipeline proof** — monorepo skeleton; Pinocchio program; Codama IDL +
   TS/Rust clients; end-to-end loop proven (noop → G2 add) under Mollusk.
2. ✅ **Curve syscalls** — alt_bn128 G2 (add/mul) + BLS12-381 (G1/G2 add/sub/mul) implemented;
   op-codes, encodings, and CU **verified on agave 4.0 via Mollusk** (fast local loop instead
   of devnet — surfpool/litesvm are stuck on agave 3.1 and lack these syscalls).
3. ⏳ **Web demos (curve)** — interactive panels + layered content for the two curve primitives.
4. ⏳ **ElGamal** — client proof-gen + on-chain verify demo + content.
5. ⏳ **Polish + deploy** — comparison landing, diagrams, copy review, deploy program to devnet, host the site.

Each milestone is independently shippable; 3 and 4 can be reordered. **Note:** program is
verified under Mollusk but **not yet deployed to devnet** — needed for the live web demos (Phase 3/5).

## 6. Risks / open questions

- **Naming/framing** (§0) — ✅ resolved (repo renamed crypto-primitives).
- **Mainnet pending** for the two curve syscalls — demos are devnet; copy must say so honestly.
- **BLS scope** — group ops only, no pairing/hash-to-curve yet; don't oversell BLS sig verify.
- **alt_bn128 sub** — ✅ resolved: NOT supported in agave 4.0 (only add/mul). Copy must not show a sub demo for alt_bn128.
- **ElGamal WASM** — browser proof generation may be heavy; fallback = small proof-gen service.
- **Toolchain** — repo requires agave 4.0 (`.solana-version`, `just toolchain`); older cargo-build-sbf can't build it.
- **CU numbers** — ✅ measured under Mollusk (agave 4.0); see §2a/§2b. Re-confirm on devnet before publishing.

## 7. Hosting / distribution (decide later)

- Where to host the site (Vercel / Cloudflare / SF infra)?
- Open-source the repo as a reference example for devs?
- Companion writeup (blog) linking to the live demos?
