# FrostDex — DEX Creator Template

A customizable Decentralized Exchange (DEX) frontend built on the Orderly Network SDK. Provides trading, portfolio management, markets, leaderboards, rewards, vaults, and swap functionality.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 7
- **Package Manager**: Yarn 1.22
- **Styling**: Tailwind CSS
- **Blockchain**: Orderly Network SDK, Wagmi, Privy, Solana Wallet Adapter
- **Charts**: TradingView Charting Library

## Project Structure

- `app/` — Main source code (components, pages, hooks, styles, utils)
- `public/config.js` — Runtime configuration (broker ID, name, chains, social links, feature flags)
- `public/locales/` — i18n translation files
- `public/tradingview/` — TradingView charting library bundles
- `scripts/` — Build automation (manifest generation, locale copying)

## Running the App

```bash
yarn dev
```

Starts the Vite dev server on port 5000.

## Runtime Configuration

All branding and feature flags live in `public/config.js` — no rebuild required to change broker name, chains, social links, etc.

## Deployment

Configured as a **static** deployment. Build output goes to `build/client/`.

Build command: `yarn install && yarn build`

## Environment Notes

- Native binaries `@rollup/rollup-linux-x64-gnu` and `@oxc-parser/binding-linux-x64-gnu` must be present in `node_modules` (yarn skips optional deps — the startup script handles this automatically).
- Node.js ≥ 20 required.

## User Preferences

(Add any user preferences here)
