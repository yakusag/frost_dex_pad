// ─────────────────────────────────────────────────────────────────────────────
// Phantom Mobile Universal-Link (deeplink) protocol.
//
// Instead of opening the site inside Phantom's own in-app browser, this module
// implements the redirect-based flow described in Phantom's documentation:
//
//   1. App redirects user to https://phantom.app/ul/v1/connect (with an
//      encrypted payload + redirect_link pointing back to the app).
//   2. Phantom opens in the user's wallet app, they approve the connection.
//   3. Phantom redirects back to redirect_link (opens in the user's ORIGINAL
//      browser — Safari/Chrome) with the encrypted result in URL params.
//   4. App decrypts the result to get the user's public key.
//   5. For signing, same round-trip via /signAndSendTransaction.
//
// The app maintains a persistent dApp keypair in localStorage (only the
// public key is shared with Phantom — the private key never leaves the device).
// A shared ECDH secret is derived once during connect and reused for signing.
//
// Ref: https://docs.phantom.app/mobile-deeplinks/provider-methods
// ─────────────────────────────────────────────────────────────────────────────

import nacl from "tweetnacl";
import bs58 from "bs58";

const LS_DAPP_KP      = "frost_phantom_dapp_kp";
const LS_SESSION      = "frost_phantom_session";
const LS_PHANTOM_EKEY = "frost_phantom_enc_pubkey";
const LS_WALLET_ADDR  = "frost_phantom_wallet";

// ─── Dapp keypair (persistent — regenerated only when explicitly cleared) ─────

function getDappKeypair(): nacl.BoxKeyPair {
  try {
    const stored = localStorage.getItem(LS_DAPP_KP);
    if (stored) {
      const { sk } = JSON.parse(stored) as { sk: number[] };
      return nacl.box.keyPair.fromSecretKey(new Uint8Array(sk));
    }
  } catch { /* fall through — generate fresh */ }
  const kp = nacl.box.keyPair();
  localStorage.setItem(LS_DAPP_KP, JSON.stringify({ sk: Array.from(kp.secretKey) }));
  return kp;
}

function getSharedKey(): Uint8Array | null {
  const encodedPhantomKey = localStorage.getItem(LS_PHANTOM_EKEY);
  if (!encodedPhantomKey) return null;
  try {
    const kp = getDappKeypair();
    return nacl.box.before(bs58.decode(encodedPhantomKey), kp.secretKey);
  } catch {
    return null;
  }
}

// ─── Encryption helpers ────────────────────────────────────────────────────────

function encrypt(payload: object, sharedKey: Uint8Array): { nonce: string; data: string } {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(
    Buffer.from(JSON.stringify(payload)),
    nonce,
    sharedKey,
  );
  return { nonce: bs58.encode(nonce), data: bs58.encode(encrypted) };
}

function decrypt(data: string, nonce: string, sharedKey: Uint8Array): any {
  const decrypted = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedKey,
  );
  if (!decrypted) throw new Error("Phantom decryption failed — bad key or tampered data.");
  return JSON.parse(Buffer.from(decrypted).toString("utf-8"));
}

// ─── Cross-tab broadcast ───────────────────────────────────────────────────────
// When Phantom redirects back to ANY browser tab/window (including the system
// default browser instead of the originating one), that landing tab calls
// broadcastPhantomConnectResult(). Any other tab in the SAME browser that is
// listening via subscribePhantomBroadcast() picks up the result instantly via
// the storage event — without the user having to do anything.

const LS_BC_KEY = "frost_phantom_bc_result";

/**
 * After a successful parsePhantomConnectReturn(), call this so that any
 * sibling tab waiting in the same browser gets the wallet address immediately.
 */
export function broadcastPhantomConnectResult(): void {
  const addr = localStorage.getItem(LS_WALLET_ADDR);
  if (!addr) return;
  localStorage.setItem(LS_BC_KEY, JSON.stringify({ addr, ts: Date.now() }));
  // Auto-clean after 30 s to avoid stale state on future sessions.
  setTimeout(() => { try { localStorage.removeItem(LS_BC_KEY); } catch { /* noop */ } }, 30_000);
}

/**
 * Listen for a Phantom connect result broadcast from another tab in this
 * browser. Returns an unsubscribe function — call it when the component
 * unmounts or when the result has been received.
 */
export function subscribePhantomBroadcast(
  onResult: (walletAddr: string) => void,
): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== LS_BC_KEY || !e.newValue) return;
    try {
      const { addr, ts } = JSON.parse(e.newValue) as { addr: string; ts: number };
      if (Date.now() - ts < 60_000) onResult(addr);
    } catch { /* ignore malformed entries */ }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** True when a Phantom session is stored and ready for signing. */
export function hasPhantomDeeplinkSession(): boolean {
  return !!(
    localStorage.getItem(LS_SESSION) &&
    localStorage.getItem(LS_PHANTOM_EKEY) &&
    localStorage.getItem(LS_WALLET_ADDR)
  );
}

/** The wallet address from the active Phantom deeplink session, or null. */
export function getPhantomDeeplinkAddress(): string | null {
  return localStorage.getItem(LS_WALLET_ADDR);
}

/** Clear all stored Phantom deeplink state (disconnect). */
export function clearPhantomDeeplink(): void {
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_PHANTOM_EKEY);
  localStorage.removeItem(LS_WALLET_ADDR);
}

/**
 * Build the Phantom Universal Link connect URL without navigating.
 * Use this when you want to open it via window.open() (preferred on mobile so
 * the originating browser tab stays alive and can receive the broadcast).
 */
export function buildPhantomConnectUrl(redirectLink: string): string {
  const kp = getDappKeypair();
  const url = new URL("https://phantom.app/ul/v1/connect");
  url.searchParams.set("app_url", window.location.origin);
  url.searchParams.set("dapp_encryption_public_key", bs58.encode(kp.publicKey));
  url.searchParams.set("redirect_link", redirectLink);
  url.searchParams.set("cluster", "mainnet-beta");
  return url.toString();
}

/**
 * Open Phantom for wallet connection via Universal Link.
 *
 * Strategy — keep the originating browser tab alive:
 *   1. window.open() opens the Phantom Universal Link in a new tab.
 *      On iOS/Android, the OS intercepts it and launches the Phantom app;
 *      the blank new tab closes itself.  The original browser tab (Brave,
 *      Chrome, …) stays open and can receive the connection result via the
 *      broadcastPhantomConnectResult / subscribePhantomBroadcast mechanism.
 *   2. If window.open() is blocked (popup blocker), fall back to navigating
 *      the current tab — same behaviour as before.
 *
 * After Phantom approves, it opens redirect_link in the system default
 * browser.  If that is a different browser from the originating one,
 * subscribePhantomBroadcast() won't fire (different localStorage), but the
 * UI shows a "copy connection link" fallback so the user can finish manually.
 */
export function phantomConnect(redirectLink: string): Window | null {
  const url = buildPhantomConnectUrl(redirectLink);
  const popup = window.open(url, "_blank", "noopener");
  if (!popup) {
    // Popup blocked — navigate the current tab (legacy fallback).
    window.location.href = url;
    return null;
  }
  return popup;
}

/**
 * Parse the URL params injected by Phantom after a connect redirect.
 * Call this on page load when the URL contains `phantom_encryption_public_key`.
 * Returns the user's Solana public key (base58) on success, null on failure.
 */
export function parsePhantomConnectReturn(): string | null {
  const params = new URLSearchParams(window.location.search);
  const phantomEncKey = params.get("phantom_encryption_public_key");
  const data          = params.get("data");
  const nonce         = params.get("nonce");
  const errorCode     = params.get("errorCode");

  if (errorCode) {
    console.warn("Phantom connect error:", params.get("errorMessage"));
    return null;
  }
  if (!phantomEncKey || !data || !nonce) return null;

  try {
    // Store Phantom's encryption public key so we can derive a shared secret.
    localStorage.setItem(LS_PHANTOM_EKEY, phantomEncKey);

    const sharedKey = getSharedKey()!;
    const result = decrypt(data, nonce, sharedKey) as {
      public_key: string;
      session: string;
    };

    localStorage.setItem(LS_SESSION,     result.session);
    localStorage.setItem(LS_WALLET_ADDR, result.public_key);
    return result.public_key;
  } catch (e) {
    console.error("parsePhantomConnectReturn failed:", e);
    clearPhantomDeeplink();
    return null;
  }
}

/**
 * Redirect to Phantom to sign and send a (possibly partially-signed) transaction.
 * `serializedTx` is the serialized transaction bytes (may already have app-side
 * signatures, e.g. the mint keypair). Phantom adds the user's signature and
 * broadcasts. Returns true on success, false when there is no active session.
 *
 * After signing, Phantom redirects to `redirectLink` with the signature in URL
 * params. Call `parsePhantomSignReturn()` there to retrieve the signature.
 */
export function phantomSignAndSend(
  serializedTx: Uint8Array,
  redirectLink: string,
): boolean {
  const session = localStorage.getItem(LS_SESSION);
  const sharedKey = getSharedKey();
  if (!session || !sharedKey) return false;

  const kp = getDappKeypair();
  const { nonce, data } = encrypt(
    { session, transaction: bs58.encode(serializedTx) },
    sharedKey,
  );

  const url = new URL("https://phantom.app/ul/v1/signAndSendTransaction");
  url.searchParams.set("dapp_encryption_public_key", bs58.encode(kp.publicKey));
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("redirect_link", redirectLink);
  url.searchParams.set("payload", data);
  window.location.href = url.toString();
  return true;
}

/**
 * Parse the URL params injected by Phantom after a signAndSendTransaction redirect.
 * Returns the transaction signature on success, null otherwise.
 */
export function parsePhantomSignReturn(): string | null {
  const params   = new URLSearchParams(window.location.search);
  const data     = params.get("data");
  const nonce    = params.get("nonce");
  const errCode  = params.get("errorCode");

  if (errCode) {
    console.warn("Phantom sign error:", params.get("errorMessage"));
    return null;
  }
  if (!data || !nonce) return null;

  try {
    const sharedKey = getSharedKey();
    if (!sharedKey) return null;
    const result = decrypt(data, nonce, sharedKey) as { signature: string };
    return result.signature ?? null;
  } catch (e) {
    console.error("parsePhantomSignReturn failed:", e);
    return null;
  }
}

/** Strip all Phantom deeplink params from the current URL (clean up after parsing). */
export function stripPhantomParams(): void {
  const params = new URLSearchParams(window.location.search);
  const phantomKeys = [
    "phantom_encryption_public_key", "data", "nonce",
    "errorCode", "errorMessage", "frostConnect",
  ];
  let removed = false;
  for (const k of phantomKeys) {
    if (params.has(k)) { params.delete(k); removed = true; }
  }
  if (!removed) return;
  const qs = params.toString();
  const clean = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState(null, "", clean);
}
