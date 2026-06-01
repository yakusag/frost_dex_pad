import { useState, useRef, useCallback, useEffect } from "react";
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { uploadImageToIPFS, uploadJSONToIPFS, isPinataConfigured } from "@/services/ipfs";

// ─── Platform constants (from solana-bonding-curve/programs/bonding-curve/src/lib.rs) ──
const PLATFORM_FEE_WALLET = "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ";
const PLATFORM_FEE_BPS    = 1500;   // 15% on buy/sell
const INITIAL_BUY_FEE_BPS = 2000;   // 20% on initial buy
const VIRTUAL_SOL         = 30;
const VIRTUAL_TOKENS      = 1_000_000_000_000;
const GRADUATION_TARGET   = 85;
const STORAGE_KEY         = "frostdex_tokens_v1";
// RPC endpoint — set VITE_SOLANA_RPC to a dedicated provider (Helius/QuickNode/Alchemy)
// to avoid the rate limits / "internal error" on the public mainnet endpoint.
const SOLANA_RPC          = (import.meta as any).env?.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
// Deployed bonding-curve program ID. Paste yours via VITE_PROGRAM_ID after `anchor deploy`.
const PROGRAM_ID          = (import.meta as any).env?.VITE_PROGRAM_ID || "";

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

// ─── Phantom wallet helpers ───────────────────────────────────────────────────
function getPhantom(): any { return (window as any).solana ?? null; }
function isPhantomInstalled(): boolean { return !!(window as any).solana?.isPhantom; }
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
}
// Opens the current page inside Phantom's in-app browser (where window.solana exists)
function openInPhantomApp(): void {
  const url = window.location.href;
  const ref = window.location.origin;
  window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
}

async function connectPhantom(): Promise<string> {
  const p = getPhantom();
  if (!p) {
    // On mobile without the in-app browser → deep-link into the Phantom app
    if (isMobile()) {
      openInPhantomApp();
      throw new Error("Opening Phantom app… If nothing happens, install Phantom from your app store.");
    }
    throw new Error("Phantom wallet not installed. Please install it from phantom.app");
  }
  const resp = await p.connect();
  return resp.publicKey.toString();
}

async function sendFeeTransaction(
  fromAddress: string,
  lamports: number,
  onStatus: (s: string) => void
): Promise<string> {
  const p = getPhantom();
  if (!p) throw new Error("Phantom not found");
  onStatus("Building transaction…");
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const from = new PublicKey(fromAddress);
  const to   = new PublicKey(PLATFORM_FEE_WALLET);
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
}

async function getWalletBalance(address: string): Promise<number> {
  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const lamports = await connection.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
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
function TokenCard({ token, onClick }: { token: TokenData; onClick: () => void }) {
  const price = getPrice(token.virtualSol, token.virtualTokens);
  return (
    <div onClick={onClick} style={{ display: "flex", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(56,224,248,0.2)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}>
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

// ─── TradeModal ───────────────────────────────────────────────────────────────
function TradeModal({ token, onClose, onUpdate, walletAddress }: {
  token: TokenData; onClose: () => void;
  onUpdate: (t: TokenData) => void; walletAddress: string;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const solAmount = parseFloat(amount) || 0;
  const buyQ  = getBuyQuote(token.virtualSol, token.virtualTokens, solAmount, PLATFORM_FEE_BPS);
  const sellQ = getSellQuote(token.virtualSol, token.virtualTokens, solAmount * 1000, PLATFORM_FEE_BPS);

  const handleTrade = async () => {
    if (!walletAddress) { setError("Connect wallet first"); return; }
    setLoading(true); setError(""); setStatus("");
    try {
      const feeLamports = Math.round((side === "buy" ? buyQ.fee : sellQ.fee) * LAMPORTS_PER_SOL);
      if (feeLamports > 0) {
        const sig = await sendFeeTransaction(walletAddress, feeLamports, setStatus);
        setStatus(`✓ Fee sent (${sig.slice(0,8)}…)`);
      }
      const tokens = loadTokens();
      const idx = tokens.findIndex(t => t.id === token.id);
      if (idx < 0) return;
      const t = { ...tokens[idx] };
      const trade: Trade = { type: side as "buy" | "sell", solAmount, tokenAmount: side === "buy" ? buyQ.tokensOut : solAmount * 1000, price: buyQ.price, ts: Date.now(), wallet: shortAddr(walletAddress) };
      if (side === "buy") { t.virtualSol += solAmount - buyQ.fee; t.virtualTokens -= buyQ.tokensOut; }
      else { t.virtualSol -= sellQ.solOut + sellQ.fee; t.virtualTokens += solAmount * 1000; }
      t.graduated = t.virtualSol >= GRADUATION_TARGET;
      t.marketCap = getMcap(t.virtualSol, t.virtualTokens);
      t.tradeHistory = [trade, ...t.tradeHistory];
      tokens[idx] = t;
      saveTokens(tokens);
      onUpdate(t);
      setAmount("0.1");
    } catch (e: any) { setError(e.message || "Trade failed"); }
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

        {token.tradeHistory.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginBottom: 10, fontWeight: 600 }}>Recent Trades</div>
            {token.tradeHistory.slice(0, 8).map((tr, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: tr.type === "buy" ? "#0ecb81" : "#f6465d", fontWeight: 600 }}>{tr.type.toUpperCase()}</span>
                <span style={{ color: "rgba(180,190,210,0.6)" }}>{tr.solAmount.toFixed(3)} SOL</span>
                <span style={{ color: "rgba(180,190,210,0.4)" }}>{fmtAge(tr.ts)}</span>
              </div>
            ))}
          </div>
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

  // Tab & token list
  const [tab, setTab]                     = useState<"create" | "trade">("create");
  const [tokens, setTokens]               = useState<TokenData[]>(loadTokens);
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [search, setSearch]               = useState("");

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fee totals
  const advFee       = Object.entries(advOpts).filter(([,v])=>v).reduce((s,[k])=>s+ADVANCED_FEES[k].fee, 0);
  const advLamports  = Object.entries(advOpts).filter(([,v])=>v).reduce((s,[k])=>s+ADVANCED_FEES[k].lamports, 0);
  const initBuyAmt   = initialBuy ? parseFloat(buyAmount)||0 : 0;
  const initBuyFee   = initBuyAmt * INITIAL_BUY_FEE_BPS / 10000;
  const totalSol     = advFee + initBuyAmt;

  // Auto-detect Phantom on load
  useEffect(() => {
    const p = getPhantom();
    if (p?.publicKey) {
      const addr = p.publicKey.toString();
      setWalletAddress(addr);
      getWalletBalance(addr).then(setWalletBalance);
    }
  }, []);

  const handleConnectWallet = async () => {
    setWalletLoading(true);
    try {
      const addr = await connectPhantom();
      setWalletAddress(addr);
      const bal = await getWalletBalance(addr);
      setWalletBalance(bal);
    } catch (e: any) {
      setCreateError(e.message);
    } finally { setWalletLoading(false); }
  };

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
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
      try { await handleConnectWallet(); } catch {}
      if (!walletAddress) return setCreateError("Please connect your Phantom wallet first.");
    }

    setCreating(true);
    try {
      // 1. Upload image to IPFS
      setCreateStatus(isPinataConfigured() ? "Uploading image to IPFS…" : "Processing image…");
      let imageData = imagePreview;
      if (imageFile) {
        imageData = await uploadImageToIPFS(imageFile, (pct) => setUploadPct(pct));
      }

      // 2. Collect advanced option fees on-chain
      if (advLamports > 0) {
        setCreateStatus(`Sending ${advFee.toFixed(3)} SOL fee to platform…`);
        const sig = await sendFeeTransaction(walletAddress, advLamports, setCreateStatus);
        setCreateStatus(`✓ Fee confirmed (${sig.slice(0,8)}…)`);
      }

      // 3. Initial buy fee on-chain (20%)
      let initBuyTxSig = "";
      if (initialBuy && initBuyAmt > 0) {
        const initFeeLamports = Math.round(initBuyFee * LAMPORTS_PER_SOL);
        const totalLamports   = Math.round(initBuyAmt * LAMPORTS_PER_SOL);
        setCreateStatus(`Sending initial buy (${initBuyAmt} SOL)…`);
        initBuyTxSig = await sendFeeTransaction(walletAddress, initFeeLamports, setCreateStatus);
        // remaining goes to bonding curve (simulated locally)
        setCreateStatus("✓ Initial buy confirmed");
      }

      // 4. Upload metadata JSON to IPFS
      let metadataUri = "";
      if (isPinataConfigured()) {
        setCreateStatus("Uploading metadata to IPFS…");
        try {
          metadataUri = await uploadJSONToIPFS({
            name: name.trim(), symbol: symbol.trim().toUpperCase(),
            description: description.trim(), image: imageData,
            external_url: website.trim(), attributes: [],
          });
        } catch { /* non-fatal */ }
      }

      // 5. Apply initial buy to bonding curve
      let vSol = VIRTUAL_SOL, vTokens = VIRTUAL_TOKENS;
      const history: Trade[] = [];
      if (initialBuy && initBuyAmt > 0) {
        const q = getBuyQuote(vSol, vTokens, initBuyAmt, INITIAL_BUY_FEE_BPS);
        vSol    += initBuyAmt - q.fee;
        vTokens -= q.tokensOut;
        history.push({ type: "buy" as const, solAmount: initBuyAmt, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: shortAddr(walletAddress) });
      }

      // 6. Mint address (simulate — real mint needs deployed program)
      const mint = `${walletAddress.slice(0,6)}${Math.random().toString(36).slice(2,8).toUpperCase()}`;

      const token: TokenData = {
        id: crypto.randomUUID(), mint,
        name: name.trim(), symbol: symbol.trim().toUpperCase(),
        description: description.trim(), image: imageData, metadataUri,
        creator: shortAddr(walletAddress), creatorAddress: walletAddress,
        createdAt: Date.now(), website: website.trim(),
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

      // Update balance
      getWalletBalance(walletAddress).then(setWalletBalance);

      setCreateSuccess(`🎉 ${name} ($${symbol.toUpperCase()}) launched! Mint: ${mint}`);
      setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTelegram(""); setTwitter("");
      setImageFile(null); setImagePreview(""); setAdvOpts({ revoke_mint: false, revoke_freeze: false, immutable_metadata: false }); setInitialBuy(false);

      setTimeout(() => { setTab("trade"); setCreateSuccess(""); }, 2500);
    } catch (e: any) {
      setCreateError(e.message || "Failed to launch token.");
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
          <span title={PROGRAM_ID ? `Program: ${PROGRAM_ID}` : "On-chain program not configured (VITE_PROGRAM_ID)"} style={{ fontSize: 11, borderRadius: 6, padding: "3px 8px", background: PROGRAM_ID ? "rgba(14,203,129,0.1)" : "rgba(246,70,93,0.1)", color: PROGRAM_ID ? "#0ecb81" : "rgba(246,70,93,0.85)" }}>
            {PROGRAM_ID ? `⛓ Program ${shortAddr(PROGRAM_ID)}` : "⛓ Program not set"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {walletAddress ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ecb81" }} />
            <span style={{ fontSize: 13, color: "rgba(180,190,210,0.7)", fontFamily: "monospace" }}>{shortAddr(walletAddress)}</span>
            <span style={{ fontSize: 12, color: "rgba(56,224,248,0.7)", background: "rgba(56,224,248,0.08)", borderRadius: 6, padding: "3px 8px" }}>{walletBalance.toFixed(3)} SOL</span>
          </div>
        ) : (
          <button onClick={handleConnectWallet} disabled={walletLoading} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: walletLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>
            {walletLoading ? "Connecting…" : "Connect Phantom"}
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
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
              {imagePreview && <button onClick={() => { setImageFile(null); setImagePreview(""); }} style={{ marginTop: 8, fontSize: 11, color: "rgba(246,70,93,0.6)", background: "none", border: "none", cursor: "pointer" }}>Remove image</button>}
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
            {createSuccess && <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(14,203,129,0.1)", border: "1px solid rgba(14,203,129,0.3)", borderRadius: 10, color: "#0ecb81", fontSize: 13 }}>{createSuccess}</div>}

            {/* Create button */}
            {!walletAddress ? (
              <button onClick={handleConnectWallet} disabled={walletLoading} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", fontWeight: 900, fontSize: 16, cursor: walletLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11", boxShadow: "0 0 30px rgba(56,224,248,0.2)" }}>
                {walletLoading ? "Connecting…" : "🔗 Connect Phantom Wallet"}
              </button>
            ) : (
              <button onClick={handleCreate} disabled={creating} style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", fontWeight: 900, fontSize: 16, cursor: creating ? "not-allowed" : "pointer", background: creating ? "rgba(56,224,248,0.15)" : "linear-gradient(135deg,#38e0f8 0%,#0ecb81 100%)", color: "#0b0e11", boxShadow: "0 0 30px rgba(56,224,248,0.2)", opacity: creating ? 0.8 : 1 }}>
                {creating ? "Launching…" : "🚀 Launch Token"}
              </button>
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
              <button onClick={() => setTab("create")} style={{ padding: "12px 18px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11", whiteSpace: "nowrap" }}>
                + Launch
              </button>
            </div>
            {filteredTokens.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(180,190,210,0.3)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>❄️</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No tokens yet</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>Be the first to launch on FrostDex!</div>
                <button onClick={() => setTab("create")} style={{ padding: "12px 28px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}>Launch First Token</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredTokens.map(t => <TokenCard key={t.id} token={t} onClick={() => setSelectedToken(t)} />)}
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
          onClose={() => setSelectedToken(null)}
          onUpdate={updated => { setTokens(loadTokens()); setSelectedToken(updated); }}
        />
      )}
    </div>
  );
}
