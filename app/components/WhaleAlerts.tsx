import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface WhaleAlert { id: string; symbol: string; side: "buy" | "sell"; size: number; price: number; value: number; time: number; }

const SYMBOLS = ["PERP_BTC_USDC","PERP_ETH_USDC","PERP_SOL_USDC","PERP_ARB_USDC","PERP_BNB_USDC","PERP_AVAX_USDC","PERP_DOGE_USDC","PERP_SUI_USDC","PERP_LINK_USDC"];
const WHALE_THRESHOLD = 50_000;

function fmtVal(v: number) { if (v >= 1e6) return "$" + (v/1e6).toFixed(2) + "M"; if (v >= 1e3) return "$" + (v/1e3).toFixed(0) + "K"; return "$" + v.toFixed(0); }
function fmtTime(ts: number) { const d = Math.floor((Date.now()-ts)/1000); if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`; return `${Math.floor(d/3600)}h ago`; }

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

interface Props { onHide: () => void; }

export default function WhaleAlerts({ onHide }: Props) {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const seenIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaultPos = { x: typeof window !== "undefined" ? window.innerWidth - 66 : 1200, y: typeof window !== "undefined" ? window.innerHeight - 178 : 500 };
  const { pos, isDragging, elementRef, isBottomHalf, dragHandleProps } = useDraggable("whale-alerts", defaultPos);

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

  const base = (sym: string) => sym.split("_")[1];

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  return (
    <div
      ref={elementRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls widget-controls--right">
          <span className="widget-drag-handle" {...dragHandleProps} title="Drag to move">⠿</span>
          <button className="widget-hide-btn" onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      <button className="whale-fab" onClick={() => { setOpen(v => !v); setHasNew(false); }} aria-label="Whale Alerts">
        🐋
        {hasNew && <span className="whale-badge" />}
      </button>

      {open && (
        <div className="whale-panel" style={{ ...panelStyle, width: 300, maxWidth: "calc(100vw - 24px)" }}>
          <div className="whale-panel-header">
            <span className="whale-panel-title">🐋 Whale Alerts</span>
            <span className="whale-panel-sub">Trades &gt; {fmtVal(WHALE_THRESHOLD)}</span>
          </div>
          <div className="whale-list">
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
