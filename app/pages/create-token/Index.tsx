import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "frostdex_tokens_v1";
const ADMIN_WALLET = import.meta.env.VITE_ADMIN_WALLET_ADDRESS || "AdminWalletNotSet";
const PLATFORM_FEE_BPS = 1500;
const INITIAL_BUY_FEE_BPS = 2000;
const VIRTUAL_SOL = 30;
const VIRTUAL_TOKENS = 1_000_000_000;
const GRADUATION_TARGET = 85;

const ADVANCED_FEES: Record<string, { label: string; fee: number; desc: string }> = {
  revoke_mint: { label: "Revoke Mint Authority", fee: 0.05, desc: "Prevents any new tokens from ever being minted" },
  revoke_freeze: { label: "Revoke Freeze Authority", fee: 0.03, desc: "Prevents accounts from being frozen" },
  immutable_metadata: { label: "Make Metadata Immutable", fee: 0.02, desc: "Permanently locks token name, symbol, and image" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TokenData {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  creator: string;
  createdAt: number;
  website: string;
  telegram: string;
  twitter: string;
  virtualSol: number;
  virtualTokens: number;
  graduated: boolean;
  advancedOptions: string[];
  tradeHistory: Trade[];
  marketCap: number;
}

interface Trade {
  type: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  price: number;
  ts: number;
  wallet: string;
}

// ─── Bonding curve math ───────────────────────────────────────────────────────
function getBuyQuote(virtualSol: number, virtualTokens: number, solIn: number, feeBps: number) {
  const fee = solIn * feeBps / 10000;
  const solAfterFee = solIn - fee;
  const k = virtualSol * virtualTokens;
  const newSol = virtualSol + solAfterFee;
  const newTokens = k / newSol;
  const tokensOut = virtualTokens - newTokens;
  const price = solIn / Math.max(tokensOut, 0.000001);
  return { tokensOut: Math.max(0, tokensOut), fee, price };
}

function getSellQuote(virtualSol: number, virtualTokens: number, tokensIn: number, feeBps: number) {
  const k = virtualSol * virtualTokens;
  const newTokens = virtualTokens + tokensIn;
  const newSol = k / newTokens;
  const grossSol = virtualSol - newSol;
  const fee = grossSol * feeBps / 10000;
  const solOut = grossSol - fee;
  return { solOut: Math.max(0, solOut), fee };
}

function getTokenPrice(virtualSol: number, virtualTokens: number) {
  return virtualSol / virtualTokens;
}

function getMarketCap(virtualSol: number, virtualTokens: number) {
  return getTokenPrice(virtualSol, virtualTokens) * VIRTUAL_TOKENS;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
function loadTokens(): TokenData[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveTokens(tokens: TokenData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function shortWallet(w: string) {
  if (!w || w.length < 8) return w || "—";
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

function formatAge(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Image helpers ────────────────────────────────────────────────────────────
async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function BondingBar({ virtualSol }: { virtualSol: number }) {
  const pct = Math.min(100, ((virtualSol - VIRTUAL_SOL) / (GRADUATION_TARGET - VIRTUAL_SOL)) * 100);
  const graduated = virtualSol >= GRADUATION_TARGET;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(180,190,210,0.6)", marginBottom: 4 }}>
        <span>{graduated ? "🎓 Graduated to Raydium" : `Bonding curve: ${pct.toFixed(1)}%`}</span>
        <span>{(virtualSol - VIRTUAL_SOL).toFixed(2)} / {GRADUATION_TARGET - VIRTUAL_SOL} SOL</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: graduated ? "#0ecb81" : "linear-gradient(90deg,#38e0f8,#0ecb81)", borderRadius: 9999, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ─── Token Card ───────────────────────────────────────────────────────────────
function TokenCard({ token, onTrade }: { token: TokenData; onTrade: (t: TokenData) => void }) {
  const price = getTokenPrice(token.virtualSol, token.virtualTokens);
  const mc = getMarketCap(token.virtualSol, token.virtualTokens);
  return (
    <div
      onClick={() => onTrade(token)}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(56,224,248,0.1)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(56,224,248,0.35)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(56,224,248,0.05)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.border = "1px solid rgba(56,224,248,0.1)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {token.image
          ? <img src={token.image} alt={token.name} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(56,224,248,0.15)" }} />
          : <div style={{ width: 52, height: 52, borderRadius: 10, background: "linear-gradient(135deg,#38e0f8,#0ecb81)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#0b0e11" }}>{token.symbol.slice(0, 1)}</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#eaecef" }}>{token.name}</span>
            <span style={{ fontSize: 11, color: "#38e0f8", background: "rgba(56,224,248,0.1)", borderRadius: 4, padding: "1px 6px" }}>${token.symbol}</span>
            {token.graduated && <span style={{ fontSize: 10, color: "#0ecb81", background: "rgba(14,203,129,0.1)", borderRadius: 4, padding: "1px 6px" }}>🎓 Graduated</span>}
          </div>
          <div style={{ fontSize: 12, color: "rgba(180,190,210,0.55)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{token.description || "No description"}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "rgba(180,190,210,0.7)" }}>Price: <b style={{ color: "#eaecef" }}>{price.toFixed(10)} SOL</b></span>
            <span style={{ fontSize: 12, color: "rgba(180,190,210,0.7)" }}>MCap: <b style={{ color: "#38e0f8" }}>{mc.toFixed(2)} SOL</b></span>
            <span style={{ fontSize: 12, color: "rgba(180,190,210,0.5)" }}>{formatAge(token.createdAt)}</span>
          </div>
          <BondingBar virtualSol={token.virtualSol} />
        </div>
      </div>
    </div>
  );
}

// ─── Trade Modal ──────────────────────────────────────────────────────────────
function TradeModal({ token, onClose, onUpdate }: { token: TokenData; onClose: () => void; onUpdate: (t: TokenData) => void }) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const price = getTokenPrice(token.virtualSol, token.virtualTokens);
  const mc = getMarketCap(token.virtualSol, token.virtualTokens);

  const buyQuote = tab === "buy" && amount ? getBuyQuote(token.virtualSol, token.virtualTokens, parseFloat(amount) || 0, PLATFORM_FEE_BPS) : null;
  const sellQuote = tab === "sell" && amount ? getSellQuote(token.virtualSol, token.virtualTokens, parseFloat(amount) || 0, PLATFORM_FEE_BPS) : null;

  const handleTrade = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setLoading(true);
    setTimeout(() => {
      const tokens = loadTokens();
      const idx = tokens.findIndex(t => t.id === token.id);
      if (idx === -1) { setLoading(false); return; }
      const t = { ...tokens[idx] };

      if (tab === "buy") {
        const q = getBuyQuote(t.virtualSol, t.virtualTokens, val, PLATFORM_FEE_BPS);
        t.virtualSol += val - q.fee;
        t.virtualTokens -= q.tokensOut;
        t.tradeHistory = [{ type: "buy", solAmount: val, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: shortWallet("Demo") }, ...t.tradeHistory].slice(0, 50);
        if (t.virtualSol >= GRADUATION_TARGET) t.graduated = true;
        t.marketCap = getMarketCap(t.virtualSol, t.virtualTokens);
        setResult(`✅ Bought ~${q.tokensOut.toFixed(2)} ${t.symbol} for ${val} SOL (fee: ${q.fee.toFixed(4)} SOL)`);
      } else {
        const q = getSellQuote(t.virtualSol, t.virtualTokens, val, PLATFORM_FEE_BPS);
        t.virtualSol -= (q.solOut + q.fee);
        t.virtualTokens += val;
        t.tradeHistory = [{ type: "sell", solAmount: q.solOut, tokenAmount: val, price: q.solOut / val, ts: Date.now(), wallet: shortWallet("Demo") }, ...t.tradeHistory].slice(0, 50);
        t.marketCap = getMarketCap(t.virtualSol, t.virtualTokens);
        setResult(`✅ Sold ${val} ${t.symbol} for ~${q.solOut.toFixed(4)} SOL (fee: ${q.fee.toFixed(4)} SOL)`);
      }

      tokens[idx] = t;
      saveTokens(tokens);
      onUpdate(t);
      setAmount("");
      setLoading(false);
    }, 800);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#161b26", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {token.image
              ? <img src={token.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
              : <div style={{ width: 44, height: 44, borderRadius: 8, background: "linear-gradient(135deg,#38e0f8,#0ecb81)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#0b0e11" }}>{token.symbol.slice(0,1)}</div>
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#eaecef" }}>{token.name} <span style={{ color: "#38e0f8", fontSize: 13 }}>${token.symbol}</span></div>
              <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)" }}>by {shortWallet(token.creator)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(180,190,210,0.5)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Price", value: `${price.toFixed(9)} SOL` },
            { label: "Market Cap", value: `${mc.toFixed(2)} SOL` },
            { label: "Virtual SOL", value: `${token.virtualSol.toFixed(3)} SOL` },
            { label: "Tokens Left", value: token.virtualTokens.toFixed(0) },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#eaecef" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <BondingBar virtualSol={token.virtualSol} />

        {/* Buy/Sell tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 16 }}>
          {(["buy","sell"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setAmount(""); setResult(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.15s", background: tab === t ? (t === "buy" ? "#0ecb81" : "#f6465d") : "rgba(255,255,255,0.06)", color: tab === t ? "#fff" : "rgba(180,190,210,0.6)" }}>
              {t === "buy" ? "🟢 Buy" : "🔴 Sell"}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 8, color: "rgba(180,190,210,0.6)", fontSize: 12 }}>
          {tab === "buy" ? "Amount in SOL" : `Amount in ${token.symbol}`}
        </div>
        <input
          type="number"
          value={amount}
          onChange={e => { setAmount(e.target.value); setResult(null); }}
          placeholder={tab === "buy" ? "0.1" : "1000"}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 8, padding: "12px 14px", color: "#eaecef", fontSize: 15, outline: "none" }}
        />

        {/* Quote preview */}
        {buyQuote && buyQuote.tokensOut > 0 && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(14,203,129,0.08)", border: "1px solid rgba(14,203,129,0.2)", borderRadius: 8, fontSize: 12, color: "rgba(180,190,210,0.8)" }}>
            You get: <b style={{ color: "#0ecb81" }}>{buyQuote.tokensOut.toFixed(2)} {token.symbol}</b> — Fee: <b>{buyQuote.fee.toFixed(4)} SOL</b> (15%)
          </div>
        )}
        {sellQuote && sellQuote.solOut > 0 && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(246,70,93,0.08)", border: "1px solid rgba(246,70,93,0.2)", borderRadius: 8, fontSize: 12, color: "rgba(180,190,210,0.8)" }}>
            You get: <b style={{ color: "#f6465d" }}>{sellQuote.solOut.toFixed(4)} SOL</b> — Fee: <b>{sellQuote.fee.toFixed(4)} SOL</b> (15%)
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(56,224,248,0.08)", border: "1px solid rgba(56,224,248,0.2)", borderRadius: 8, fontSize: 12, color: "#38e0f8" }}>{result}</div>
        )}

        <button
          onClick={handleTrade}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          style={{ width: "100%", marginTop: 16, padding: "14px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", background: loading ? "rgba(255,255,255,0.07)" : tab === "buy" ? "linear-gradient(135deg,#0ecb81,#38e0f8)" : "#f6465d", color: "#fff", opacity: (!amount || parseFloat(amount) <= 0) ? 0.5 : 1, transition: "opacity 0.15s" }}
        >
          {loading ? "Processing…" : tab === "buy" ? "Buy Tokens" : "Sell Tokens"}
        </button>

        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "rgba(180,190,210,0.35)" }}>
          15% platform fee goes to admin wallet · 85 SOL graduation target
        </div>

        {/* Trade History */}
        {token.tradeHistory.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(180,190,210,0.7)", marginBottom: 10 }}>Recent Trades</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {token.tradeHistory.slice(0, 8).map((tr, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                  <span style={{ color: tr.type === "buy" ? "#0ecb81" : "#f6465d", fontWeight: 600 }}>{tr.type.toUpperCase()}</span>
                  <span style={{ color: "rgba(180,190,210,0.7)" }}>{tr.tokenAmount.toFixed(2)} {token.symbol}</span>
                  <span style={{ color: "rgba(180,190,210,0.5)" }}>{tr.solAmount.toFixed(4)} SOL</span>
                  <span style={{ color: "rgba(180,190,210,0.35)" }}>{formatAge(tr.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreateTokenPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "trade">("create");
  const [tokens, setTokens] = useState<TokenData[]>(loadTokens);
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [search, setSearch] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<Record<string, boolean>>({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false });
  const [initialBuyEnabled, setInitialBuyEnabled] = useState(false);
  const [initialBuyAmount, setInitialBuyAmount] = useState("0.5");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAdvancedFee = Object.entries(advancedOptions)
    .filter(([, v]) => v)
    .reduce((s, [k]) => s + ADVANCED_FEES[k].fee, 0);

  const initialBuyFee = initialBuyEnabled ? (parseFloat(initialBuyAmount) || 0) * INITIAL_BUY_FEE_BPS / 10000 : 0;
  const totalFeeEstimate = totalAdvancedFee + initialBuyFee;

  const handleImageSelect = useCallback(async (file: File) => {
    setImageFile(file);
    const preview = await readFileAsDataURL(file);
    setImagePreview(preview);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleImageSelect(file);
  }, [handleImageSelect]);

  const handleCreate = async () => {
    setCreateError("");
    if (!name.trim()) return setCreateError("Token name is required.");
    if (!symbol.trim()) return setCreateError("Token symbol is required.");
    if (!imageFile && !imagePreview) return setCreateError("Token image is required.");

    setCreating(true);
    try {
      // Store image as base64 (IPFS upload requires backend; use base64 for now)
      const imageData = imagePreview || "";

      const mintAddress = `${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

      let virtualSol = VIRTUAL_SOL;
      let virtualTokens = VIRTUAL_TOKENS;
      const history: Trade[] = [];

      if (initialBuyEnabled) {
        const buyAmt = parseFloat(initialBuyAmount) || 0;
        if (buyAmt > 0) {
          const q = getBuyQuote(virtualSol, virtualTokens, buyAmt, INITIAL_BUY_FEE_BPS);
          virtualSol += buyAmt - q.fee;
          virtualTokens -= q.tokensOut;
          history.push({ type: "buy", solAmount: buyAmt, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: "Creator" });
        }
      }

      const token: TokenData = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        mint: mintAddress,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        image: imageData,
        creator: "You",
        createdAt: Date.now(),
        website: website.trim(),
        telegram: telegram.trim(),
        twitter: twitter.trim(),
        virtualSol,
        virtualTokens,
        graduated: virtualSol >= GRADUATION_TARGET,
        advancedOptions: Object.entries(advancedOptions).filter(([, v]) => v).map(([k]) => k),
        tradeHistory: history,
        marketCap: getMarketCap(virtualSol, virtualTokens),
      };

      const updated = [token, ...loadTokens()];
      saveTokens(updated);
      setTokens(updated);

      setCreateSuccess(`🎉 ${name} ($${symbol.toUpperCase()}) created! Mint: ${mintAddress}`);
      setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTelegram(""); setTwitter("");
      setImageFile(null); setImagePreview("");
      setAdvancedOptions({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false });
      setInitialBuyEnabled(false);

      setTimeout(() => { setTab("trade"); setCreateSuccess(""); }, 2000);
    } catch (e: any) {
      setCreateError(e.message || "Failed to create token.");
    } finally {
      setCreating(false);
    }
  };

  const filteredTokens = tokens.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(56,224,248,0.15)", borderRadius: 8, padding: "11px 14px",
    color: "#eaecef", fontSize: 14, outline: "none",
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, color: "rgba(180,190,210,0.6)", marginBottom: 6, display: "block" };

  return (
    <div style={{ minHeight: "100vh", background: "rgb(11,14,17)", maxWidth: 900, margin: "0 auto", paddingBottom: 48 }}>

      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "0 0 20px 20px", marginBottom: 24, minHeight: 160, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(56,224,248,0.06) 0%, rgba(14,203,129,0.04) 50%, rgba(11,14,17,0) 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent 0%, rgba(56,224,248,0.5) 50%, transparent 100%)" }} />
        <div style={{ position: "relative", zIndex: 1, padding: "28px 24px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 30 }}>🪙</span>
            <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: "Manrope, sans-serif", background: "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: 0 }}>
              Create Your Token
            </h1>
          </div>
          <p style={{ color: "rgba(180,190,210,0.55)", fontSize: 13, margin: 0 }}>
            Launch your own Solana token with a bonding curve — like Pump.fun, powered by FrostDex ❄
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px", marginBottom: 24 }}>
        {(["create","trade"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: tab === t ? "linear-gradient(135deg,#38e0f8,#0ecb81)" : "rgba(255,255,255,0.05)", color: tab === t ? "#0b0e11" : "rgba(180,190,210,0.6)", transition: "all 0.15s" }}>
            {t === "create" ? "🚀 Create Token" : `💱 Trade (${tokens.length})`}
          </button>
        ))}
      </div>

      {/* ── CREATE TAB ── */}
      {tab === "create" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(56,224,248,0.1)", borderRadius: 16, padding: "24px 24px 28px" }}>

            {/* Image Upload */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Token Image <span style={{ color: "#f6465d" }}>*</span></label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                style={{ border: `2px dashed ${imagePreview ? "rgba(14,203,129,0.4)" : "rgba(56,224,248,0.2)"}`, borderRadius: 10, padding: 24, textAlign: "center", cursor: "pointer", transition: "all 0.15s", background: imagePreview ? "rgba(14,203,129,0.04)" : "rgba(56,224,248,0.02)" }}
              >
                {imagePreview ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <img src={imagePreview} alt="preview" style={{ width: 80, height: 80, borderRadius: 12, objectFit: "cover", border: "2px solid rgba(14,203,129,0.3)" }} />
                    <span style={{ fontSize: 12, color: "#0ecb81" }}>✓ Image ready · Click to change</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
                    <div style={{ fontSize: 13, color: "rgba(180,190,210,0.5)" }}>Drag & drop or click to upload</div>
                    <div style={{ fontSize: 11, color: "rgba(180,190,210,0.3)", marginTop: 4 }}>PNG, JPG, GIF, WEBP · Max 5MB</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
            </div>

            {/* Name & Symbol */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Token Name <span style={{ color: "#f6465d" }}>*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FrostDoge" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Symbol <span style={{ color: "#f6465d" }}>*</span></label>
                <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().slice(0, 10))} placeholder="e.g. FDOGE" style={inputStyle} />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your token…" rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* Social Links */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Website", value: website, setter: setWebsite, placeholder: "https://…" },
                { label: "Telegram", value: telegram, setter: setTelegram, placeholder: "https://t.me/…" },
                { label: "Twitter / X", value: twitter, setter: setTwitter, placeholder: "https://x.com/…" },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label style={labelStyle}>{label}</label>
                  <input value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Initial Buy Toggle */}
            <div style={{ background: "rgba(56,224,248,0.04)", border: "1px solid rgba(56,224,248,0.12)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#eaecef" }}>Initial Buy</div>
                  <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginTop: 2 }}>Be the first buyer — 20% fee applies</div>
                </div>
                <button onClick={() => setInitialBuyEnabled(v => !v)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: initialBuyEnabled ? "#38e0f8" : "rgba(255,255,255,0.1)", transition: "all 0.2s", position: "relative" }}>
                  <div style={{ position: "absolute", top: 2, left: initialBuyEnabled ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </button>
              </div>
              {initialBuyEnabled && (
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Buy amount (SOL)</label>
                  <input type="number" value={initialBuyAmount} onChange={e => setInitialBuyAmount(e.target.value)} placeholder="0.5" style={inputStyle} />
                  {parseFloat(initialBuyAmount) > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "rgba(180,190,210,0.6)" }}>
                      Fee: <b style={{ color: "#f0b90b" }}>{initialBuyFee.toFixed(4)} SOL</b> (20%) → Admin wallet
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Advanced Options */}
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setAdvancedOpen(v => !v)} style={{ background: "none", border: "1px solid rgba(56,224,248,0.15)", borderRadius: 8, padding: "8px 16px", color: "rgba(180,190,210,0.7)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{advancedOpen ? "▲" : "▼"}</span> Advanced Options
                {totalAdvancedFee > 0 && <span style={{ marginLeft: 6, color: "#f0b90b", fontSize: 11 }}>({totalAdvancedFee.toFixed(2)} SOL)</span>}
              </button>
              {advancedOpen && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(ADVANCED_FEES).map(([key, info]) => (
                    <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: `1px solid ${advancedOptions[key] ? "rgba(56,224,248,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={advancedOptions[key]} onChange={e => setAdvancedOptions(prev => ({ ...prev, [key]: e.target.checked }))} style={{ marginTop: 2, accentColor: "#38e0f8" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#eaecef" }}>{info.label}</span>
                          <span style={{ fontSize: 11, color: "#f0b90b", background: "rgba(240,185,11,0.1)", borderRadius: 4, padding: "1px 6px" }}>{info.fee} SOL</span>
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginTop: 2 }}>{info.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Fee summary */}
            {totalFeeEstimate > 0 && (
              <div style={{ background: "rgba(240,185,11,0.06)", border: "1px solid rgba(240,185,11,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: "#f0b90b", marginBottom: 6 }}>💰 Fee Summary</div>
                {totalAdvancedFee > 0 && <div style={{ color: "rgba(180,190,210,0.7)" }}>Advanced options: <b style={{ color: "#eaecef" }}>{totalAdvancedFee.toFixed(2)} SOL</b></div>}
                {initialBuyFee > 0 && <div style={{ color: "rgba(180,190,210,0.7)" }}>Initial buy fee (20%): <b style={{ color: "#eaecef" }}>{initialBuyFee.toFixed(4)} SOL</b></div>}
                <div style={{ marginTop: 6, color: "rgba(180,190,210,0.5)", fontSize: 11 }}>→ All fees go to: {shortWallet(ADMIN_WALLET)}</div>
              </div>
            )}

            {/* Errors / Success */}
            {createError && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", borderRadius: 8, color: "#f6465d", fontSize: 13 }}>{createError}</div>}
            {createSuccess && <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(14,203,129,0.1)", border: "1px solid rgba(14,203,129,0.3)", borderRadius: 8, color: "#0ecb81", fontSize: 13 }}>{createSuccess}</div>}

            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 15, cursor: creating ? "not-allowed" : "pointer", background: creating ? "rgba(56,224,248,0.2)" : "linear-gradient(135deg,#38e0f8 0%,#0ecb81 100%)", color: "#0b0e11", boxShadow: "0 0 20px rgba(56,224,248,0.25)", transition: "opacity 0.15s", opacity: creating ? 0.7 : 1 }}
            >
              {creating ? "Creating Token…" : "🚀 Create Token"}
            </button>

            <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "rgba(180,190,210,0.3)" }}>
              Token creation is free · You only pay for optional features above
            </div>
          </div>

          {/* How it works */}
          <div style={{ marginTop: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 24px" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "rgba(180,190,210,0.7)", marginBottom: 14 }}>How it works</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
              {[
                { icon: "🪙", title: "Free Launch", desc: "Create your token for free — just fill in the details and deploy instantly." },
                { icon: "📈", title: "Bonding Curve", desc: "Price rises automatically as more people buy. Starts at 30 SOL virtual reserves." },
                { icon: "🎓", title: "Graduation", desc: "Once 85 SOL in reserves is reached, your token graduates to Raydium automatically." },
                { icon: "💸", title: "15% Fee", desc: "Every trade carries a 15% platform fee that goes to the admin wallet." },
              ].map(s => (
                <div key={s.title} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#eaecef", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)" }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TRADE TAB ── */}
      {tab === "trade" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tokens…"
              style={{ flex: 1, minWidth: 200, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,224,248,0.15)", borderRadius: 8, padding: "10px 14px", color: "#eaecef", fontSize: 14, outline: "none" }}
            />
            <button onClick={() => setTab("create")} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>
              + Create Token
            </button>
          </div>

          {filteredTokens.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "rgba(180,190,210,0.4)" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>🪙</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tokens yet</div>
              <div style={{ fontSize: 13 }}>Be the first to create a token on FrostDex!</div>
              <button onClick={() => setTab("create")} style={{ marginTop: 20, padding: "12px 28px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>
                Create First Token
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredTokens.map(token => (
                <TokenCard key={token.id} token={token} onTrade={t => setSelectedToken(t)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trade Modal */}
      {selectedToken && (
        <TradeModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onUpdate={updated => {
            setTokens(loadTokens());
            setSelectedToken(updated);
          }}
        />
      )}
    </div>
  );
}
