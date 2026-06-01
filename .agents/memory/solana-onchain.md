---
name: Solana on-chain integration
description: Non-obvious gotchas wiring the Anchor bonding-curve program into the FrostDex create-token frontend.
---

# Wiring the bonding-curve program into the frontend

The launchpad (`app/pages/create-token/Index.tsx`) talks to the Anchor program in
`solana-bonding-curve/`. The frontend integration lives in
`app/services/bondingCurveProgram.ts`. It activates only when `VITE_PROGRAM_ID`
is a valid deployed program id; otherwise the page falls back to local simulation.

## Gotchas (not derivable from code)

- **spl-token bundles its own @solana/web3.js.** `@solana/spl-token` (0.3.x) ships a
  nested copy of `@solana/web3.js`, so a `Connection` from the root package is a
  *different type* than what spl-token functions expect. Functions taking a
  Connection (e.g. `getMinimumBalanceForRentExemptMint`) need the arg cast to
  `any`. Symptom: TS2345 "separate declarations of a private property
  getCancellationPromise".

- **Hand-written IDL is required.** The program isn't built (empty
  `target/idl`), and the repo's Anchor toolchain (0.29) mismatches the installed
  TS client (`@coral-xyz/anchor` 0.32). The frontend uses a hand-written
  **0.30+-format** IDL: each instruction/account carries an 8-byte
  `discriminator` = `sha256("global:<snake_ix>")[..8]` /
  `sha256("account:<Acct>")[..8]`. Field/type names use the new format
  (`pubkey`, not `publicKey`). `new Program(idl, provider)` reads the program id
  from `idl.address` (set it from the env var at runtime).

- **Use `.accountsPartial()`, not `.accounts()`.** The hand-written IDL has no PDA
  `seeds`/program `address` metadata, so Anchor cannot auto-resolve accounts.
  Pass every account explicitly (derive PDAs yourself) and use
  `.accountsPartial()` to skip resolution.

- **Phantom as the Anchor wallet.** Build `AnchorProvider` with a wallet wrapper
  exposing `publicKey`, `signTransaction`, `signAllTransactions` (Phantom provides
  these). The ephemeral mint Keypair is added via `.signers([mintKeypair])`.

- **Create flow is one tx + optional initial-buy tx.** Tx A: preInstructions
  [SystemProgram.createAccount(mint), initializeMint2(mint, 9, user, user)] then
  `initialize` (which `set_authority`s the mint to the curve PDA), optionally
  `create_token` appended as a postInstruction for advanced-option fees. Tx B (if
  initial buy): `initial_buy`. Reserves are read back via `fetchCurveState`.

- **Curve math mirrors lib.rs in BigInt.** Reserves are lamports / 9-decimal base
  units on-chain; the UI's localStorage list keeps human units. localStorage is
  only a discovery list — the authoritative curve state is on-chain.

## Still required to go live (operator, not agent)
Deploy the program (`anchor build && anchor deploy`) and set `VITE_PROGRAM_ID`
(+ a dedicated `VITE_SOLANA_RPC`). Needs the Rust/Solana toolchain and real SOL,
so it can't be done from the agent environment.
