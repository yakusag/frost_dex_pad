import { useEffect, useRef, useState } from "react";

interface WhaleAlert {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  value: number;
  time: number;
}

const SYMBOLS = [
  "PERP_BTC_USDC", "PERP_ETH_USDC", "PERP_SOL_USDC",
  "PERP_ARB_USDC", "PERP_BNB_USDC", "PERP_AVAX_USDC",
  "PERP_DOGE_USDC", "PERP_SUI_USDC", "PERP_LINK_USDC",
];
const WHALE_THRESHOLD = 50_000;

function fmtVal(v: number): string {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
}

function fmtTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

async function fetchRecentTrades(symbol: string): Promise<WhaleAlert[]> {
  try {
    const res = await fetch(
      `https://api.orderly.org/v1/public/market_trades?symbol=${symbol}&limit=20`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const trades = json?.data?.rows ?? [];
    return trades
      .filter((t: any) => {
        const val = Number(t.executed_price) * Number(t.executed_quantity);
        return val >= WHALE_THRESHOLD;
      })
      .map((t: any) => ({
        id: `${symbol}-${t.ts}-${t.executed_quantity}`,
        symbol,
        side: t.side?.toLowerCase() === "buy" ? "buy" : "sell",
        size: Number(t.executed_quantity),
        price: Number(t.executed_price),
        value: Number(t.executed_price) * Number(t.executed_quantity),
        time: Number(t.ts),
      }));
  } catch {
    return [];
  }
}

export default function WhaleAlerts() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = async () => {
    const results = await Promise.all(SYMBOLS.map(fetchRecentTrades));
    const all = results.flat();
    const newAlerts = all.filter((a) => !seenIds.current.has(a.id));
    if (newAlerts.length > 0) {
      newAlerts.forEach((a) => seenIds.current.add(a.id));
      setAlerts((prev) => {
        const combined = [...newAlerts, ...prev]
          .sort((a, b) => b.time - a.time)
          .slice(0, 50);
        return combined;
      });
      if (!open) setHasNew(true);
    }
  };

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    setHasNew(false);
  };

  const base = (sym: string) => sym.split("_")[1];

  return (
    <>
      <button className="whale-fab" onClick={handleOpen} aria-label="Whale Alerts">
        🐋
        {hasNew && <span className="whale-badge" />}
      </button>

      {open && (
        <div className="whale-panel">
          <div className="whale-panel-header">
            <span className="whale-panel-title">🐋 Whale Alerts</span>
            <span className="whale-panel-sub">Trades &gt; {fmtVal(WHALE_THRESHOLD)}</span>
          </div>

          <div className="whale-list">
            {alerts.length === 0 && (
              <div className="whale-empty">Watching for whale trades…</div>
            )}
            {alerts.map((a) => (
              <div key={a.id} className={`whale-item whale-item--${a.side}`}>
                <div className="whale-item-left">
                  <span className={`whale-side-badge whale-side-badge--${a.side}`}>
                    {a.side === "buy" ? "▲ BUY" : "▼ SELL"}
                  </span>
                  <span className="whale-symbol">{base(a.symbol)}</span>
                </div>
                <div className="whale-item-right">
                  <span className="whale-value">{fmtVal(a.value)}</span>
                  <span className="whale-time">{fmtTime(a.time)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="whale-panel-footer">
            Live · refreshes every 15s
          </div>
        </div>
      )}
    </>
  );
}
