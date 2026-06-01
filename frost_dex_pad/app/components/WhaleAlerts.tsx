import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface WhaleAlert { id: string; symbol: string; side: "buy" | "sell"; size: number; price: number; value: number; time: number; }
interface WhaleLookup { address: string; accountId: string | null; found: boolean; loading: boolean; error: string; }

const SYMBOLS = [
  "PERP_BTC_USDC","PERP_ETH_USDC","PERP_SOL_USDC","PERP_ARB_USDC",
  "PERP_BNB_USDC","PERP_AVAX_USDC","PERP_DOGE_USDC","PERP_SUI_USDC",
  "PERP_LINK_USDC","PERP_XAU_USDC","PERP_XAG_USDC","PERP_CL_USDC",
];
const WHALE_THRESHOLD = 50_000;

function fmtVal(v: number) { if (v >= 1e6) return "$" + (v/1e6).toFixed(2) + "M"; if (v >= 1e3) return "$" + (v/1e3).toFixed(0) + "K"; return "$" + v.toFixed(0); }
function fmtTime(ts: number) { const d = Math.floor((Date.now()-ts)/1000); if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`; return `${Math.floor(d/3600)}h ago`; }
function shortAddr(a: string) { return a.slice(0, 6) + "…" + a.slice(-4); }
function isValidAddr(a: string) { return /^0x[0-9a-fA-F]{40}$/.test(a.trim()); }

async function fetchRecentTrades(symbol: string): Promise<WhaleAlert[]> {
  try {
    const res = await fetch(`https://api.orderly.org/v1/public/market_trades?symbol=${symbol}&limit=20`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data?.rows ?? [])
      .filter((t: any) => Number(t.executed_price) * Number(t.executed_quantity) >= WHALE_THRESHOLD)
      .map((t: any) => ({
        id: `${symbol}-${t.ts}-${t.executed_quantity}`,
        symbol, side: t.side?.toLowerCase() === "buy" ? "buy" : "sell",
        size: Number(t.executed_quantity), price: Number(t.executed_price),
        value: Number(t.executed_price) * Number(t.executed_quantity), time: Number(t.ts),
      }));
  } catch { return []; }
}

async function lookupWhaleAddress(address: string): Promise<{ accountId: string | null; found: boolean }> {
  try {
    const res = await fetch(`https://api.orderly.org/v1/public/account?address=${address.trim()}&chain_id=42161`, { cache: "no-store" });
    if (!res.ok) return { accountId: null, found: false };
    const json = await res.json();
    const accountId = json?.data?.account_id ?? null;
    return { accountId, found: !!accountId };
  } catch { return { accountId: null, found: false }; }
}

interface Props { onHide: () => void; }

export default function WhaleAlerts({ onHide }: Props) {
  const [alerts, setAlerts]   = useState<WhaleAlert[]>([]);
  const [open, setOpen]       = useState(false);
  const [hasNew, setHasNew]   = useState(false);
  const [hovered, setHovered] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [lookup, setLookup]   = useState<WhaleLookup | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const seenIds  = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaultPos = { x: 12, y: typeof window !== "undefined" ? window.innerHeight - 390 : 370 };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } = useDraggable("whale-alerts", defaultPos);

  const fetchAll = async () => {
    const all = (await Promise.all(SYMBOLS.map(fetchRecentTrades))).flat();
    const newAlerts = all.filter(a => !seenIds.current.has(a.id));
    if (newAlerts.length > 0) {
      newAlerts.forEach(a => seenIds.current.add(a.id));
      setAlerts(prev => [...newAlerts, ...prev].sort((a,b) => b.time - a.time).slice(0, 50));
      if (!open) setHasNew(true);
    }
  };

  useEffect(() => { fetchAll(); intervalRef.current = setInterval(fetchAll, 15_000); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const handleSearch = async () => {
    const addr = searchInput.trim();
    if (!isValidAddr(addr)) {
      setLookup({ address: addr, accountId: null, found: false, loading: false, error: "Invalid address format" });
      return;
    }
    setLookup({ address: addr, accountId: null, found: false, loading: true, error: "" });
    const result = await lookupWhaleAddress(addr);
    setLookup({ address: addr, accountId: result.accountId, found: result.found, loading: false, error: "" });
  };

  const base = (sym: string) => sym.split("_")[1];

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  return (
    <div
      ref={elementRef}
      {...dragHandleProps}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto", cursor: isDragging ? "grabbing" : "grab", transition: isSnapping ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)" : "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls widget-controls--right">
          <button className="widget-hide-btn" onMouseDown={e => e.stopPropagation()} onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      <button className="whale-fab" onClick={() => { if (wasDragged()) return; setOpen(v => !v); setHasNew(false); }} aria-label="Whale Alerts">
        🐋
        {hasNew && <span className="whale-badge" />}
      </button>

      {open && (
        <div className="whale-panel" style={{ ...panelStyle, width: 310, maxWidth: "calc(100vw - 24px)" }}>
          {/* Header */}
          <div className="whale-panel-header">
            <div>
              <span className="whale-panel-title">🐋 Whale Alerts</span>
              <span className="whale-panel-sub">Trades &gt; {fmtVal(WHALE_THRESHOLD)}</span>
            </div>
          </div>

          {/* Address search — always visible */}
          <div className="whale-search-box" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <div className="whale-search-row">
              <span className="whale-search-icon">🔍</span>
              <input
                className="whale-search-input"
                placeholder="Paste 0x… wallet address"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
                onMouseDown={e => e.stopPropagation()}
              />
              <button className="whale-search-btn" onClick={handleSearch} onMouseDown={e => e.stopPropagation()}>
                {lookup?.loading ? "…" : "Go"}
              </button>
            </div>

            {lookup && !lookup.loading && (
              <div className="whale-lookup-result">
                {lookup.error ? (
                  <div className="whale-lookup-error">{lookup.error}</div>
                ) : lookup.found ? (
                  <div className="whale-lookup-found">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ color: "#0ecb81", fontSize: 12 }}>✓</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#e8ecf1" }}>Orderly Trader Found</span>
                    </div>
                    <div className="whale-lookup-addr">{shortAddr(lookup.address)}</div>
                    {lookup.accountId && (
                      <div className="whale-lookup-id">Account ID: {shortAddr(lookup.accountId)}</div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <a className="whale-lookup-link" href={`https://arbiscan.io/address/${lookup.address}`} target="_blank" rel="noopener noreferrer">Arbiscan ↗</a>
                      <a className="whale-lookup-link" href={`https://app.orderly.network/portfolio?account=${lookup.address}`} target="_blank" rel="noopener noreferrer">Orderly ↗</a>
                    </div>
                  </div>
                ) : (
                  <div className="whale-lookup-notfound">
                    <div style={{ color: "rgba(246,70,93,0.8)", fontSize: 11, marginBottom: 4 }}>⚠ Not found on Orderly Network</div>
                    <div className="whale-lookup-addr">{shortAddr(lookup.address)}</div>
                    <a className="whale-lookup-link" style={{ marginTop: 6, display: "inline-block" }} href={`https://arbiscan.io/address/${lookup.address}`} target="_blank" rel="noopener noreferrer">View on Arbiscan ↗</a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alerts list */}
          <div className="whale-list" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {alerts.length === 0 && <div className="whale-empty">Watching for whale trades…</div>}
            {alerts.map(a => (
              <div key={a.id} className={`whale-item whale-item--${a.side}`}>
                <div className="whale-item-left">
                  <span className={`whale-side-badge whale-side-badge--${a.side}`}>{a.side === "buy" ? "▲ BUY" : "▼ SELL"}</span>
                  <span className="whale-symbol">{base(a.symbol)}</span>
                </div>
                <div className="whale-item-right">
                  <span className="whale-value">{fmtVal(a.value)}</span>
                  <span className="whale-time">{fmtTime(a.time)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="whale-panel-footer">Live · refreshes every 15s</div>
        </div>
      )}
    </div>
  );
}
