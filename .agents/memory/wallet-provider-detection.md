---
name: Phantom wallet detection on multi-wallet browsers
description: Why connecting via window.solana grabs the wrong wallet (Brave) and how to target Phantom specifically
---

# Targeting Phantom, not "whatever injected window.solana"

On the create-token page (`app/pages/create-token/Index.tsx`), the "Connect Phantom Wallet"
flow must resolve the **Phantom** provider specifically. Multiple wallets inject
`window.solana` — notably **Brave Wallet** on Brave browser (desktop & Android). Reading a
bare `window.solana` connects to Brave Wallet, which surfaces a localized "Une erreur interne
s'est produite" / "internal error" and shows a Brave Wallet consent popup instead of Phantom.

**Rule:** resolve Phantom in this order — `window.phantom.solana` (with `.isPhantom`), then
`window.solana.isPhantom`, then a `window.solana.providers[]` entry with `isPhantom`. If none,
return null (do NOT fall back to a non-Phantom provider).

**Why:** users reported the launch/connect button opening Brave Wallet and erroring on Brave
mobile. The bare `window.solana` is whatever wallet won the injection race.

**How to apply:** the create-token page now supports multiple wallets via
`app/services/solanaWallet.ts` (Phantom, Solflare, Backpack, Coinbase, Brave). Detect each
wallet by its own namespace/flag (`isPhantom`/`isSolflare`/`isBackpack`/`isCoinbaseWallet`/
`isBraveWallet`), never a bare `window.solana`. A single module-level "active provider"
(`getActiveProvider`/`setActiveWallet`) is shared by both `Index.tsx` and
`bondingCurveProgram.ts` for connect/sign/send. On mobile with no injected provider, deep-link
into each wallet's in-app browser (Phantom/Solflare/Backpack/Coinbase have `ul/browse` schemes;
Brave has none). When adding new wallet interactions, route through `getActiveProvider()`.
