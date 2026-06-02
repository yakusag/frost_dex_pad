---
name: Verify Anchor IDL against a deployed program without test SOL
description: How to confirm a hand-written Anchor IDL matches a live on-chain program when you can't fund a wallet (devnet faucet dry/rate-limited).
---

When you need to confirm a hand-written Anchor IDL matches a deployed program but
cannot run a funded transaction (devnet faucet returns 429 "reached your airdrop
limit" / "Internal error", and `process.env` secrets like a Helius RPC are NOT
exposed inside the code_execution sandbox), verify statically — it is conclusive:

1. **Discriminators** — recompute `sha256("global:<snake_ix>")[..8]` and
   `sha256("account:<PascalAcct>")[..8]` and compare to the IDL arrays. This
   algorithm is identical across Anchor 0.29 → 0.32, so an 0.30+-format IDL
   (with `address`/`discriminator`/`metadata`) works against an 0.29-built
   program as long as the bytes match.
2. **Instruction shape** — instantiate `new Program(idl, provider)` with a dummy
   wallet, build each ix via `program.methods.X(...).accountsPartial({...}).instruction()`,
   then assert the generated `keys` (order + isSigner + isWritable + pubkey)
   match the Rust `#[derive(Accounts)]` context exactly, and `data.subarray(0,8)`
   matches the discriminator. Arg encoding length = 8 + sum(arg sizes).
3. **Account decode** — round-trip `program.coder.accounts.encode/decode(name, sample)`
   to confirm the borsh layout/size and that fields surface in the camelCase
   names the reader code expects.

**Why:** the launchpad's IDL in `app/services/bondingCurveProgram.ts` is
maintained by hand, so drift from `solana-bonding-curve/.../lib.rs` is the real
risk — and that is fully checkable offline. A live funded e2e adds little beyond
this once all three checks pass.

**How to apply:** run these in code_execution using the workspace's installed
`@coral-xyz/anchor` + `@solana/web3.js`. Use `https://api.devnet.solana.com`
(read-only) to confirm the program account exists & is executable.
