import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface SMSignal {
  symbol: string;
  base: string;
  signal: "accumulation" | "distribution" | "neutral" | "watch";
  funding: number;
  oiChange: number;
  priceChange: number;
  score: number;
}

const TOP_SYMBOLS = [
  "PERP_BTC_USDC","PERP_ETH_USDC","PERP_SOL_USDC","PERP_ARB_USDC",
  "PERP_BNB_USDC","PERP_AVAX_USDC","PERP_DOGE_USDC","PERP_SUI_USDC",
  "PERP_LINK_USDC","PERP_OP_USDC",
];

function calcSignal(funding: number, priceChange: number, oiChange: number): { signal: SMSignal["signal"]; score: number } {
  let score = 0;

  // Funding rate: extreme positive = longs crowded (smart $ may short)
  // extreme negative = shorts crowded (smart $ may long)
  if (funding > 0.05) score -= 2;
  else if (funding > 0.02) score -= 1;
  else if (funding < -0.05) score += 2;
  else if (funding < -0.02) score += 1;

  // Price change
  if (priceChange > 3) score += 2;
  else if (priceChange > 1) score += 1;
  else if (priceChange < -3) score -= 2;
  else if (priceChange < -1) score -= 1;

  // OI change: rising OI + rising price = accumulation
  if (oiChange > 5 && priceChange > 0) score += 2;
  else if (oiChange > 2 && priceChange > 0) score += 1;
  else if (oiChange > 5 && priceChange < 0) score -= 1; // rising OI falling price = distribution
  else if (oiChange < -5) score -= 1;

  const signal: SMSignal["signal"] =
    score >= 3 ? "accumulation" :
    score <= -3 ? "distribution" :
    Math.abs(score) === 2 ? "watch" :
    "neutral";

  return { signal, score };
}

async function fetchSmartMoneyData(): Promise<SMSignal[]> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "no-store" });
    if (!res.ok) return [];
    const rows: any[] = (await res.json())?.data?.rows ?? [];

    return rows
      .filter(r => TOP_SYMBOLS.includes(r.symbol))
      .map(r => {
        const funding = Number(r.last_funding_rate ?? 0) * 100; // to %
        const close = Number(r["24h_close"] ?? 0);
        const open = Number(r["24h_open"] ?? 0);
        const priceChange = open > 0 ? ((close - open) / open) * 100 : 0;
        const oi = Number(r.open_interest ?? 0);
        const oiOld = Number(r.open_interest_24h ?? oi);
        const oiChange = oiOld > 0 ? ((oi - oiOld) / oiOld) * 100 : 0;
        const { signal, score } = calcSignal(funding, priceChange, oiChange);
        const base = r.symbol.split("_")[1];
        return { symbol: r.symbol, base, signal, funding, oiChange, priceChange, score };
      })
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  } catch { return []; }
}

const SIGNAL_CONFIG = {
  accumulation: { label: "Accumulation", color: "#0ecb81", dot: "🟢", short: "ACCUM" },
  distribution:  { label: "Distribution",  color: "#f6465d", dot: "🔴", short: "DISTR" },
  watch:         { label: "Watch",          color: "#f0b90b", dot: "🟡", short: "WATCH" },
  neutral:       { label: "Neutral",        color: "rgba(180,190,210,0.5)", dot: "⚪", short: "NEUT" },
};

function fmt(v: number, decimals = 2) {
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

interface Props { onHide: () => void; }

export default function SmartMoney({ onHide }: Props) {
  const [signals, setSignals] = useState<SMSignal[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tab, setTab] = useState<"all" | "accumulation" | "distribution">("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const defaultPos = {
    x: 12,
    y: typeof window !== "undefined" ? window.innerHeight - 500 : 260,
  };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } =
    useDraggable("smart-money", defaultPos);

  const load = async () => {
    setLoading(true);
    const data = await fetchSmartMoneyData();
    setSignals(data);
    setLoading(false);
    if (!open) setHasNew(true);
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  const filtered = tab === "all" ? signals : signals.filter(s => s.signal === tab || (tab === "accumulation" && s.signal === "watch" && s.score > 0));

  const accumCount = signals.filter(s => s.signal === "accumulation").length;
  const distrCount = signals.filter(s => s.signal === "distribution").length;

  return (
    <div
      ref={elementRef}
      {...dragHandleProps}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 200,
        userSelect: isDragging ? "none" : "auto",
        cursor: isDragging ? "grabbing" : "grab",
        transition: isSnapping ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls widget-controls--right">
          <button className="widget-hide-btn" onMouseDown={e => e.stopPropagation()} onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      {/* FAB */}
      <button
        className="sm-fab"
        onClick={() => { if (wasDragged()) return; setOpen(v => !v); setHasNew(false); }}
        aria-label="Smart Money"
      >
        <span className="sm-fab-icon">🧠</span>
        {hasNew && accumCount > 0 && (
          <span className="sm-fab-badge" style={{ background: "#0ecb81" }}>{accumCount}</span>
        )}
        {hasNew && distrCount > 0 && !accumCount && (
          <span className="sm-fab-badge" style={{ background: "#f6465d" }}>{distrCount}</span>
        )}
      </button>

      {open && (
        <div className="sm-panel" style={{ ...panelStyle, width: 310, maxWidth: "calc(100vw - 24px)" }}>
          {/* Header */}
          <div className="sm-header">
            <div className="sm-header-left">
              <span style={{ fontSize: 16 }}>🧠</span>
              <div>
                <div className="sm-title">Smart Money</div>
                <div className="sm-sub">OI · Funding · Flow signals</div>
              </div>
            </div>
            <div className="sm-summary">
              <span style={{ color: "#0ecb81", fontSize: 11 }}>▲ {accumCount}</span>
              <span style={{ color: "rgba(180,190,210,0.4)", fontSize: 10, margin: "0 3px" }}>|</span>
              <span style={{ color: "#f6465d", fontSize: 11 }}>▼ {distrCount}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="sm-tabs" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {(["all", "accumulation", "distribution"] as const).map(t => (
              <button key={t} className={`sm-tab ${tab === t ? "sm-tab--active" : ""}`} onClick={() => setTab(t)}>
                {t === "all" ? "All" : t === "accumulation" ? "🟢 Accum" : "🔴 Distr"}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="sm-legend">
            <span>Signal = OI change + funding + price action</span>
          </div>

          {/* List */}
          <div className="sm-list" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {loading && signals.length === 0 && (
              <div className="sm-empty">Analyzing market flows…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="sm-empty">No strong signals right now</div>
            )}
            {filtered.map(s => {
              const cfg = SIGNAL_CONFIG[s.signal];
              return (
                <div key={s.symbol} className="sm-row">
                  <div className="sm-row-left">
                    <span className="sm-base">{s.base}</span>
                    <span className="sm-signal-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                      {cfg.short}
                    </span>
                  </div>
                  <div className="sm-row-right">
                    <div className="sm-row-stats">
                      <span className="sm-stat" title="24h Price Change" style={{ color: s.priceChange >= 0 ? "#0ecb81" : "#f6465d" }}>
                        {fmt(s.priceChange)}
                      </span>
                      <span className="sm-stat-sep">·</span>
                      <span className="sm-stat" title="OI Change" style={{ color: s.oiChange >= 0 ? "rgba(56,224,248,0.8)" : "rgba(180,190,210,0.5)" }}>
                        OI {fmt(s.oiChange, 1)}
                      </span>
                    </div>
                    <div className="sm-row-funding" title="Funding Rate" style={{ color: s.funding > 0.02 ? "#f6465d" : s.funding < -0.02 ? "#0ecb81" : "rgba(180,190,210,0.5)" }}>
                      FR {s.funding >= 0 ? "+" : ""}{s.funding.toFixed(4)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sm-footer">
            Live · updates every 30s · Not financial advice
          </div>
        </div>
      )}
    </div>
  );
}
