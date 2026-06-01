---
name: Bonding curve program deployment
description: Deployment status and constraints for the Anchor bonding-curve program; how fees actually route.
---

# Bonding curve program deployment

- The Anchor program lives in `solana-bonding-curve/programs/bonding-curve/src/lib.rs`.
  Its `declare_id!` is `CqzUoSdSQPpcTJXhiTgAdupoaJ9yRTjbVXVfC41Aqckm`.
- **As of this writing the program is NOT deployed on Solana mainnet** — `getAccountInfo`
  for that id returns `null`. The frontend therefore shows "⛓ Program not set" / runs in
  simulation fallback (only the SOL fees are real, sent to the platform wallet).
- The agent **cannot** deploy a Solana mainnet program from this environment: it needs the
  Solana/Anchor toolchain plus a deployer keypair funded with real SOL (~a few SOL for a
  program this size). Never ask for or handle the user's private key. The user must run
  `anchor build && anchor deploy` (or `solana-bonding-curve/setup.sh`) themselves, then
  give the resulting program id to set as `VITE_PROGRAM_ID`.

## Fee routing — no code change needed for the admin address
`fee_recipient` is **not** hardcoded in lib.rs; it is passed as an account at runtime and
the frontend supplies the admin wallet `EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ`
(`PLATFORM_FEE_WALLET`). So fees already route to the admin wallet by design — "verify my
address is in lib.rs" is a misconception; the address lives in the frontend constant, and
`declare_id!` is the program's own id, set at deploy time.
