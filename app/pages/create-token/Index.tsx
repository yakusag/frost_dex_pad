import { useState, useRef, useCallback, useEffect } from "react";
import QRCode from "qrcode.react";
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  uploadImageToIPFS,
  uploadJSONToIPFS,
  isPinataConfigured,
  listFrostdexTokens,
  fetchTokenJSON,
  ipfsGateway,
} from "@/services/ipfs";
import {
  isProgramConfigured,
  createTokenOnChain,
  buildCreateTokenTransaction,
  buildInitialBuyTransaction,
  newMint,
  buyOnChain,
  sellOnChain,
  fetchCurveState,
  getConnection,
} from "@/services/bondingCurveProgram";
import {
  connectWalletById,
  detectWallets,
  getActiveProvider,
  setActiveWallet,
  isMobile,
  openInWalletApp,
  waitForProvider,
  type DetectedWallet,
} from "@/services/solanaWallet";
import {
  phantomConnect,
  parsePhantomConnectReturn,
  parsePhantomSignReturn,
  phantomSignAndSend,
  hasPhantomDeeplinkSession,
  getPhantomDeeplinkAddress,
  clearPhantomDeeplink,
  stripPhantomParams,
  broadcastPhantomConnectResult,
  subscribePhantomBroadcast,
} from "@/services/phantomDeeplink";

// ─── Platform constants (from solana-bonding-curve/programs/bonding-curve/src/lib.rs) ──
const PLATFORM_FEE_WALLET = "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ";
const PLATFORM_FEE_BPS    = 1500;   // 15% on buy/sell
const INITIAL_BUY_FEE_BPS = 2000;   // 20% on initial buy
const VIRTUAL_SOL         = 30;
const VIRTUAL_TOKENS      = 1_000_000_000_000;
const GRADUATION_TARGET   = 85;
const STORAGE_KEY         = "frostdex_tokens_v1";
// RPC endpoint — NowNodes hardcoded as primary (works on all deployments).
const NOWNODES_RPC = "https://sol.nownodes.io/050b7243-6502-4f3c-8de3-4438f7ddf8a0";
const SOLANA_RPC_LIST: string[] = [
  (import.meta as any).env?.VITE_SOLANA_RPC || NOWNODES_RPC,
  "https://api.mainnet-beta.solana.com",
].filter(Boolean) as string[];

function makeConn(rpc: string) {
  return new Connection(rpc, { commitment: "confirmed", disableRetryOnRateLimit: true });
}

// Retries the given async fn with each RPC in order until one succeeds.
// On HTTP 403 / rate-limit / timeout it tries the next endpoint automatically.
async function withRpcFallback<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  let lastErr: any;
  for (const rpc of SOLANA_RPC_LIST) {
    try {
      return await Promise.race([
        fn(makeConn(rpc)),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("RPC timeout")), 8000)),
      ]);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      if (/403|rate.limit|rate limit|forbidden|too many|timeout/i.test(msg)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("All Solana RPC endpoints failed");
}
// Deployed bonding-curve program ID. Paste yours via VITE_PROGRAM_ID after `anchor deploy`.
const PROGRAM_ID          = (import.meta as any).env?.VITE_PROGRAM_ID || "";
const PROGRAM_ID_VALID    = (() => { try { return !!PROGRAM_ID && !!new PublicKey(PROGRAM_ID); } catch { return false; } })();

const ADVANCED_FEES: Record<string, { label: string; fee: number; lamports: number; desc: string; icon: string }> = {
  revoke_mint:        { label: "Revoke Mint Authority",    fee: 0.05, lamports: 50_000_000, desc: "No new tokens can ever be minted",          icon: "🔒" },
  revoke_freeze:      { label: "Revoke Freeze Authority",  fee: 0.03, lamports: 30_000_000, desc: "Token accounts cannot be frozen",            icon: "❄️" },
  immutable_metadata: { label: "Immutable Metadata",       fee: 0.02, lamports: 20_000_000, desc: "Name, symbol & image locked permanently",    icon: "📌" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TokenData {
  id: string; mint: string; name: string; symbol: string; description: string;
  image: string; metadataUri?: string; creator: string; creatorAddress: string;
  createdAt: number; website: string; telegram: string; twitter: string;
  virtualSol: number; virtualTokens: number; graduated: boolean;
  advancedOptions: string[]; tradeHistory: Trade[]; marketCap: number;
  txSignature?: string;
}
interface Trade {
  type: "buy" | "sell"; solAmount: number; tokenAmount: number;
  price: number; ts: number; wallet: string;
}

// ─── Bonding curve math (mirrors lib.rs) ─────────────────────────────────────
function getBuyQuote(vSol: number, vTokens: number, solIn: number, feeBps: number) {
  const fee = solIn * feeBps / 10000;
  const k = vSol * vTokens;
  const newSol = vSol + (solIn - fee);
  const tokensOut = Math.max(0, vTokens - k / newSol);
  return { tokensOut, fee, price: solIn / Math.max(tokensOut, 1e-9) };
}
function getSellQuote(vSol: number, vTokens: number, tokensIn: number, feeBps: number) {
  const k = vSol * vTokens;
  const grossSol = vSol - k / (vTokens + tokensIn);
  const fee = grossSol * feeBps / 10000;
  return { solOut: Math.max(0, grossSol - fee), fee };
}
function getPrice(vSol: number, vTokens: number) { return vSol / vTokens; }
function getMcap(vSol: number, vTokens: number) { return getPrice(vSol, vTokens) * VIRTUAL_TOKENS; }

// ─── Storage ──────────────────────────────────────────────────────────────────
const loadTokens = (): TokenData[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
const saveTokens = (t: TokenData[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(t));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const shortAddr = (a: string) => a ? `${a.slice(0,4)}…${a.slice(-4)}` : "";
const fmtAge = (ts: number) => { const s = (Date.now()-ts)/1000|0; return s<60?`${s}s`:s<3600?`${s/60|0}m`:s<86400?`${s/3600|0}h`:`${s/86400|0}d`; };
const fmtNum = (n: number) => n>=1e6?`${(n/1e6).toFixed(2)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:`${n.toFixed(2)}`;

// Turn a raw wallet/RPC error into a clear, actionable message. Handles the most
// common live-site failures: a rate-limited/forbidden public RPC (403), an
// out-of-funds wallet, and an unreachable on-chain program (wrong network).
function friendlyTxError(e: any): string {
  let msg = "";
  if (e?.message) msg = String(e.message);
  else if (Array.isArray(e?.logs) && e.logs.length) msg = e.logs.join("\n");
  else if (typeof e === "string") msg = e;
  else { try { msg = JSON.stringify(e); } catch { /* ignore */ } }
  if (/\b403\b|access forbidden|forbidden/i.test(msg)) {
    return "All public Solana RPC endpoints are rate-limited right now. Please try again in a few seconds.";
  }
  if (/insufficient|0x1\b|debit an account|prior credit/i.test(msg)) {
    return "Not enough SOL in your wallet to cover this transaction.";
  }
  if (/could not find|not found|account does not exist|invalid program/i.test(msg)) {
    return "On-chain program not reachable. Make sure VITE_PROGRAM_ID is set correctly in your deployment.";
  }
  return msg || "Transaction failed. Open your browser console for details.";
}

// ─── Wallet helpers ───────────────────────────────────────────────────────────
// Connect / sign / send all route through the currently selected provider
// (Phantom, Solflare, Backpack, Coinbase, Brave). See services/solanaWallet.ts.
async function sendFeeTransaction(
  fromAddress: string,
  lamports: number,
  onStatus: (s: string) => void
): Promise<string> {
  const p = getActiveProvider();
  if (!p) throw new Error("No wallet connected");
  onStatus("Building transaction…");
  const from = new PublicKey(fromAddress);
  const to   = new PublicKey(PLATFORM_FEE_WALLET);

  return withRpcFallback(async (connection) => {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
    );
    tx.feePayer = from;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    onStatus("Waiting for wallet approval…");
    const { signature } = await p.signAndSendTransaction(tx);
    onStatus("Confirming transaction…");
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  });
}

async function getWalletBalance(address: string): Promise<number> {
  try {
    return await withRpcFallback(async (connection) => {
      const lamports = await connection.getBalance(new PublicKey(address));
      return lamports / LAMPORTS_PER_SOL;
    });
  } catch { return 0; }
}

// ─── BondingBar ───────────────────────────────────────────────────────────────
function BondingBar({ virtualSol }: { virtualSol: number }) {
  const pct = Math.min(100, ((virtualSol - VIRTUAL_SOL) / (GRADUATION_TARGET - VIRTUAL_SOL)) * 100);
  const graduated = virtualSol >= GRADUATION_TARGET;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(180,190,210,0.5)", marginBottom: 3 }}>
        <span>{graduated ? "🎓 Graduated to Raydium" : "Bonding curve"}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: graduated ? "#0ecb81" : "linear-gradient(90deg,#38e0f8,#0ecb81)", borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ─── TokenCard ────────────────────────────────────────────────────────────────
function TokenCard({ token, onClick, onDelete }: { token: TokenData; onClick: () => void; onDelete?: () => void }) {
  const price = getPrice(token.virtualSol, token.virtualTokens);
  return (
    <div onClick={onClick} style={{ position: "relative", display: "flex", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(56,224,248,0.2)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Remove token"
          style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(246,70,93,0.25)", background: "rgba(246,70,93,0.08)", color: "#f6465d", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>🗑</button>
      )}
      <img src={token.image} alt={token.name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#1a1d26" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#eaecef" }}>{token.name}</span>
          <span style={{ fontSize: 11, color: "rgba(56,224,248,0.7)", background: "rgba(56,224,248,0.08)", borderRadius: 4, padding: "1px 6px" }}>${token.symbol}</span>
          {token.graduated && <span style={{ fontSize: 10, color: "#0ecb81", background: "rgba(14,203,129,0.1)", borderRadius: 4, padding: "1px 6px" }}>🎓 Graduated</span>}
        </div>
        <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{token.description || "No description"}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span style={{ color: "rgba(180,190,210,0.5)" }}>MCap: <b style={{ color: "#eaecef" }}>{fmtNum(token.marketCap)} SOL</b></span>
          <span style={{ color: "rgba(180,190,210,0.5)" }}>Price: <b style={{ color: "#0ecb81" }}>{price.toFixed(9)} SOL</b></span>
          <span style={{ color: "rgba(180,190,210,0.4)" }}>{fmtAge(token.createdAt)}</span>
        </div>
        <BondingBar virtualSol={token.virtualSol} />
      </div>
    </div>
  );
}

// ─── PriceChart (real-time bonding curve area chart) ─────────────────────────
function PriceChart({ token }: { token: TokenData }) {
  const [tick, setTick] = useState(0);
  // Pulse the live dot every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const current = getPrice(token.virtualSol, token.virtualTokens);
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : 1;
  const chrono = [...token.tradeHistory].reverse(); // oldest → newest
  const prices = chrono.map(t => t.price).filter(p => p > 0 && isFinite(p));

  // Build the actual trade series (with current price appended)
  let series = [...prices, safeCurrent];

  // When there are no trades yet, synthesise a bonding curve projection:
  // show 20 evenly-spaced price points from VIRTUAL_SOL to GRADUATION_TARGET.
  const isProjected = series.length < 2;
  if (isProjected) {
    const steps = 20;
    series = [];
    for (let i = 0; i <= steps; i++) {
      const vSol = VIRTUAL_SOL + (GRADUATION_TARGET - VIRTUAL_SOL) * (i / steps);
      // Constant-product: virtualTokens shrinks as vSol grows.
      const k = VIRTUAL_SOL * VIRTUAL_TOKENS;
      const vTok = k / vSol;
      series.push(getPrice(vSol, vTok));
    }
  }

  const W = 320, H = 130, PAD = 8;
  const min = Math.min(...series), max = Math.max(...series);
  const range = (max - min) || max || 1;
  const stepX = (W - PAD * 2) / (series.length - 1);
  const pts = series.map((p, i) => {
    const x = PAD + i * stepX;
    const y = PAD + (H - PAD * 2) * (1 - (p - min) / range);
    return [x, y] as const;
  });
  const line = pts.map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(1)},${H - PAD} L${pts[0][0].toFixed(1)},${H - PAD} Z`;
  const up = series[series.length - 1] >= series[0];
  const color = isProjected ? "#38e0f8" : (up ? "#0ecb81" : "#f6465d");
  const gid = "pc" + token.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const dotOpacity = (tick % 2 === 0) ? 1 : 0.3; // blink live indicator
  const priceDelta = prices.length >= 2 ? ((prices[prices.length - 1] - prices[0]) / prices[0] * 100) : null;

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 10px 6px", marginBottom: 12 }}>
      {/* Chart header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, paddingLeft: 2, paddingRight: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0ecb81", opacity: dotOpacity, transition: "opacity 0.3s" }} />
          <span style={{ fontSize: 10, color: "rgba(180,190,210,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            {isProjected ? "Curve Projection" : "Live Price"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {priceDelta !== null && (
            <span style={{ fontSize: 10, fontWeight: 700, color: priceDelta >= 0 ? "#0ecb81" : "#f6465d" }}>
              {priceDelta >= 0 ? "+" : ""}{priceDelta.toFixed(1)}%
            </span>
          )}
          <span style={{ fontSize: 10, color: "rgba(56,224,248,0.7)", fontFamily: "monospace" }}>
            {safeCurrent.toFixed(9)} SOL
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 140, display: "block" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={PAD} x2={W - PAD} y1={PAD + (H - PAD * 2) * g} y2={PAD + (H - PAD * 2) * g} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2"
          strokeDasharray={isProjected ? "5 3" : undefined}
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Live pulse dot at current price */}
        <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.2" />
        <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
      </svg>
      {isProjected && (
        <div style={{ fontSize: 9, color: "rgba(180,190,210,0.3)", textAlign: "center", paddingBottom: 2 }}>
          Projected curve · chart fills with real trades
        </div>
      )}
    </div>
  );
}

// ─── TradeModal ───────────────────────────────────────────────────────────────
function TradeModal({ token, onClose, onUpdate, walletAddress, walletCanSign }: {
  token: TokenData; onClose: () => void;
  onUpdate: (t: TokenData) => void; walletAddress: string; walletCanSign: boolean;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Poll chain state every 15 s to keep the chart and stats live.
  useEffect(() => {
    if (!token.mint || token.mint.length < 32) return;
    const poll = async () => {
      try {
        const state = await fetchCurveState(token.mint);
        if (!state) return;
        onUpdate({
          ...token,
          virtualSol: state.virtualSol,
          virtualTokens: state.virtualTokens,
          graduated: state.complete || state.virtualSol >= GRADUATION_TARGET,
          marketCap: getMcap(state.virtualSol, state.virtualTokens),
        });
      } catch { /* silent — poll again next cycle */ }
    };
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.mint]);

  const solAmount = parseFloat(amount) || 0;
  const buyQ  = getBuyQuote(token.virtualSol, token.virtualTokens, solAmount, PLATFORM_FEE_BPS);
  const sellQ = getSellQuote(token.virtualSol, token.virtualTokens, solAmount * 1000, PLATFORM_FEE_BPS);

  const onChain = isProgramConfigured() && !!token.mint && token.mint.length >= 32;

  const handleTrade = async () => {
    if (!walletAddress) { setError("Connect wallet first"); return; }
    if (!walletCanSign) { setError("This wallet can't sign on the launchpad in this browser. Open the site inside your wallet app, or use a browser-extension wallet."); return; }
    setLoading(true); setError(""); setStatus("");
    try {
      const tokens = loadTokens();
      let idx = tokens.findIndex(t => t.id === token.id);
      if (idx < 0) {
        // Token came from the shared registry (created on another device) and
        // isn't on this device yet — persist it so the trade and its history
        // are recorded locally.
        tokens.unshift({ ...token });
        idx = 0;
      }
      const t = { ...tokens[idx] };
      let txSig = "";

      if (onChain) {
        // Real on-chain trade against the deployed bonding-curve program.
        if (side === "buy") {
          txSig = await buyOnChain(token.mint, solAmount, walletAddress, setStatus);
        } else {
          txSig = await sellOnChain(token.mint, solAmount, walletAddress, setStatus);
        }
        setStatus(`✓ Confirmed (${txSig.slice(0, 8)}…)`);
        // Read the authoritative reserves back from chain.
        const state = await fetchCurveState(token.mint, walletAddress);
        if (state) {
          t.virtualSol = state.virtualSol;
          t.virtualTokens = state.virtualTokens;
          t.graduated = state.complete || state.virtualSol >= GRADUATION_TARGET;
        }
      } else {
        // Simulation fallback (no program configured): only the fee is real.
        const feeLamports = Math.round((side === "buy" ? buyQ.fee : sellQ.fee) * LAMPORTS_PER_SOL);
        if (feeLamports > 0) {
          txSig = await sendFeeTransaction(walletAddress, feeLamports, setStatus);
          setStatus(`✓ Fee sent (${txSig.slice(0, 8)}…)`);
        }
        if (side === "buy") { t.virtualSol += solAmount - buyQ.fee; t.virtualTokens -= buyQ.tokensOut; }
        else { t.virtualSol -= sellQ.solOut + sellQ.fee; t.virtualTokens += solAmount * 1000; }
        t.graduated = t.virtualSol >= GRADUATION_TARGET;
      }

      const tokenAmount = side === "buy" ? buyQ.tokensOut : solAmount * 1000;
      const effPrice = side === "buy" ? buyQ.price : sellQ.solOut / Math.max(solAmount * 1000, 1e-9);
      const trade: Trade = { type: side as "buy" | "sell", solAmount, tokenAmount, price: effPrice, ts: Date.now(), wallet: shortAddr(walletAddress) };
      t.marketCap = getMcap(t.virtualSol, t.virtualTokens);
      t.tradeHistory = [trade, ...t.tradeHistory];
      tokens[idx] = t;
      saveTokens(tokens);
      onUpdate(t);
      setAmount("0.1");
    } catch (e: any) { console.error("Trade failed:", e); setError(friendlyTxError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f1117", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <img src={token.image} alt={token.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#eaecef" }}>{token.name}</div>
            <div style={{ fontSize: 13, color: "rgba(56,224,248,0.7)" }}>${token.symbol} · {shortAddr(token.creatorAddress || "")}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(180,190,210,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Price / Market cap */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(180,190,210,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Price</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0ecb81" }}>{getPrice(token.virtualSol, token.virtualTokens).toFixed(9)} SOL</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "rgba(180,190,210,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Market cap</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#eaecef" }}>{fmtNum(getMcap(token.virtualSol, token.virtualTokens))} SOL</div>
          </div>
        </div>

        {/* Price chart (pump.fun style) */}
        <PriceChart token={token} />

        {/* Bonding curve progress */}
        <div style={{ margin: "4px 0 18px" }}>
          <BondingBar virtualSol={token.virtualSol} />
        </div>

        {/* Trades — shown right under the chart (pump.fun style) */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: "rgba(180,190,210,0.55)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Trades</div>
          {token.tradeHistory.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(180,190,210,0.35)", padding: "14px 0", textAlign: "center" }}>No trades yet — be the first to buy.</div>
          ) : (
            <div style={{ maxHeight: 190, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 1fr 0.7fr", fontSize: 10, color: "rgba(180,190,210,0.4)", padding: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                <span>Account</span><span>Type</span><span style={{ textAlign: "right" }}>SOL</span><span style={{ textAlign: "right" }}>Age</span>
              </div>
              {token.tradeHistory.slice(0, 50).map((tr, i) => (
                <div key={`${tr.ts}-${tr.wallet}-${i}`} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 1fr 0.7fr", fontSize: 12, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                  <span style={{ color: "rgba(180,190,210,0.7)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr.wallet}</span>
                  <span style={{ color: tr.type === "buy" ? "#0ecb81" : "#f6465d", fontWeight: 700 }}>{tr.type.toUpperCase()}</span>
                  <span style={{ textAlign: "right", color: "rgba(180,190,210,0.75)" }}>{tr.solAmount.toFixed(3)}</span>
                  <span style={{ textAlign: "right", color: "rgba(180,190,210,0.4)" }}>{fmtAge(tr.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["buy","sell"] as const).map(s => (
            <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: side === s ? (s === "buy" ? "#0ecb81" : "#f6465d") : "rgba(255,255,255,0.05)", color: side === s ? "#0b0e11" : "rgba(180,190,210,0.6)" }}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", display: "block", marginBottom: 6 }}>{side === "buy" ? "SOL amount" : "Token amount"}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,224,248,0.15)", borderRadius: 8, padding: "10px 14px", color: "#eaecef", fontSize: 15, outline: "none" }} />
            {["0.1","0.5","1"].map(v => <button key={v} onClick={() => setAmount(v)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(56,224,248,0.15)", background: "rgba(56,224,248,0.05)", color: "rgba(56,224,248,0.7)", fontSize: 12, cursor: "pointer" }}>{v}</button>)}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13 }}>
          {side === "buy" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(180,190,210,0.5)" }}>You receive</span>
                <b style={{ color: "#0ecb81" }}>{buyQ.tokensOut.toFixed(2)} tokens</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(180,190,210,0.5)" }}>Platform fee (15%)</span>
                <span style={{ color: "rgba(246,70,93,0.8)" }}>{buyQ.fee.toFixed(4)} SOL → {shortAddr(PLATFORM_FEE_WALLET)}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(180,190,210,0.5)" }}>You receive</span>
                <b style={{ color: "#0ecb81" }}>{sellQ.solOut.toFixed(4)} SOL</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(180,190,210,0.5)" }}>Platform fee (15%)</span>
                <span style={{ color: "rgba(246,70,93,0.8)" }}>{sellQ.fee.toFixed(4)} SOL → {shortAddr(PLATFORM_FEE_WALLET)}</span>
              </div>
            </>
          )}
        </div>

        {error && <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", borderRadius: 8, color: "#f6465d", fontSize: 13 }}>{error}</div>}
        {status && <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(56,224,248,0.08)", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 8, color: "#38e0f8", fontSize: 12 }}>{status}</div>}

        <button onClick={handleTrade} disabled={loading || !walletAddress} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", fontWeight: 800, fontSize: 15, cursor: (loading || !walletAddress) ? "not-allowed" : "pointer", background: loading ? "rgba(56,224,248,0.15)" : side === "buy" ? "linear-gradient(135deg,#0ecb81,#38e0f8)" : "linear-gradient(135deg,#f6465d,#ff8c00)", color: "#0b0e11", opacity: loading ? 0.7 : 1 }}>
          {loading ? status || "Processing…" : !walletAddress ? "Connect Wallet to Trade" : side === "buy" ? "Buy Tokens" : "Sell Tokens"}
        </button>

      </div>
    </div>
  );
}

// ─── WalletPickerModal ──────────────────────────────────────────────────────
// Installed wallets connect directly (injected provider).
// On mobile, Phantom uses its Universal Link protocol — user approves in the
// Phantom app and Phantom redirects back to THIS browser (no wallet-browser
// redirect). Other non-installed wallets show a QR code.
function WalletPickerModal({ onClose, onSelect, onPhantomMobileConnect }: {
  onClose: () => void;
  onSelect: (id: string) => void;
  onPhantomMobileConnect?: () => void;
}) {
  const mobile = isMobile();
  const wallets: DetectedWallet[] = detectWallets();
  const anyInstalled = wallets.some(w => w.provider);
  const [showQR, setShowQR] = useState(false);
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f1117", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#eaecef" }}>{showQR ? "Scan to connect" : "Connect a wallet"}</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(180,190,210,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {showQR ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ background: "#fff", padding: 14, borderRadius: 14 }}>
              <QRCode value={pageUrl} size={200} level="M" fgColor="#0b0e11" bgColor="#ffffff" />
            </div>
            <div style={{ fontSize: 12, color: "rgba(180,190,210,0.7)", textAlign: "center", lineHeight: 1.6 }}>
              <b style={{ color: "#eaecef" }}>Open your wallet app</b> → scan this QR code.<br />
              Supported: Solflare, Trust Wallet, Backpack, Coinbase Wallet.
            </div>
            <button onClick={() => setShowQR(false)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(56,224,248,0.25)", background: "rgba(56,224,248,0.06)", color: "#eaecef", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ← Back to wallets
            </button>
          </div>
        ) : (
          <>
            {!anyInstalled && (
              <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(56,224,248,0.06)", border: "1px solid rgba(56,224,248,0.18)", borderRadius: 8, color: "rgba(180,190,210,0.7)", fontSize: 12 }}>
                {mobile
                  ? <>Tap <b style={{ color: "#38e0f8" }}>Phantom</b> to connect securely — you'll stay in this browser.</>
                  : <>No Solana wallet detected. Install a browser extension, or tap <b style={{ color: "#38e0f8" }}>Scan QR</b>.</>}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {wallets.map(w => {
                const installed = !!w.provider;
                // On mobile, Phantom uses Universal Link (redirect back to this browser).
                // Other wallets use QR.
                const isPhantomMobile = mobile && !installed && w.id === "phantom";
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      if (installed) { onSelect(w.id); return; }
                      if (isPhantomMobile && onPhantomMobileConnect) {
                        onClose();
                        onPhantomMobileConnect();
                        return;
                      }
                      setShowQR(true);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: installed ? "rgba(56,224,248,0.06)" : isPhantomMobile ? "rgba(56,224,248,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${installed ? "rgba(56,224,248,0.25)" : isPhantomMobile ? "rgba(56,224,248,0.2)" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#eaecef" }}
                  >
                    <span style={{ fontSize: 22 }}>{w.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                      {isPhantomMobile && <div style={{ fontSize: 10, color: "rgba(56,224,248,0.6)", marginTop: 1 }}>Opens Phantom app → returns to this browser</div>}
                    </div>
                    <span style={{ fontSize: 11, color: installed ? "#0ecb81" : isPhantomMobile ? "#38e0f8" : "rgba(180,190,210,0.45)" }}>
                      {installed ? "Detected" : isPhantomMobile ? "Universal Link" : "Scan QR"}
                    </span>
                  </button>
                );
              })}

              {/* QR code option for non-Phantom mobile wallets */}
              {mobile && (
                <button
                  onClick={() => setShowQR(true)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#eaecef" }}
                >
                  <span style={{ fontSize: 22 }}>📷</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Other wallet</div>
                    <div style={{ fontSize: 10, color: "rgba(180,190,210,0.45)", marginTop: 1 }}>Solflare, Trust, Backpack…</div>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(180,190,210,0.45)" }}>Scan QR</span>
                </button>
              )}
              {!mobile && (
                <button
                  onClick={() => setShowQR(true)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#eaecef" }}
                >
                  <span style={{ fontSize: 22 }}>📱</span>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Mobile wallet</span>
                  <span style={{ fontSize: 11, color: "rgba(180,190,210,0.45)" }}>Scan QR</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreateTokenPage() {
  // Wallet state
  const [walletAddress, setWalletAddress]   = useState("");
  const [walletBalance, setWalletBalance]   = useState(0);
  const [walletLoading, setWalletLoading]   = useState(false);
  const [walletName, setWalletName]         = useState("");
  const [walletCanSign, setWalletCanSign]   = useState(false);
  const [addrCopied, setAddrCopied]         = useState(false);

  // Solana wallet picker — the launchpad connects directly so we can deep-link
  // straight into the user's wallet app on mobile (e.g. open Phantom and sign).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Tab & token list
  const [tab, setTab]                     = useState<"create" | "trade">("create");
  const [tokens, setTokens]               = useState<TokenData[]>(loadTokens);
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [search, setSearch]               = useState("");
  const [listLoading, setListLoading]     = useState(false);
  const [listError, setListError]         = useState("");
  const refreshSeq = useRef(0);

  // Form fields
  const [name, setName]               = useState("");
  const [symbol, setSymbol]           = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite]         = useState("");
  const [telegram, setTelegram]       = useState("");
  const [twitter, setTwitter]         = useState("");
  const [showMore, setShowMore]       = useState(false);
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  // Initial buy
  const [initialBuy, setInitialBuy]     = useState(false);
  const [buyAmount, setBuyAmount]       = useState("0.5");

  // Advanced options
  const [advOpen, setAdvOpen]           = useState(false);
  const [advOpts, setAdvOpts]           = useState<Record<string, boolean>>({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false });

  // Create state
  const [creating, setCreating]         = useState(false);
  const [uploadPct, setUploadPct]       = useState(0);
  const [createStatus, setCreateStatus] = useState("");
  const [createError, setCreateError]   = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createMint, setCreateMint]       = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const launchBtnRef = useRef<HTMLButtonElement>(null);
  const [justConnected, setJustConnected] = useState(false);

  // True when the user connected via Phantom Universal Link (no injected provider).
  const [connectedViaDeeplink, setConnectedViaDeeplink] = useState(false);

  // True while we're waiting for Phantom to return the connection in the same
  // browser (via the localStorage broadcast). When window.open() kept this tab
  // alive, we show a "Waiting…" banner and subscribe to the storage event.
  const [phantomWaiting, setPhantomWaiting] = useState(false);
  const phantomBroadcastUnsubRef = useRef<(() => void) | null>(null);

  // Fee totals
  const advFee       = Object.entries(advOpts).filter(([,v])=>v).reduce((s,[k])=>s+ADVANCED_FEES[k].fee, 0);
  const advLamports  = Object.entries(advOpts).filter(([,v])=>v).reduce((s,[k])=>s+ADVANCED_FEES[k].lamports, 0);
  const initBuyAmt   = initialBuy ? parseFloat(buyAmount)||0 : 0;
  const initBuyFee   = initBuyAmt * INITIAL_BUY_FEE_BPS / 10000;
  const totalSol     = advFee + initBuyAmt;

  // Always open the picker so the user explicitly chooses their wallet. We never
  // auto-connect a single detected wallet: in Brave that meant the bare
  // `window.solana` (Brave Wallet) got connected automatically without the user
  // ever asking for it. The user picks from the list every time.
  const handleConnectWallet = () => {
    setCreateError("");
    setPickerOpen(true);
  };

  // Copy the connected wallet address to the clipboard, with brief "✓" feedback.
  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setAddrCopied(true);
      setTimeout(() => setAddrCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  // Connect to the chosen wallet. An injected provider can always sign here.
  const handleSelectWallet = async (id: string) => {
    setPickerOpen(false);
    setWalletLoading(true);
    setCreateError("");
    try {
      const addr = await connectWalletById(id);
      const meta = detectWallets().find(w => w.id === id);
      setWalletAddress(addr);
      setWalletName(meta?.name ?? "");
      setWalletCanSign(true);
      getWalletBalance(addr).then(setWalletBalance);
      // Scroll to launch button and pulse it so user knows they can sign immediately.
      setJustConnected(true);
      setTimeout(() => {
        launchBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        launchBtnRef.current?.focus();
      }, 150);
      setTimeout(() => setJustConnected(false), 2500);
    } catch (e: any) {
      setCreateError(e?.message || "Failed to connect wallet");
    } finally { setWalletLoading(false); }
  };

  // ── Phantom Universal Link return handler ────────────────────────────────
  // When the user connects or signs via Phantom's Universal Link (deeplink), the
  // Phantom app redirects them back to THIS browser page with result params in the
  // URL. This effect parses those params once on mount and either:
  //   • Connect return: sets wallet state (user stays in original browser ✓)
  //   • Sign return:    confirms the transaction and saves the token (user stays ✓)
  const phantomReturnRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || phantomReturnRef.current) return;
    const params = new URLSearchParams(window.location.search);

    // ── Phase A: connect return ──────────────────────────────────────────────
    if (params.has("phantom_encryption_public_key")) {
      phantomReturnRef.current = true;
      const pubkey = parsePhantomConnectReturn();
      stripPhantomParams();
      if (!pubkey) { setCreateError("Phantom connect was rejected or failed."); return; }

      setWalletAddress(pubkey);
      setWalletName("Phantom");
      setWalletCanSign(true);
      setConnectedViaDeeplink(true);
      setActiveWallet("phantom", null); // mark phantom as active (no injected provider)
      getWalletBalance(pubkey).then(setWalletBalance);

      // Restore any form state saved before the connect redirect.
      try {
        const s = JSON.parse(sessionStorage.getItem("frost_phantom_form") || "{}");
        if (s.name)        setName(s.name);
        if (s.symbol)      setSymbol(s.symbol);
        if (s.description) setDescription(s.description);
        if (s.website)     setWebsite(s.website);
        if (s.telegram)    setTelegram(s.telegram);
        if (s.twitter)     setTwitter(s.twitter);
        if (s.imagePreview) setImagePreview(s.imagePreview);
        sessionStorage.removeItem("frost_phantom_form");
      } catch { /* non-fatal */ }

      // Broadcast to any sibling tab that is waiting with window.open() still
      // alive — this fires the subscribePhantomBroadcast storage event handler
      // so the original browser tab picks up the wallet address instantly.
      broadcastPhantomConnectResult();

      setJustConnected(true);
      setTimeout(() => {
        launchBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      setTimeout(() => setJustConnected(false), 3000);
      return;
    }

    // ── Phase B: sign return ─────────────────────────────────────────────────
    if (params.has("data") && params.has("nonce")) {
      const pendingRaw = sessionStorage.getItem("frost_phantom_pending");
      if (!pendingRaw) return; // not our sign return
      phantomReturnRef.current = true;

      const signature = parsePhantomSignReturn();
      stripPhantomParams();
      sessionStorage.removeItem("frost_phantom_pending");

      let pending: any;
      try { pending = JSON.parse(pendingRaw); } catch {
        setCreateError("Sign return state was corrupted. Please try again.");
        return;
      }

      // Restore wallet + form state
      if (pending.walletAddress) {
        setWalletAddress(pending.walletAddress);
        setWalletName("Phantom");
        setWalletCanSign(true);
        setConnectedViaDeeplink(true);
        setActiveWallet("phantom", null);
        getWalletBalance(pending.walletAddress).then(setWalletBalance);
      }
      setName(pending.name || "");
      setSymbol(pending.symbol || "");
      setDescription(pending.description || "");
      setWebsite(pending.website || "");
      setTelegram(pending.telegram || "");
      setTwitter(pending.twitter || "");
      if (pending.imageData) setImagePreview(pending.imageData);

      if (!signature) {
        setCreateError("Phantom rejected the signing request. Please try again.");
        return;
      }

      // Complete token creation / handle initial buy redirect
      (async () => {
        setCreating(true);
        setCreateStatus("Confirming transaction…");
        try {
          const conn = getConnection();
          await conn.confirmTransaction(signature, "confirmed");

          if (pending.phase === "create" && pending.needsInitialBuy && pending.initBuyAmt > 0) {
            // Build initial-buy tx and redirect to Phantom for a second signature.
            const ibBytes = await buildInitialBuyTransaction(
              pending.mintAddress, pending.walletAddress, pending.initBuyAmt, setCreateStatus,
            );
            const ibPending = { ...pending, phase: "initialBuy", createSig: signature };
            sessionStorage.setItem("frost_phantom_pending", JSON.stringify(ibPending));
            setCreateStatus("Opening Phantom for initial buy…");
            phantomSignAndSend(ibBytes, window.location.href);
            return; // navigates away
          }

          // All done — build and save the token record.
          const createSig = pending.phase === "initialBuy" ? pending.createSig : signature;
          const buySig    = pending.phase === "initialBuy" ? signature : null;

          let vSol = VIRTUAL_SOL, vTokens = VIRTUAL_TOKENS;
          const history: Trade[] = [];
          if (buySig) {
            const q = getBuyQuote(VIRTUAL_SOL, VIRTUAL_TOKENS, pending.initBuyAmt, INITIAL_BUY_FEE_BPS);
            vSol    += pending.initBuyAmt - q.fee;
            vTokens -= q.tokensOut;
            history.push({ type: "buy", solAmount: pending.initBuyAmt, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: shortAddr(pending.walletAddress) });
          }

          // Try to read live on-chain state.
          const chainState = await fetchCurveState(pending.mintAddress).catch(() => null);
          if (chainState) { vSol = chainState.virtualSol; vTokens = chainState.virtualTokens; }

          const token: TokenData = {
            id: crypto.randomUUID(), mint: pending.mintAddress,
            name: pending.name, symbol: pending.symbol,
            description: pending.description, image: pending.imageData,
            metadataUri: pending.metadataUri,
            creator: shortAddr(pending.walletAddress), creatorAddress: pending.walletAddress,
            createdAt: pending.createdAt,
            website: pending.website, telegram: pending.telegram, twitter: pending.twitter,
            virtualSol: vSol, virtualTokens: vTokens,
            graduated: vSol >= GRADUATION_TARGET,
            advancedOptions: pending.advancedOptions || [],
            tradeHistory: history, marketCap: getMcap(vSol, vTokens),
            txSignature: buySig || createSig || undefined,
          };

          const updated = [token, ...loadTokens()];
          saveTokens(updated);
          setTokens(updated);
          refreshTokenList();
          getWalletBalance(pending.walletAddress).then(setWalletBalance);
          setCreateSuccess(`🎉 ${token.name} ($${token.symbol}) launched!`);
          setCreateMint(token.mint);
          setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTelegram(""); setTwitter("");
          setImageFile(null); setImagePreview("");
          setAdvOpts({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false });
          setInitialBuy(false);
          setTimeout(() => { setTab("trade"); setCreateSuccess(""); setCreateMint(""); }, 4000);
        } catch (e: any) {
          console.error("Phantom sign return error:", e);
          setCreateError(friendlyTxError(e));
        } finally {
          setCreating(false);
          setCreateStatus("");
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up the broadcast subscription when the component unmounts (e.g. the
  // user navigates away while the Phantom waiting overlay is showing).
  useEffect(() => () => {
    phantomBroadcastUnsubRef.current?.();
  }, []);

  // ── Cancel the Phantom waiting state (user tapped "Cancel") ─────────────
  const handleCancelPhantomWait = () => {
    phantomBroadcastUnsubRef.current?.();
    phantomBroadcastUnsubRef.current = null;
    setPhantomWaiting(false);
    setCreateStatus("");
  };

  // ── Phantom Universal Link connect (from mobile picker) ──────────────────
  const handlePhantomMobileConnect = () => {
    // Save current form state so we can restore it after Phantom redirects back.
    try {
      sessionStorage.setItem("frost_phantom_form", JSON.stringify({
        name, symbol, description, website, telegram, twitter,
        imagePreview: imagePreview.startsWith("data:") ? imagePreview : "",
      }));
    } catch { /* quota exceeded — non-fatal */ }

    setCreateStatus("Opening Phantom…");

    // phantomConnect() tries window.open() first so THIS tab stays alive in
    // Brave (or whichever browser the user is on). iOS intercepts the
    // phantom.app URL as a Universal Link and opens the Phantom app; the blank
    // new tab closes itself. If window.open() is blocked the current tab
    // navigates away (old behaviour).
    const popup = phantomConnect(window.location.href);

    if (popup !== null) {
      // window.open() succeeded — this tab is still alive. Subscribe to the
      // localStorage broadcast so we pick up the result the moment Phantom
      // opens the redirect_link in another tab of the SAME browser.
      setPhantomWaiting(true);
      const unsub = subscribePhantomBroadcast((addr) => {
        unsub();
        phantomBroadcastUnsubRef.current = null;
        setPhantomWaiting(false);
        setCreateStatus("");

        setWalletAddress(addr);
        setWalletName("Phantom");
        setWalletCanSign(true);
        setConnectedViaDeeplink(true);
        setActiveWallet("phantom", null);
        getWalletBalance(addr).then(setWalletBalance);
        setJustConnected(true);
        setTimeout(() => {
          launchBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);
        setTimeout(() => setJustConnected(false), 3000);
      });
      phantomBroadcastUnsubRef.current = unsub;
    }
    // If popup === null the tab was navigated away — no waiting state needed.
  };

  // Auto-connect after a mobile deep link. When the user picks a wallet on
  // mobile we open this page inside that wallet's in-app browser with a
  // `frostConnect=<id>` marker (see openInWalletApp). On arrival we wait for the
  // wallet to inject its provider, then fire the connect prompt for that exact
  // wallet — so the user lands already prompted to connect & sign instead of a
  // dead "Connect" button. We strip the marker so a manual refresh won't
  // reconnect, and we only ever connect the specific wallet the user chose.
  //
  // The ref guard makes this run exactly once. Without it, React 18 StrictMode's
  // dev double-invoke (setup→cleanup→setup) would strip the marker on the first
  // pass and the second pass would find nothing — suppressing the prompt. We
  // also intentionally do NOT cancel the in-flight connect on cleanup, so the
  // StrictMode teardown can't abort the one real attempt.
  const autoConnectRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || autoConnectRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("frostConnect");
    if (!id) return;
    autoConnectRef.current = true;
    params.delete("frostConnect");
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(null, "", clean);

    (async () => {
      setWalletLoading(true);
      setCreateError("");
      // Phantom's in-app browser can take several seconds to inject its provider
      // after the deep link opens, so wait longer than the default.
      const provider = await waitForProvider(id, 15000);
      if (!provider) {
        setWalletLoading(false);
        setPickerOpen(true);
        setCreateError("Couldn't detect your wallet yet. Tap your wallet below to finish connecting.");
        return;
      }
      // Try to auto-connect, but mobile in-app browsers frequently require the
      // connect prompt to be triggered by a real tap. If the silent attempt
      // doesn't resolve quickly, open the picker so the user can tap their
      // (now "Detected") wallet — that tap is the user gesture the wallet needs.
      let settled = false;
      const fallback = setTimeout(() => {
        if (!settled) {
          setWalletLoading(false);
          setPickerOpen(true);
          setCreateError("Tap your wallet below to finish connecting.");
        }
      }, 5000);
      try {
        await handleSelectWallet(id);
        settled = true;
      } catch {
        settled = true;
        setWalletLoading(false);
        setPickerOpen(true);
      } finally {
        clearTimeout(fallback);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteToken = (t: TokenData) => {
    if (!window.confirm(`Remove ${t.name} ($${t.symbol}) from the list?\n\nThis only removes it from this device — it does not affect any on-chain token.`)) return;
    // Drop from localStorage if present, and from the currently shown list —
    // without reloading from localStorage, so registry-only tokens still show.
    saveTokens(loadTokens().filter(x => x.id !== t.id));
    setTokens(prev => prev.filter(x => x.id !== t.id));
    if (selectedToken?.id === t.id) setSelectedToken(null);
  };

  // Build the shared, platform-wide token list: merge tokens stored locally
  // (rich — image, socials, this device's trade history) with the global
  // registry on Pinata (every token launched by anyone), and overlay live
  // reserves read straight from the on-chain bonding curve. This is what lets
  // every visitor see every token, not just the ones they created.
  const refreshTokenList = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setListLoading(true);
    setListError("");
    try {
      const byMint = new Map<string, TokenData>();
      for (const t of loadTokens()) byMint.set(t.mint, t);

      const remote = await listFrostdexTokens();
      await Promise.allSettled(
        remote.map(async (r) => {
          // Live reserves from chain (falls back to defaults if unreadable).
          let vSol = VIRTUAL_SOL, vTokens = VIRTUAL_TOKENS, graduated = false;
          const state = await fetchCurveState(r.mint).catch(() => null);
          if (state) {
            vSol = state.virtualSol; vTokens = state.virtualTokens;
            graduated = state.complete || vSol >= GRADUATION_TARGET;
          }

          const existing = byMint.get(r.mint);
          if (existing) {
            existing.virtualSol = vSol;
            existing.virtualTokens = vTokens;
            existing.graduated = existing.graduated || graduated;
            existing.marketCap = getMcap(vSol, vTokens);
            return;
          }

          // Registry-only token (created by someone else / another device):
          // pull its metadata JSON for image, description and socials.
          const json = await fetchTokenJSON(r.cid).catch(() => null);
          const ext = json?.extensions ?? {};
          byMint.set(r.mint, {
            id: r.mint, mint: r.mint,
            name: r.name || json?.name || "Token",
            symbol: r.symbol || json?.symbol || "",
            description: json?.description || "",
            image: json?.image || "",
            metadataUri: ipfsGateway(r.cid),
            creator: shortAddr(r.creator), creatorAddress: r.creator,
            createdAt: r.createdAt || 0,
            website: ext.website || json?.external_url || "",
            telegram: ext.telegram || "", twitter: ext.twitter || "",
            virtualSol: vSol, virtualTokens: vTokens, graduated,
            advancedOptions: [], tradeHistory: [], marketCap: getMcap(vSol, vTokens),
          });
        }),
      );

      // Ignore stale responses: a newer refresh has already run.
      if (seq !== refreshSeq.current) return;
      const merged = [...byMint.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTokens(merged);
    } catch (e: any) {
      if (seq !== refreshSeq.current) return;
      console.error("Token list refresh failed:", e);
      setListError(
        isPinataConfigured()
          ? "Couldn't reach the token registry. Showing tokens stored on this device."
          : "Global registry not configured — showing tokens from this device only.",
      );
    } finally {
      if (seq === refreshSeq.current) setListLoading(false);
    }
  }, []);

  // Load the shared list on mount and whenever the user opens the Trade tab.
  useEffect(() => { refreshTokenList(); }, [refreshTokenList]);
  useEffect(() => { if (tab === "trade") refreshTokenList(); }, [tab, refreshTokenList]);

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    const r = new FileReader();
    r.onload = () => setImagePreview(r.result as string);
    r.readAsDataURL(file);
  }, []);

  const handleCreate = async () => {
    setCreateError(""); setCreateSuccess(""); setCreateStatus(""); setUploadPct(0);
    if (!name.trim())   return setCreateError("Token name is required.");
    if (!symbol.trim()) return setCreateError("Token ticker is required.");
    if (!imageFile && !imagePreview) return setCreateError("Token image is required.");
    if (!walletAddress) {
      handleConnectWallet();
      return setCreateError("Please connect your wallet first.");
    }
    if (!walletCanSign) {
      return setCreateError("This wallet can't sign on the launchpad in this browser. Open the site inside your wallet app, or connect a browser-extension wallet (Phantom, Solflare, Backpack).");
    }

    setCreating(true);
    try {
      const useChain = isProgramConfigured();

      // 1. Upload image to IPFS
      setCreateStatus(isPinataConfigured() ? "Uploading image to IPFS…" : "Processing image…");
      let imageData = imagePreview;
      if (imageFile) {
        imageData = await uploadImageToIPFS(imageFile, (pct) => setUploadPct(pct));
      }

      let metadataUri = "";
      let mint = "";
      let initBuyTxSig = "";
      let vSol = VIRTUAL_SOL, vTokens = VIRTUAL_TOKENS;
      const history: Trade[] = [];
      const createdAt = Date.now();

      // On the real path we pre-generate the mint so its address can be pinned
      // into the metadata JSON registry *and* referenced by the on-chain
      // Metaplex metadata account (which carries the name + logo for wallets).
      const chainMint = useChain ? newMint() : null;
      mint = chainMint
        ? chainMint.address
        : `${walletAddress.slice(0,6)}${Math.random().toString(36).slice(2,8).toUpperCase()}`;

      // Pin metadata to IPFS with a registry tag (incl. the mint) so every
      // visitor can discover this token — not just this browser. Done before the
      // create tx so the on-chain metadata account can point at this URI. Non-fatal.
      if (isPinataConfigured()) {
        setCreateStatus("Saving token to the public registry…");
        try {
          metadataUri = await uploadJSONToIPFS(
            {
              name: name.trim(), symbol: symbol.trim().toUpperCase(),
              description: description.trim(), image: imageData,
              external_url: website.trim(),
              extensions: { website: website.trim(), twitter: twitter.trim(), telegram: telegram.trim() },
              attributes: [],
            },
            {
              frostdexToken: "1", mint, creator: walletAddress, createdAt,
              name: name.trim(), symbol: symbol.trim().toUpperCase(),
            },
          );
        } catch { /* non-fatal */ }
      }

      if (useChain && hasPhantomDeeplinkSession()) {
        // ── Phantom Universal Link path (mobile — no injected provider) ──────
        // Build the transaction and let Phantom sign+send via deeplink.
        // The page will navigate away; the sign-return handler above completes.
        const { txBytes, mintAddress } = await buildCreateTokenTransaction(
          {
            walletAddress,
            mintKeypair: chainMint!.keypair,
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            metadataUri,
            revokeMint: advOpts.revoke_mint,
            revokeFreeze: advOpts.revoke_freeze,
            immutableMetadata: advOpts.immutable_metadata,
          },
          setCreateStatus,
        );
        mint = mintAddress;
        const pendingState = {
          phase: "create",
          walletAddress,
          name: name.trim(), symbol: symbol.trim().toUpperCase(),
          description: description.trim(), website: website.trim(),
          telegram: telegram.trim(), twitter: twitter.trim(),
          imageData, metadataUri, mintAddress,
          createdAt, advancedOptions: Object.entries(advOpts).filter(([,v])=>v).map(([k])=>k),
          needsInitialBuy: initialBuy && initBuyAmt > 0, initBuyAmt,
        };
        sessionStorage.setItem("frost_phantom_pending", JSON.stringify(pendingState));
        const ok = phantomSignAndSend(txBytes, window.location.href);
        if (!ok) {
          sessionStorage.removeItem("frost_phantom_pending");
          throw new Error("Phantom session expired. Please reconnect your wallet.");
        }
        return; // navigates away — sign-return handler completes the flow
      } else if (useChain) {
        // ── Normal injected-provider path ─────────────────────────────────────
        const res = await createTokenOnChain(
          {
            walletAddress,
            mintKeypair: chainMint!.keypair,
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            metadataUri,
            revokeMint: advOpts.revoke_mint,
            revokeFreeze: advOpts.revoke_freeze,
            immutableMetadata: advOpts.immutable_metadata,
            initialBuySol: initialBuy ? initBuyAmt : 0,
          },
          setCreateStatus,
        );
        mint = res.mint;
        initBuyTxSig = res.initialBuySignature || res.initSignature;

        // Pull authoritative reserves back from chain.
        setCreateStatus("Reading on-chain curve state…");
        const state = await fetchCurveState(mint, walletAddress);
        if (state) {
          vSol = state.virtualSol;
          vTokens = state.virtualTokens;
          if (initialBuy && initBuyAmt > 0) {
            const q = getBuyQuote(VIRTUAL_SOL, VIRTUAL_TOKENS, initBuyAmt, INITIAL_BUY_FEE_BPS);
            history.push({ type: "buy" as const, solAmount: initBuyAmt, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: shortAddr(walletAddress) });
          }
        }
        setCreateStatus("✓ Token created on-chain");
      } else {
        // ── Simulation fallback (no program configured): only fees are real ──
        if (advLamports > 0) {
          setCreateStatus(`Sending ${advFee.toFixed(3)} SOL fee to platform…`);
          const sig = await sendFeeTransaction(walletAddress, advLamports, setCreateStatus);
          setCreateStatus(`✓ Fee confirmed (${sig.slice(0,8)}…)`);
        }
        if (initialBuy && initBuyAmt > 0) {
          const initFeeLamports = Math.round(initBuyFee * LAMPORTS_PER_SOL);
          setCreateStatus(`Sending initial buy (${initBuyAmt} SOL)…`);
          initBuyTxSig = await sendFeeTransaction(walletAddress, initFeeLamports, setCreateStatus);
          setCreateStatus("✓ Initial buy confirmed");
          const q = getBuyQuote(vSol, vTokens, initBuyAmt, INITIAL_BUY_FEE_BPS);
          vSol    += initBuyAmt - q.fee;
          vTokens -= q.tokensOut;
          history.push({ type: "buy" as const, solAmount: initBuyAmt, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: shortAddr(walletAddress) });
        }
      }

      const token: TokenData = {
        id: crypto.randomUUID(), mint,
        name: name.trim(), symbol: symbol.trim().toUpperCase(),
        description: description.trim(), image: imageData, metadataUri,
        creator: shortAddr(walletAddress), creatorAddress: walletAddress,
        createdAt, website: website.trim(),
        telegram: telegram.trim(), twitter: twitter.trim(),
        virtualSol: vSol, virtualTokens: vTokens,
        graduated: vSol >= GRADUATION_TARGET,
        advancedOptions: Object.entries(advOpts).filter(([,v])=>v).map(([k])=>k),
        tradeHistory: history, marketCap: getMcap(vSol, vTokens),
        txSignature: initBuyTxSig || undefined,
      };

      const updated = [token, ...loadTokens()];
      saveTokens(updated);
      setTokens(updated);
      // Re-sync with the shared registry so the new token shows up merged with
      // live on-chain reserves (and for everyone else on their next load).
      refreshTokenList();

      // Update balance
      getWalletBalance(walletAddress).then(setWalletBalance);

      setCreateSuccess(`🎉 ${name} ($${symbol.toUpperCase()}) launched!`);
      setCreateMint(mint);
      setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTelegram(""); setTwitter("");
      setImageFile(null); setImagePreview(""); setAdvOpts({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false }); setInitialBuy(false);

      setTimeout(() => { setTab("trade"); setCreateSuccess(""); setCreateMint(""); }, 4000);
    } catch (e: any) {
      console.error("Launch token failed:", e);
      setCreateError(friendlyTxError(e));
    } finally { setCreating(false); setCreateStatus(""); }
  };

  const filteredTokens = tokens.filter(t => !search || t.name.toLowerCase().includes(search) || t.symbol.toLowerCase().includes(search));

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, padding: "12px 14px", color: "#eaecef", fontSize: 14, outline: "none",
  };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(180,190,210,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e11", color: "#eaecef" }}>

      {/* ── Top wallet bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 12, flexWrap: "wrap" }}>
        {/* Platform fee wallet (owner — receives all fees) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(180,190,210,0.5)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>🏦</span>
          <span>Platform fees →</span>
          <span style={{ fontFamily: "monospace", color: "rgba(56,224,248,0.8)", background: "rgba(56,224,248,0.08)", borderRadius: 6, padding: "3px 8px" }}>{shortAddr(PLATFORM_FEE_WALLET)}</span>
          <span title={PROGRAM_ID_VALID ? `Program: ${PROGRAM_ID}` : (PROGRAM_ID ? "Invalid VITE_PROGRAM_ID (not a valid address)" : "On-chain program not configured (VITE_PROGRAM_ID)")} style={{ fontSize: 11, borderRadius: 6, padding: "3px 8px", background: PROGRAM_ID_VALID ? "rgba(14,203,129,0.1)" : "rgba(246,70,93,0.1)", color: PROGRAM_ID_VALID ? "#0ecb81" : "rgba(246,70,93,0.85)" }}>
            {PROGRAM_ID_VALID ? `⛓ Program ${shortAddr(PROGRAM_ID)}` : (PROGRAM_ID ? "⛓ Program invalid" : "⛓ Program not set")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {walletAddress ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ecb81" }} />
            {walletName && <span style={{ fontSize: 12, color: "rgba(180,190,210,0.5)" }}>{walletName}</span>}
            <button
              onClick={handleCopyAddress}
              title={addrCopied ? "Copied!" : "Copy address"}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: "rgba(180,190,210,0.7)", fontFamily: "monospace" }}
            >
              <span>{shortAddr(walletAddress)}</span>
              <span style={{ fontSize: 12, color: addrCopied ? "#0ecb81" : "rgba(180,190,210,0.5)" }}>{addrCopied ? "✓" : "⧉"}</span>
            </button>
            <span style={{ fontSize: 12, color: "rgba(56,224,248,0.7)", background: "rgba(56,224,248,0.08)", borderRadius: 6, padding: "3px 8px" }}>{walletBalance.toFixed(3)} SOL</span>
          </div>
        ) : (
          <button onClick={handleConnectWallet} disabled={walletLoading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: walletLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>
            {walletLoading ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 64px" }}>

        {/* Logo / Hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>❄️</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px", background: "linear-gradient(135deg,#38e0f8 0%,#0ecb81 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            FrostDex Launchpad
          </h1>
          <p style={{ color: "rgba(180,190,210,0.4)", fontSize: 14, margin: 0 }}>Launch your Solana token with a bonding curve</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4 }}>
          {(["create","trade"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: tab === t ? "linear-gradient(135deg,#38e0f8,#0ecb81)" : "transparent", color: tab === t ? "#0b0e11" : "rgba(180,190,210,0.5)", transition: "all 0.15s" }}>
              {t === "create" ? "🚀 Launch" : `💱 Trade (${tokens.length})`}
            </button>
          ))}
        </div>

        {/* ── LAUNCH FORM ── */}
        {tab === "create" && (
          <div>
            {/* Coin image (centered, circular — Pump.fun style) */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
              <div onClick={() => fileInputRef.current?.click()}
                style={{ width: 120, height: 120, borderRadius: "50%", border: `3px dashed ${imagePreview ? "#0ecb81" : "rgba(56,224,248,0.3)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "rgba(56,224,248,0.04)", transition: "all 0.2s", position: "relative" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#38e0f8")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = imagePreview ? "#0ecb81" : "rgba(56,224,248,0.3)")}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageSelect(f); }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="coin" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>🪙</div>
                    <div style={{ fontSize: 11, color: "rgba(56,224,248,0.5)" }}>Upload image</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="*/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
              {imagePreview && <button onClick={() => { setImageFile(null); setImagePreview(""); }} style={{ marginTop: 8, fontSize: 11, color: "rgba(180,190,210,0.5)", background: "none", border: "none", cursor: "pointer" }}>Remove image</button>}
            </div>

            {/* Name & Ticker */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Token Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FrostDoge" style={inp} />
              </div>
              <div>
                <label style={lbl}>Ticker</label>
                <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().slice(0,10))} placeholder="FDOGE" style={inp} />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is your token about?" rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
            </div>

            {/* More options */}
            <button onClick={() => setShowMore(v => !v)} style={{ background: "none", border: "none", color: "rgba(56,224,248,0.6)", fontSize: 13, cursor: "pointer", marginBottom: showMore ? 12 : 20, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{showMore ? "▲" : "▼"}</span> {showMore ? "Hide options" : "Show more options"}
            </button>
            {showMore && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20, padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                {[
                  { label: "Website", val: website, set: setWebsite, ph: "https://…" },
                  { label: "Twitter / X", val: twitter, set: setTwitter, ph: "https://x.com/…" },
                  { label: "Telegram", val: telegram, set: setTelegram, ph: "https://t.me/…" },
                ].map(({ label, val, set, ph }) => (
                  <div key={label}>
                    <label style={lbl}>{label}</label>
                    <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={inp} />
                  </div>
                ))}
              </div>
            )}

            {/* Initial Buy */}
            <div style={{ background: "rgba(14,203,129,0.04)", border: "1px solid rgba(14,203,129,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: initialBuy ? 12 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Initial Buy</div>
                  <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginTop: 2 }}>Be the first buyer · 20% fee → platform</div>
                </div>
                <div onClick={() => setInitialBuy(v => !v)} style={{ width: 46, height: 26, borderRadius: 13, background: initialBuy ? "#0ecb81" : "rgba(255,255,255,0.1)", cursor: "pointer", position: "relative", transition: "all 0.2s" }}>
                  <div style={{ position: "absolute", top: 3, left: initialBuy ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
              </div>
              {initialBuy && (
                <div>
                  <label style={lbl}>SOL amount</label>
                  <input type="number" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} placeholder="0.5" style={inp} />
                  {initBuyAmt > 0 && (() => {
                    const q = getBuyQuote(VIRTUAL_SOL, VIRTUAL_TOKENS, initBuyAmt, INITIAL_BUY_FEE_BPS);
                    return (
                      <div style={{ marginTop: 8, fontSize: 12, color: "rgba(180,190,210,0.5)", display: "flex", justifyContent: "space-between" }}>
                        <span>You receive: <b style={{ color: "#0ecb81" }}>{q.tokensOut.toFixed(2)} tokens</b></span>
                        <span>Fee: <b style={{ color: "rgba(246,70,93,0.8)" }}>{initBuyFee.toFixed(4)} SOL</b></span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Advanced Options */}
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setAdvOpen(v => !v)} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 16px", color: "rgba(180,190,210,0.6)", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{advOpen ? "▲" : "▼"}</span> Advanced Options {Object.values(advOpts).some(Boolean) && <span style={{ marginLeft: "auto", color: "#38e0f8", fontSize: 12 }}>+{advFee.toFixed(2)} SOL</span>}
              </button>
              {advOpen && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(ADVANCED_FEES).map(([key, info]) => (
                    <label key={key} onClick={() => setAdvOpts(p => ({ ...p, [key]: !p[key] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: advOpts[key] ? "rgba(56,224,248,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${advOpts[key] ? "rgba(56,224,248,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, cursor: "pointer" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${advOpts[key] ? "#38e0f8" : "rgba(255,255,255,0.2)"}`, background: advOpts[key] ? "#38e0f8" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                        {advOpts[key] && <span style={{ fontSize: 11, color: "#0b0e11" }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 16 }}>{info.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#eaecef" }}>{info.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(180,190,210,0.45)", marginTop: 1 }}>{info.desc}</div>
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(56,224,248,0.7)", fontWeight: 700 }}>{info.fee} SOL</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Fee Summary */}
            {totalSol > 0 && (
              <div style={{ background: "rgba(56,224,248,0.04)", border: "1px solid rgba(56,224,248,0.12)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Fee Breakdown</div>
                {advFee > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "rgba(180,190,210,0.6)" }}>Advanced options</span><b style={{ color: "#eaecef" }}>{advFee.toFixed(3)} SOL</b></div>}
                {initialBuy && initBuyAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "rgba(180,190,210,0.6)" }}>Initial buy</span><b style={{ color: "#eaecef" }}>{initBuyAmt.toFixed(3)} SOL</b></div>}
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <b style={{ color: "rgba(180,190,210,0.7)" }}>Total from wallet</b>
                  <b style={{ color: "#38e0f8" }}>{totalSol.toFixed(4)} SOL</b>
                </div>
                <div style={{ fontSize: 11, color: "rgba(180,190,210,0.35)", marginTop: 6 }}>
                  Fees → <span style={{ fontFamily: "monospace" }}>{PLATFORM_FEE_WALLET.slice(0,8)}…{PLATFORM_FEE_WALLET.slice(-6)}</span>
                </div>
              </div>
            )}

            {/* IPFS progress */}
            {creating && createStatus && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(56,224,248,0.8)", marginBottom: 5 }}>
                  <span>{createStatus}</span>
                  {uploadPct > 0 && uploadPct < 100 && <span>{uploadPct}%</span>}
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${Math.max(10, uploadPct)}%`, background: "linear-gradient(90deg,#38e0f8,#0ecb81)", borderRadius: 3, transition: "width 0.3s" }} />
                </div>
              </div>
            )}

            {/* Error / Success */}
            {createError && <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", borderRadius: 10, color: "#f6465d", fontSize: 13 }}>{createError}</div>}
            {createSuccess && (
              <div style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(14,203,129,0.1)", border: "1px solid rgba(14,203,129,0.3)", borderRadius: 12 }}>
                <div style={{ color: "#0ecb81", fontSize: 14, fontWeight: 700, marginBottom: createMint ? 10 : 0 }}>{createSuccess}</div>
                {createMint && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "6px 10px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(180,190,210,0.7)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{createMint}</span>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(createMint); }}
                        style={{ flexShrink: 0, background: "none", border: "none", color: "rgba(180,190,210,0.5)", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                        title="Copy mint address"
                      >📋</button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a
                        href={`https://solscan.io/token/${createMint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 9, background: "rgba(14,203,129,0.15)", border: "1px solid rgba(14,203,129,0.35)", color: "#0ecb81", fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                      >
                        🔍 View on Solscan
                      </a>
                      <a
                        href={`https://explorer.solana.com/address/${createMint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 9, background: "rgba(56,224,248,0.08)", border: "1px solid rgba(56,224,248,0.2)", color: "#38e0f8", fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                      >
                        🌐 Solana Explorer
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Create button */}
            {!walletAddress ? (
              <button
                ref={launchBtnRef}
                onClick={handleConnectWallet}
                disabled={walletLoading}
                style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", fontWeight: 900, fontSize: 16, cursor: walletLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11", boxShadow: "0 0 30px rgba(56,224,248,0.2)" }}
              >
                {walletLoading ? "Connecting…" : "🚀 Launch Your Token Now"}
              </button>
            ) : (
              <>
                {justConnected && (
                  <div style={{ marginBottom: 10, padding: "10px 14px", background: "rgba(14,203,129,0.1)", border: "1px solid rgba(14,203,129,0.35)", borderRadius: 10, color: "#0ecb81", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                    ✅ Wallet connected — click below to sign & launch
                  </div>
                )}
                <button
                  ref={launchBtnRef}
                  onClick={handleCreate}
                  disabled={creating}
                  style={{
                    width: "100%", padding: "16px 0", borderRadius: 14, border: justConnected ? "2px solid #0ecb81" : "none",
                    fontWeight: 900, fontSize: 16, cursor: creating ? "not-allowed" : "pointer",
                    background: creating ? "rgba(56,224,248,0.15)" : "linear-gradient(135deg,#38e0f8 0%,#0ecb81 100%)",
                    color: "#0b0e11",
                    boxShadow: justConnected ? "0 0 40px rgba(14,203,129,0.5)" : "0 0 30px rgba(56,224,248,0.2)",
                    opacity: creating ? 0.8 : 1,
                    transform: justConnected ? "scale(1.02)" : "scale(1)",
                    transition: "all 0.3s",
                  }}
                >
                  {creating ? "Launching…" : "🚀 Launch Token"}
                </button>
              </>
            )}

            <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "rgba(180,190,210,0.25)" }}>
              Launch is free · Pay only for optional features
            </div>
          </div>
        )}

        {/* ── TRADE TAB ── */}
        {tab === "trade" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <input value={search} onChange={e => setSearch(e.target.value.toLowerCase())} placeholder="Search tokens…" style={{ ...inp, flex: 1 }} />
              <button onClick={() => refreshTokenList()} disabled={listLoading} title="Refresh list from the blockchain" style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(56,224,248,0.2)", fontWeight: 700, fontSize: 13, cursor: listLoading ? "not-allowed" : "pointer", background: "rgba(56,224,248,0.06)", color: "rgba(56,224,248,0.85)", whiteSpace: "nowrap" }}>
                {listLoading ? "…" : "↻"}
              </button>
              <button onClick={() => setTab("create")} style={{ padding: "12px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11", whiteSpace: "nowrap" }}>
                + Launch
              </button>
            </div>
            {listError && (
              <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,180,80,0.25)", background: "rgba(255,180,80,0.07)", color: "rgba(255,200,120,0.9)", fontSize: 12.5 }}>
                {listError}
              </div>
            )}
            {filteredTokens.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(180,190,210,0.3)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>❄️</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{listLoading ? "Loading tokens…" : "No tokens yet"}</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>{listLoading ? "Fetching launches from the registry & blockchain." : "Be the first to launch on FrostDex!"}</div>
                {!listLoading && <button onClick={() => setTab("create")} style={{ padding: "12px 28px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>Launch First Token</button>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredTokens.map(t => <TokenCard key={t.id} token={t} onClick={() => setSelectedToken(t)} onDelete={() => handleDeleteToken(t)} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {selectedToken && (
        <TradeModal
          token={selectedToken}
          walletAddress={walletAddress}
          walletCanSign={walletCanSign}
          onClose={() => setSelectedToken(null)}
          onUpdate={updated => { setSelectedToken(updated); refreshTokenList(); }}
        />
      )}

      {/* Wallet Picker */}
      {pickerOpen && (
        <WalletPickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectWallet}
          onPhantomMobileConnect={handlePhantomMobileConnect}
        />
      )}

      {/* ── Phantom "waiting" overlay ──────────────────────────────────────
          Shown while window.open() keeps this tab alive and we're listening
          for Phantom to broadcast the approval result. Hides automatically
          once the storage event fires and we receive the wallet address.     */}
      {phantomWaiting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0f1117", border: "1px solid rgba(56,224,248,0.25)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }}>
            {/* Spinner */}
            <div style={{ width: 48, height: 48, margin: "0 auto 18px", border: "3px solid rgba(56,224,248,0.15)", borderTopColor: "#38e0f8", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: "#eaecef", marginBottom: 8 }}>
              Waiting for Phantom…
            </div>
            <div style={{ fontSize: 12, color: "rgba(180,190,210,0.65)", lineHeight: 1.6, marginBottom: 20 }}>
              Approve the connection in the <b style={{ color: "#38e0f8" }}>Phantom app</b>, then come back to this browser tab — it will connect automatically.
            </div>
            <div style={{ fontSize: 11, color: "rgba(180,190,210,0.4)", background: "rgba(56,224,248,0.04)", border: "1px solid rgba(56,224,248,0.1)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, lineHeight: 1.6 }}>
              💡 If this tab doesn't auto-connect, open the approval link that Phantom redirected to and copy the URL — then paste it in this browser's address bar.
            </div>
            <button
              onClick={handleCancelPhantomWait}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(180,190,210,0.7)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
