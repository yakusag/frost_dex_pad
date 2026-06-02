---
name: Shared token indexing (registry)
description: How the launchpad makes tokens visible to all visitors, and why Pinata (not on-chain enumeration) backs it
---
# Shared token discovery

The launchpad's token list is the union of three sources, merged by `mint`:
1. `localStorage` (this device's created/traded tokens — rich: image, socials, trade history)
2. The shared **Pinata registry** — every launched token's metadata JSON is pinned to the platform's single Pinata account with a keyvalue tag `frostdexToken="1"` (plus `mint`, `creator`, `createdAt`, `name`, `symbol`). `listFrostdexTokens()` queries Pinata's `data/pinList` filtered by that tag, so any visitor sees every token.
3. Live reserves read per-mint from the on-chain bonding curve via `fetchCurveState(mint)`.

**Why Pinata, not on-chain `getProgramAccounts`/Metaplex:** the SPL mint is created with NO Metaplex metadata, so name/symbol/image are not on-chain — only the curve account (mint + reserves) is. Recovering names/images globally from chain alone would require adding a Metaplex metadata instruction to the create transaction (untestable without a funded wallet, new heavy dep, and some RPCs block getProgramAccounts). The Pinata registry reuses infra the app already depends on (images are pinned there) and adds zero new failure modes to the launch tx.

**Key constraint:** metadata must be pinned AFTER the on-chain mint so the `mint` keyvalue is present — the registry entry is useless for mapping to chain state without it. Discovery is therefore coupled to the platform's Pinata account/JWT (`VITE_PINATA_JWT`). If Pinata isn't configured, the global list is empty (local-only).
