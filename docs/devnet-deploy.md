# Devnet Deploy

Program upgrades to devnet run through the `Release` GitHub Actions workflow. The workflow builds the program with the pinned agave toolchain (`.solana-version`) and writes program and IDL buffers owned by the devnet Squads vault, using a deployer keypair loaded from Doppler. The upgrade itself is a Squads proposal. (Verified builds are not used: the `solana-verify` toolchain lags agave 4.0's rustc, and verified builds aren't meaningful for devnet anyway.)

The Squads vault is the program's **upgrade authority**. The deployer keypair is only the **fee payer** and buffer writer; it does not need Squads membership. It is never the program keypair (the program's identity); that is only needed for the one-time bootstrap below.

## Program ID

```
EgJAPMy5V2j442dTGFRqT5ZtPCWtg6BEbEo2QzkExYyw
```

## One-time bootstrap (first devnet deploy)

The `Release` workflow **upgrades an existing program** — it cannot create one. The first deploy must be done once, locally, to create the program account at the canonical address and hand upgrade authority to the devnet Squads vault.

```bash
just build

solana program deploy target/deploy/crypto_primitives.so \
  --program-id keypairs/crypto-primitives-keypair.json \
  --upgrade-authority <SQUADS_VAULT> \
  --keypair <funded-devnet-wallet.json> \
  --url devnet
```

- `keypairs/crypto-primitives-keypair.json` sets the on-chain address to `EgJAP…XYyw` (matches `declare_id!` and the clients). It is gitignored — **back it up**; losing it means the program can only ever be redeployed to a different address.
- `--upgrade-authority` must be the devnet Squads vault (`SQUADS_VAULT` in Doppler), so later upgrades go through Squads.
- The deploy wallet needs ~2–4 devnet SOL.

After bootstrap, every subsequent devnet release runs through CI.

## Running a release

Trigger the `Release` workflow from the Actions tab (`workflow_dispatch`), optionally setting the priority fee. It loads `RPC_URL`, `DEPLOYER_KEYPAIR`, `SQUADS_VAULT` and `SQUADS_MULTISIG` from Doppler, builds the program, writes the program and IDL buffers with the vault as their authority, and exports one Squads transaction (IDL metadata write and program upgrade). Import that transaction from the run summary into the Squads transaction builder, then approve and execute it.

## Doppler configuration

OIDC auth — no long-lived Doppler token in GitHub.

**Doppler** — project `crypto-primitives`, config `stg_github`:

| Secret             | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `RPC_URL`          | Devnet RPC endpoint (e.g. `https://api.devnet.solana.com` or a private devnet RPC)   |
| `DEPLOYER_KEYPAIR` | The deployer (fee payer) keypair as a JSON byte array (the `id.json` contents)        |
| `SQUADS_VAULT`     | The devnet Squads vault address, set as the buffers' authority                       |
| `SQUADS_MULTISIG`  | The devnet Squads multisig address the exported transaction targets                  |

**GitHub** — repository variable (Settings → Secrets and variables → Actions → Variables):

| Variable                      | Value                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| `DOPPLER_SERVICE_IDENTITY_ID` | Doppler service identity ID authorized for OIDC from this repo |

Set up the Doppler service identity with a GitHub OIDC trust scoped to `solana-foundation/crypto-primitives-examples`, then grant it read access to the `stg_github` config.
