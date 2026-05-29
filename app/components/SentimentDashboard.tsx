import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface MarketSentiment { fearGreed: number; label: string; bullishPct: number; totalSymbols: number; bullishCount: number; bearishCount: number; timestamp: number; }

async function fetchFearGreed() {
  try { const res = await fetch("https://api.alternative.me/fng/?limit=1", { cache: "no-store" }); if (!res.ok) return null; const json = await res.json(); const d = json?.data?.[0]; return d ? { value: Number(d.value), label: d.value_classification } : null; } catch { return null; }
}

async function fetchMarketMomentum() {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "no-store" }); if (!res.ok) return null;
    const rows: any[] = (await res.json())?.data?.rows ?? []; if (!rows.length) return null;
    let bullish = 0, bearish = 0;
    for (const r of rows) { const c = Number(r["24h_close"] ?? 0), o = Number(r["24h_open"] ?? 0); if (o > 0) { if (c >= o) bullish++; else bearish++; } }
    const total = bullish + bearish;
    return { bullishPct: total > 0 ? Math.round((bullish/total)*100) : 50, bullish, bearish, total };
  } catch { return null; }
}

function getFGColor(v: number) { if (v <= 25) return "#f6465d"; if (v <= 45) return "#ff9500"; if (v <= 55) return "#eaecef"; if (v <= 75) return "#0ecb81"; return "#38e0f8"; }
function getFGLabel(v: number) { if (v <= 25) return "Extreme Fear"; if (v <= 45) return "Fear"; if (v <= 55) return "Neutral"; if (v <= 75) return "Greed"; return "Extreme Greed"; }

function GaugeArc({ value }: { value: number }) {
  const pct = value / 100, r = 40, cx = 60, cy = 55;
  const x1 = cx + r * Math.cos(Math.PI), y1 = cy + r * Math.sin(Math.PI);
  const x2 = cx + r * Math.cos(0), y2 = cy + r * Math.sin(0);
  const angle = Math.PI - pct * Math.PI;
  const nx = cx + r * Math.cos(angle), ny = cy + r * Math.sin(angle);
  return (
    <svg width="120" height="70" viewBox="0 0 120 70" style={{ display: "block", margin: "0 auto" }}>
      <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round"/>
      {value > 0 && <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${nx} ${ny}`} fill="none" stroke={getFGColor(value)} strokeWidth="8" strokeLinecap="round"/>}
      <line x1={cx} y1={cy} x2={cx + (r-8)*Math.cos(angle)} y2={cy + (r-8)*Math.sin(angle)} stroke={getFGColor(value)} strokeWidth="2" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="3" fill={getFGColor(value)}/>
    </svg>
  );
}

interface Props { onHide: () => void; }

export default function SentimentDashboard({ onHide }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MarketSentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaultPos = { x: 12, y: typeof window !== "undefined" ? window.innerHeight - 224 : 450 };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps } = useDraggable("sentiment-dashboard", defaultPos);

  const load = async () => {
    setLoading(true);
    const [fg, momentum] = await Promise.all([fetchFearGreed(), fetchMarketMomentum()]);
    const fgVal = fg?.value ?? 50;
    setData({ fearGreed: fgVal, label: fg?.label ?? getFGLabel(fgVal), bullishPct: momentum?.bullishPct ?? 50, totalSymbols: momentum?.total ?? 0, bullishCount: momentum?.bullish ?? 0, bearishCount: momentum?.bearish ?? 0, timestamp: Date.now() });
    setLoading(false);
  };

  useEffect(() => {
    if (open && !data) load();
    if (open) { intervalRef.current = setInterval(load, 60_000); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open]);

  const fgColor = data ? getFGColor(data.fearGreed) : "#eaecef";

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", left: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", left: 0 };

  return (
    <div
      ref={elementRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto", transition: isSnapping ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)" : "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls">
          <span className="widget-drag-handle" {...dragHandleProps} title="Drag to move">⠿</span>
          <button className="widget-hide-btn" onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      <button className="sentiment-fab" onClick={() => setOpen(v => !v)} aria-label="Market Sentiment">
        📊 <span>Mood</span>
      </button>

      {open && (
        <div className="sentiment-panel" style={{ ...panelStyle, width: 280, maxWidth: "calc(100vw - 24px)" }}>
          <div className="sentiment-header">
            <span className="sentiment-title">📊 Market Sentiment</span>
            <button className="sentiment-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          {loading && !data && <div className="sentiment-loading">Loading…</div>}
          {data && (
            <div className="sentiment-body">
              <div className="sentiment-card">
                <div className="sentiment-card-title">Fear & Greed Index</div>
                <GaugeArc value={data.fearGreed} />
                <div className="sentiment-fg-value" style={{ color: fgColor }}>{data.fearGreed}</div>
                <div className="sentiment-fg-label" style={{ color: fgColor }}>{data.label}</div>
                <div className="sentiment-fg-scale"><span style={{ color: "#f6465d" }}>Fear</span><span style={{ color: "#eaecef" }}>Neutral</span><span style={{ color: "#0ecb81" }}>Greed</span></div>
              </div>
              <div className="sentiment-card">
                <div className="sentiment-card-title">Perp Markets ({data.totalSymbols} pairs)</div>
                <div className="sentiment-bar-wrap">
                  <div className="sentiment-bar-fill sentiment-bar-fill--bull" style={{ width: `${data.bullishPct}%` }}/>
                  <div className="sentiment-bar-fill sentiment-bar-fill--bear" style={{ width: `${100 - data.bullishPct}%` }}/>
                </div>
                <div className="sentiment-bar-labels">
                  <span style={{ color: "#0ecb81" }}>▲ Bullish {data.bullishCount} ({data.bullishPct}%)</span>
                  <span style={{ color: "#f6465d" }}>▼ Bearish {data.bearishCount} ({100 - data.bullishPct}%)</span>
                </div>
                <div className="sentiment-mood-label" style={{ color: data.bullishPct >= 60 ? "#0ecb81" : data.bullishPct <= 40 ? "#f6465d" : "#eaecef" }}>
                  {data.bullishPct >= 65 ? "🔥 Strong Bullish" : data.bullishPct >= 55 ? "📈 Mildly Bullish" : data.bullishPct <= 35 ? "🧊 Strong Bearish" : data.bullishPct <= 45 ? "📉 Mildly Bearish" : "⚖ Neutral"}
                </div>
              </div>
              <div className="sentiment-updated">
                Updated {new Date(data.timestamp).toLocaleTimeString()}
                <button className="sentiment-refresh" onClick={load} disabled={loading}>{loading ? "…" : "↺"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
