// ─────────────────────────────────────────────────────────────────────────────
// Multi-wallet Solana provider support.
//
// The launch/trade flow used to assume Phantom only. This module generalizes the
// connection surface to the common injected Solana wallets — Phantom, Solflare,
// Backpack, Coinbase Wallet and Brave Wallet — while keeping a single "active
// provider" that the rest of the app (connect / sign / send) routes through.
//
// IMPORTANT: several wallets inject `window.solana`, so we never connect to a
// bare `window.solana`. Each wallet is resolved via its own dedicated namespace
// and/or an identity flag (isPhantom / isSolflare / …). See
// `.agents/memory/wallet-provider-detection.md`.
// ─────────────────────────────────────────────────────────────────────────────

export interface KnownWallet {
  id: string;
  name: string;
  icon: string;
  install: string;
  // Whether this wallet offers a mobile in-app-browser deep link.
  deepLink?: (url: string, ref: string) => string;
}

export interface DetectedWallet extends KnownWallet {
  // The injected provider object, or null when the wallet isn't installed.
  provider: any | null;
}

// Catalogue of the wallets we support. Order = display order in the picker.
export const KNOWN_WALLETS: KnownWallet[] = [
  {
    id: "phantom",
    name: "Phantom",
    icon: "👻",
    install: "https://phantom.app/download",
    deepLink: (url, ref) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  },
  {
    id: "solflare",
    name: "Solflare",
    icon: "🔆",
    install: "https://solflare.com/download",
    deepLink: (url, ref) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  },
  {
    id: "backpack",
    name: "Backpack",
    icon: "🎒",
    install: "https://backpack.app/downloads",
    deepLink: (url, ref) => `https://backpack.app/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    icon: "🔵",
    install: "https://www.coinbase.com/wallet/downloads",
    deepLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "brave",
    name: "Brave Wallet",
    icon: "🦁",
    install: "https://brave.com/wallet/",
  },
];

function fromProviders(predicate: (p: any) => boolean): any | null {
  const w = window as any;
  if (Array.isArray(w.solana?.providers)) {
    return w.solana.providers.find(predicate) || null;
  }
  return null;
}

// Resolve the injected provider for a specific wallet id. Returns null when the
// wallet isn't present. Never falls back to a different wallet's provider.
export function detectProvider(id: string): any | null {
  const w = window as any;
  switch (id) {
    case "phantom":
      // Brave Wallet spoofs `isPhantom` on the bare `window.solana`, so resolving
      // Phantom there connects Brave by mistake. Prefer Phantom's own
      // `window.phantom.solana` namespace and never accept a Brave provider.
      return w.phantom?.solana?.isPhantom ? w.phantom.solana
        : (w.solana?.isPhantom && !w.solana?.isBraveWallet) ? w.solana
        : fromProviders((p) => p?.isPhantom && !p?.isBraveWallet);
    case "solflare":
      return w.solflare?.isSolflare ? w.solflare
        : w.solana?.isSolflare ? w.solana
        : fromProviders((p) => p?.isSolflare);
    case "backpack":
      return w.backpack?.isBackpack ? w.backpack
        : w.solana?.isBackpack ? w.solana
        : fromProviders((p) => p?.isBackpack);
    case "coinbase":
      return w.coinbaseSolana ?? (w.solana?.isCoinbaseWallet ? w.solana : fromProviders((p) => p?.isCoinbaseWallet));
    case "brave":
      return w.braveSolana ?? (w.solana?.isBraveWallet ? w.solana : fromProviders((p) => p?.isBraveWallet));
    default:
      return null;
  }
}

// All known wallets annotated with their (possibly null) provider.
export function detectWallets(): DetectedWallet[] {
  return KNOWN_WALLETS.map((wlt) => ({ ...wlt, provider: detectProvider(wlt.id) }));
}

// Only the wallets that are actually installed/injected right now.
export function detectInstalledWallets(): DetectedWallet[] {
  return detectWallets().filter((w) => !!w.provider);
}

// ─── Active provider (shared across the app) ──────────────────────────────────
let activeProvider: any = null;
let activeWalletId: string | null = null;

export function setActiveWallet(id: string, provider: any): void {
  activeWalletId = id;
  activeProvider = provider;
}
export function getActiveProvider(): any | null {
  return activeProvider;
}
export function getActiveWalletId(): string | null {
  return activeWalletId;
}
export function clearActiveWallet(): void {
  activeProvider = null;
  activeWalletId = null;
}

// ─── Connection ───────────────────────────────────────────────────────────────
export async function connectProvider(provider: any): Promise<string> {
  if (!provider) throw new Error("Wallet not found");
  try {
    const resp = await provider.connect();
    // Phantom/Backpack return { publicKey } from connect(); Solflare may set it
    // on the provider instead.
    const pk = resp?.publicKey ?? provider.publicKey;
    if (!pk) throw new Error("Wallet did not return a public key.");
    return pk.toString();
  } catch (e: any) {
    if (e?.code === 4001) throw new Error("Connection request rejected in wallet.");
    throw new Error(e?.message || "Could not connect to wallet.");
  }
}

// Connect to a wallet by id, recording it as the active provider on success.
export async function connectWalletById(id: string): Promise<string> {
  const provider = detectProvider(id);
  if (!provider) {
    const meta = KNOWN_WALLETS.find((w) => w.id === id);
    throw new Error(`${meta?.name ?? "Wallet"} is not installed.`);
  }
  const address = await connectProvider(provider);
  setActiveWallet(id, provider);
  return address;
}

// ─── Environment helpers ──────────────────────────────────────────────────────
export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}

// Open the current page inside a wallet's in-app browser (where the provider is
// injected). Returns false when the wallet has no deep-link scheme.
export function openInWalletApp(id: string): boolean {
  const meta = KNOWN_WALLETS.find((w) => w.id === id);
  if (!meta?.deepLink) return false;
  window.location.href = meta.deepLink(window.location.href, window.location.origin);
  return true;
}
