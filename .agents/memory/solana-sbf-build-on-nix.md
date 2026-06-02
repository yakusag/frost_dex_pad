---
name: Solana SBF program builds on Replit (nix)
description: How to build & deploy an Anchor/Solana program in this Replit nix environment — read-only SDK, reaped background procs, rate-limited faucet.
---

Building/deploying the Anchor bonding-curve program (`solana-bonding-curve/`) to Solana from this Replit container hits three environment-specific blockers. Workarounds below.

## 1. `cargo build-sbf` fails: "Failed to install platform-tools: Permission denied"
**Why:** the Solana CLI is installed in the read-only nix store (`/nix/store/...-solana-cli-*/bin`). `cargo-build-sbf` tries to install the SBF platform-tools INTO `<sdk>/sbf/dependencies`, which is read-only there.
**How to apply:** copy the SDK to a writable dir and point `SBF_SDK_PATH`/`--sbf-sdk` at it:
```
SOLBIN=$(dirname $(which solana))
cp -rL "$SOLBIN/sdk/." ~/solana-sdk/ && chmod -R u+w ~/solana-sdk
cd solana-bonding-curve && cargo build-sbf --sbf-sdk $HOME/solana-sdk/sbf
```
platform-tools (~the SBF rust toolchain, large) then download into the writable copy. Output: `solana-bonding-curve/target/deploy/bonding_curve.so`.

## 2. Long builds die — detached background processes are reaped
**Why:** nohup/setsid/disown processes are KILLED the moment each bash tool call returns; and the max bash timeout (120s) is shorter than the build.
**How to apply:** run the build as a persistent **workflow** (`configureWorkflow`, outputType "console", tee to a log file), poll the log/`.so` until done, then `removeWorkflow`. Do NOT rely on detached shell processes for anything longer than one bash call.

## 3. Devnet CLI airdrop is hard rate-limited
**Why:** `solana airdrop` shares the container's IP, which is throttled — persistently returns "airdrop request failed... rate limit".
**How to apply:** have the USER fund the deployer wallet via the web faucet (https://faucet.solana.com, Devnet). Don't burn turns retrying the CLI airdrop.

## Deploy notes
- Keep the same program ID across redeploys: `solana program deploy <.so> --program-id solana-bonding-curve/target/deploy/bonding_curve-keypair.json`. Program ID is fixed at `CqzUoSdSQPpcTJXhiTgAdupoaJ9yRTjbVXVfC41Aqckm` (matches `declare_id!` in lib.rs).
- The frontend IDL is hand-written in `app/services/bondingCurveProgram.ts`, so `anchor build` / IDL regen is NOT needed — only the `.so` build + deploy.
- Frontend wiring: `VITE_PROGRAM_ID` (Replit env, public) + `VITE_SOLANA_RPC` (stored as a Replit *secret*, so can't be read/overwritten by the agent — use `requestEnvVar` to have the user update it). RPC must match the cluster the program is deployed to or the frontend silently falls back to mainnet. Same vars must also be set in the Vercel dashboard for the live site.
- Deploy cost on devnet ≈ 2.17 SOL rent-exempt for a ~305 KB program (peak need higher transiently for the buffer account); ask the user for ~5 SOL.
