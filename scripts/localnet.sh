#!/usr/bin/env bash
# Boot a local agave-4.0 validator, auto-fund the local wallet, and deploy the program.
set -euo pipefail

cd "$(dirname "$0")/.."

WALLET_KEYPAIR="keypairs/local-wallet.json"
PROGRAM_KEYPAIR="keypairs/crypto-primitives-keypair.json"
PROGRAM_SO="target/deploy/crypto_primitives.so"
LEDGER="/tmp/cp-test-ledger"
RPC="http://127.0.0.1:8899"
AIRDROP_SOL=1000

if [ ! -f "$WALLET_KEYPAIR" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "$WALLET_KEYPAIR"
fi
WALLET=$(solana-keygen pubkey "$WALLET_KEYPAIR")

if [ ! -f "$PROGRAM_SO" ]; then
    echo "Program not built — run 'just build' first." >&2
    exit 1
fi

echo "Starting validator (reset)..."
solana-test-validator --reset --ledger "$LEDGER" >/tmp/cp-validator.log 2>&1 &
VALIDATOR_PID=$!
trap 'kill $VALIDATOR_PID 2>/dev/null || true' EXIT

until curl -s "$RPC" -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"ok"'; do
    sleep 1
done

solana airdrop "$AIRDROP_SOL" "$WALLET" --url "$RPC" >/dev/null
solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEYPAIR" \
    --keypair "$WALLET_KEYPAIR" --url "$RPC" >/dev/null

echo ""
echo "  Local validator ready at $RPC"
echo "  Local wallet     : $WALLET  (${AIRDROP_SOL} SOL)"
echo "  Keypair          : $WALLET_KEYPAIR"
echo "  Program deployed  : $(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
echo ""
echo "  Import the wallet into your browser extension, then run 'just web-dev'."
echo "  Ctrl-C to stop the validator."
echo ""

wait $VALIDATOR_PID
