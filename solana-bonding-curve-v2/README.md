# FrostDex Solana Bonding Curve V2

## Status

This is an un-deployed contract work-in-progress. It has not been built or
reviewed with the Anchor toolchain in this environment. **Do not deploy it or
use it for mainnet trading yet.**

The `declare_id!` and localnet ID currently contain the historical program ID;
they are not paired with a V2 deployment keypair.

Raydium CPMM migration is not implemented. Reaching the bonding-curve target
currently stops further buys, but does not create a Raydium pool or move
liquidity. A production launch must not use this version until that migration
path and its recovery behavior are implemented, tested, and independently
reviewed.

## Fee rules

Fees are charged in SOL and sent to the fixed recipient
`EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ`:

- Creator's mandatory initial buy: 14.5% creation fee plus 4.5% trading fee.
- Every later buy: 4.5% trading fee.
- Every sell: 4.5% trading fee.
- The fee recipient cannot trade through the curve; there are no fee exemptions.

The initial-buy fee is calculated from the gross SOL amount. Tokens are priced
against the amount remaining after both fees. Subsequent buys likewise price
tokens against the amount remaining after the trading fee.

## Contract safeguards in this draft

- The mint must have zero supply, the creator as mint authority, and no freeze
  authority, and exactly 9 decimals. Mint authority is transferred to the curve
  PDA at initialization. The curve caps outstanding supply at 1 billion tokens.
- Public buys and sells are disabled until the creator completes the mandatory
  initial buy.
- The fee recipient is enforced by the program, not selected by the caller.
- SOL reserves are held in a program-owned PDA so the program can safely pay
  sellers, with rent-exemption and tracked-liquidity checks.
- Buy and sell instructions enforce caller-provided minimum outputs.

## Local validation

Install compatible Rust, Solana, and Anchor 0.29.0 toolchains, then run:

```sh
cargo test --workspace
anchor test
```

These commands have not been run for this draft. The Anchor integration test
expects a local validator; it does not deploy to mainnet.

## Required before any mainnet launch

1. Implement and test a Raydium CPMM migration CPI, including exact pool
   accounts/configuration, liquidity amounts, authority rules, and failure
   recovery. Specify what happens to remaining curve tokens and SOL.
2. Wire token creation and the creator's initial buy into the application;
   the existing launch page is not a transaction flow.
3. Run builds and tests on the intended toolchain, add validator coverage for
   authorization, fee accounting, slippage, liquidity, and graduation.
4. Obtain an independent Solana program security review and resolve findings.
5. On your trusted local machine, create a **program** keypair outside the repo:

   ```sh
   mkdir -p "$HOME/.config/solana/keys"
   chmod 700 "$HOME/.config/solana/keys"
   umask 077
   solana-keygen new \
     --outfile "$HOME/.config/solana/keys/frostdex-bonding-curve-v2.json"
   solana-keygen pubkey "$HOME/.config/solana/keys/frostdex-bonding-curve-v2.json"
   ```

   Store the seed phrase offline and never paste it or the JSON keypair into
   chat, source control, or a website. The `solana-keygen pubkey` output must
   match `declare_id!` and the program ID in `Anchor.toml`; sync and verify
   them before building. This program keypair is distinct from the **deployer
   wallet**, which signs and pays for deployment.
6. Only after these steps, explicitly approve deployment and fund the deployer
   wallet. No mainnet deployment or transaction has been performed.
