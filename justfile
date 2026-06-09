# Install dependencies
install:
    pnpm install

# Pin the Solana/Agave toolchain this repo requires.
# The alt_bn128 G2 (SIMD-0302) and BLS12-381 (SIMD-0388) syscalls only exist in
# agave 4.0; older cargo-build-sbf also can't parse the 4.0 dependency tree.
toolchain:
    agave-install init $(cat .solana-version)

# Generate IDL from Rust code using Codama
generate-idl:
    @echo "Generating IDL..."
    pnpm run generate-idl

# Generate clients from IDL using Codama
generate-clients: generate-idl
    @echo "Generating clients..."
    pnpm run generate-clients

# Build the program
build: generate-idl generate-clients
    cd program && cargo-build-sbf

# Boot a local validator, auto-fund the local wallet, and deploy the program
localnet:
    ./scripts/localnet.sh

# Run the demo web app (dev server)
web-dev: generate-clients
    pnpm --filter @solana/crypto-primitives-client build
    pnpm --filter @solana/crypto-primitives-web dev

# Build the demo web app
web-build: generate-clients
    pnpm --filter @solana/crypto-primitives-client build
    pnpm --filter @solana/crypto-primitives-web build

# Format / lint code
fmt:
    cargo fmt -p crypto-primitives
    @cd program && cargo clippy --all-targets -- -D warnings
    pnpm format
    pnpm lint:fix

check:
    cd program && cargo check --features idl
    pnpm run format:check
    pnpm lint
