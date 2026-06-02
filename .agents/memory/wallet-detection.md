---
name: Solana wallet provider detection
description: How to resolve injected Solana wallets safely without one wallet hijacking another.
---

# Solana wallet detection (app/services/solanaWallet.ts)

Resolve each wallet only via its **own dedicated namespace/flag**, never the bare `window.solana`.

**Why:** Brave Wallet (and others) spoof `window.solana.isPhantom`. On mobile Brave, trusting `window.solana.isPhantom` connected Brave when the user picked Phantom, and the Brave prompt ("interact with Brave Wallet") appeared. The fix: `detectProvider('phantom')` returns `window.phantom.solana` only, else `null`.

**How to apply:** Returning `null` (wallet not injected here) is correct — the picker then offers the mobile "Open app" deep link into the real wallet's in-app browser, where the genuine provider IS injected and signing works. Don't add a `window.solana` fallback for Phantom. Modern Phantom always injects `window.phantom.solana` on desktop extension and in-app browser, so desktop users don't regress.

## Never auto-connect a single detected wallet on the launchpad

The "Connect Wallet" handler on the create-token page must **always open the picker**, never auto-connect even when exactly one wallet is detected.

**Why:** In Brave, Brave Wallet injects itself as the only detected Solana wallet, so an "auto-connect when only one is installed" shortcut fired Brave's connect prompt without the user ever choosing it — exactly the unwanted "interact with Brave Wallet" popup users complained about. Safe provider detection alone doesn't prevent this; the auto-connect branch was the second cause.

**How to apply:** Keep `handleConnectWallet` as just "open the picker". The user explicitly selects a wallet every time. Brave stays in the list as a manual choice only.

## Mobile deep-link must auto-fire the connect prompt on return

A mobile deep link into a wallet's in-app browser must carry a marker so the reopened page knows which wallet to connect, and must auto-fire the connect prompt on arrival.

**Why:** Deep-linking into the wallet app (e.g. Phantom) reopened the site but left a dead "Connect" button — nothing prompted connect/sign, so users never finished connecting. The page needs to know (a) which wallet was chosen and (b) that it should connect immediately. The injected provider can also appear a moment *after* page load in in-app browsers, so a single startup `detectProvider()` misses it — poll for it (`waitForProvider`).

**How to apply:** `openInWalletApp(id)` stamps `frostConnect=<id>` on the returned URL; a mount effect reads it, strips it (replaceState) so refresh won't reconnect, waits for the provider, then connects that exact id. This does NOT reintroduce the Brave hijack — auto-connect only ever targets the explicit id the user picked, never bare `window.solana`. **StrictMode trap:** guard the effect with a `useRef` so it runs once, and do NOT cancel the in-flight connect on cleanup — otherwise React 18 dev double-invoke strips the marker on the first pass and the second pass finds nothing, suppressing the prompt.
