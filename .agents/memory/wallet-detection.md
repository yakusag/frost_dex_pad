---
name: Solana wallet provider detection
description: How to resolve injected Solana wallets safely without one wallet hijacking another.
---

# Solana wallet detection (app/services/solanaWallet.ts)

Resolve each wallet only via its **own dedicated namespace/flag**, never the bare `window.solana`.

**Why:** Brave Wallet (and others) spoof `window.solana.isPhantom`. On mobile Brave, trusting `window.solana.isPhantom` connected Brave when the user picked Phantom, and the Brave prompt ("interact with Brave Wallet") appeared. The fix: `detectProvider('phantom')` returns `window.phantom.solana` only, else `null`.

**How to apply:** Returning `null` (wallet not injected here) is correct — the picker then offers the mobile "Open app" deep link into the real wallet's in-app browser, where the genuine provider IS injected and signing works. Don't add a `window.solana` fallback for Phantom. Modern Phantom always injects `window.phantom.solana` on desktop extension and in-app browser, so desktop users don't regress.
