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

**How to apply:** when adding any new Solana wallet interaction, reuse `getPhantom()` rather
than `window.solana`. On mobile with no Phantom provider, deep-link into Phantom's in-app
browser via `https://phantom.app/ul/browse/<url>` (Brave mobile has no Phantom extension).
