---
name: Solana wallet provider detection (Phantom vs Brave)
description: How to resolve the correct injected Solana wallet and avoid Brave hijacking Phantom; mobile deep-link behavior.
---

# Solana wallet provider detection

The launchpad supports several injected Solana wallets (Phantom, Solflare, Backpack,
Coinbase, Brave). Many of them inject `window.solana`, so resolving a wallet by the
bare `window.solana` is unsafe.

## Phantom-vs-Brave trap
**Brave Wallet spoofs `isPhantom: true` on `window.solana`.** So selecting "Phantom"
and reading `window.solana.isPhantom` connects **Brave** instead — this is exactly the
"I tapped Phantom but Brave connected" bug.

**Rule:** resolve Phantom via its own namespace `window.phantom.solana` first, and only
fall back to `window.solana`/providers when `isPhantom && !isBraveWallet`. Brave never
creates a `window.phantom` namespace, so that's the reliable signal.

**Why:** Brave deliberately mimics Phantom's flag for dapp compatibility; the dedicated
namespace is the only trustworthy discriminator.

## Mobile deep-link behavior
On a normal mobile browser (e.g. Brave on Android) the real Phantom is NOT injected.
After the fix, Phantom resolves to `null` there, so the picker shows it as "Open app"
and taps call its deep link (`https://phantom.app/ul/browse/<url>`) to re-open the page
**inside Phantom's in-app browser**, where the provider IS injected and the user can
connect + sign. This is the intended mobile UX — do not try to connect a non-injected
wallet directly.

**How to apply:** keep `detectProvider("phantom")` strict; keep the launchpad's own
wallet picker (it deep-links on mobile) rather than routing launchpad connect through
the Orderly navbar modal, which does not deep-link Solana wallets on mobile and threw
"Cannot read properties of undefined (reading 'chainId')".
