---
name: Solana token metadata (name/logo in wallets)
description: How launched SPL tokens get a name+logo in Phantom/Solscan, and the byte-limit trap.
---

# On-chain token metadata

Newly launched SPL mints show a name + logo in Phantom/Solscan only if a Metaplex
Token Metadata account exists for the mint. The bonding-curve program does NOT
create one, so the launchpad attaches it itself: a hand-built
CreateMetadataAccountV3 instruction (discriminator `33`, DataV2 layout, manual
Borsh), added as a preInstruction after createMint/initMint and before the curve
`initialize`. Metadata PDA seeds: `["metadata", TOKEN_METADATA_PROGRAM_ID, mint]`,
program `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`. Built by hand to avoid
pulling `@metaplex-foundation/mpl-token-metadata` (only `umi`/`mpl-toolbox` are
installed, not the token-metadata package).

Ordering requirement: the metadata `uri` must point at the pinned JSON, so the
mint keypair is pre-generated (`newMint()`) and the JSON is pinned to IPFS
*before* the create transaction.

**Why (byte vs char limit):** Metaplex enforces **byte-length** limits — name ≤ 32,
symbol ≤ 10, uri ≤ 200 **bytes**. Truncating with `String.slice()` counts UTF-16
code units, not bytes, so a multibyte name (Arabic — this project's users write
Darija — CJK, emoji) can pass a `.slice(0,32)` check yet still overflow on-chain
and make the whole create transaction fail with NameTooLong/SymbolTooLong/UriTooLong.

**How to apply:** Always truncate metadata strings by UTF-8 byte length at
code-point boundaries (`Buffer.byteLength(s,"utf8")`), never by character count,
before serializing any Metaplex instruction.
