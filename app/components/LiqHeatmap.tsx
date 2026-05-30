import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface FuturesRow {
  symbol: string;
  mark_price: number;
  open_interest: number;
  "24h_close": number;
  "24h_high": number;
  "24h_low": number;
  last_funding_rate: number;
}

interface LiqLevel {
  price: number;
  pct: number;
  side: "long" | "short";
  intensity: number;
  leverage: string;
  usd: number;
}

const SYMBOLS = [
  "PERP_BTC_USDC",
  "PERP_ETH_USDC",
  "PERP_SOL_USDC",
  "PERP_ARB_USDC",
  "PERP_BNB_USDC",
  "PERP_XAU_USDC",
  "PERP_XAG_USDC",
  "PERP_CL_USDC",
  "PERP_NATGAS_USDC_arthur",
];
const BASES = ["BTC", "ETH", "SOL", "ARB", "BNB", "XAU", "XAG", "OIL", "GAS"];

const LEVERAGE_LEVELS = [
  { lev: 100, pct: 0.5,  label: "100x", weight: 0.06 },
  { lev: 75,  pct: 0.8,  label: "75x",  weight: 0.07 },
  { lev: 50,  pct: 1.5,  label: "50x",  weight: 0.14 },
  { lev: 25,  pct: 3.5,  label: "25x",  weight: 0.16 },
  { lev: 20,  pct: 4.5,  label: "20x",  weight: 0.14 },
  { lev: 15,  pct: 6.0,  label: "15x",  weight: 0.12 },
  { lev: 10,  pct: 9.0,  label: "10x",  weight: 0.18 },
  { lev: 5,   pct: 19.0, label: "5x",   weight: 0.13 },
];

async function fetchFutures(symbol: string): Promise<FuturesRow | null> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "no-store" });
    if (!res.ok) return null;
    const rows: any[] = (await res.json())?.data?.rows ?? [];
    const r = rows.find((x: any) => x.symbol === symbol);
    if (!r) return null;
    return {
      symbol: r.symbol,
      mark_price: Number(r.mark_price ?? r["24h_close"] ?? 0),
      open_interest: Number(r.open_interest ?? 0),
      "24h_close": Number(r["24h_close"] ?? 0),
      "24h_high": Number(r["24h_high"] ?? 0),
      "24h_low": Number(r["24h_low"] ?? 0),
      last_funding_rate: Number(r.last_funding_rate ?? 0),
    };
  } catch { return null; }
}

function buildLevels(mark: number, oi: number): LiqLevel[] {
  const levels: LiqLevel[] = [];
  const notional = mark * oi;
  for (const lv of LEVERAGE_LEVELS) {
    levels.push({ price: mark * (1 - lv.pct / 100), pct: -lv.pct, side: "long",  intensity: lv.weight, leverage: lv.label, usd: notional * lv.weight * 0.6 });
    levels.push({ price: mark * (1 + lv.pct / 100), pct:  lv.pct, side: "short", intensity: lv.weight, leverage: lv.label, usd: notional * lv.weight * 0.4 });
  }
  return levels.sort((a, b) => b.price - a.price);
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(4);
}
function fmtUSD(v: number): string {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
}

interface Props { onHide: () => void; }

export default function LiqHeatmap({ onHide }: Props) {
  const [open, setOpen]       = useState(false);
  const [symIdx, setSymIdx]   = useState(0);
  const [row, setRow]         = useState<FuturesRow | null>(null);
  const [levels, setLevels]   = useState<LiqLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const defaultPos = { x: typeof window !== "undefined" ? window.innerWidth - 120 : 1160, y: 60 };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } =
    useDraggable("liq-heatmap", defaultPos);

  const load = async (idx = symIdx) => {
    setLoading(true);
    const data = await fetchFutures(SYMBOLS[idx]);
    if (data) { setRow(data); setLevels(buildLevels(data.mark_price, data.open_interest)); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(), 20_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symIdx]);

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  const markPrice   = row?.mark_price ?? 0;
  const maxIntensity = Math.max(...levels.map(l => l.intensity), 0.01);

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
          <button className="widget-hide-btn" onMouseDown={e => e.stopPropagation()} onClick={onHide} title="Hide">✕</button>
        </div>
      )}

      <button className="liq-fab" onClick={() => { if (wasDragged()) return; setOpen(v => !v); }} aria-label="Liquidation Heatmap">
        <span style={{ fontSize: 16 }}>🔥</span>
      </button>

      {open && (
        <div className="liq-panel" style={{ ...panelStyle, width: 300, maxWidth: "calc(100vw - 24px)" }}>
          <div className="liq-header">
            <div className="liq-header-left">
              <span style={{ fontSize: 14 }}>🔥</span>
              <div>
                <div className="liq-title">Liq Heatmap</div>
                <div className="liq-sub">Estimated liquidation zones</div>
              </div>
            </div>
            {row && (
              <div className="liq-mark">
                <div style={{ fontSize: 11, fontWeight: 700, color: "#38e0f8" }}>${fmtPrice(markPrice)}</div>
                <div style={{ fontSize: 9, color: "rgba(180,190,210,0.4)" }}>mark</div>
              </div>
            )}
          </div>

          {/* Symbol picker — scrollable row */}
          <div className="liq-symbols" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {BASES.map((b, i) => (
              <button key={b} className={`liq-sym-btn ${symIdx === i ? "liq-sym-btn--active" : ""}`}
                onClick={() => { setSymIdx(i); load(i); }}>
                {b}
              </button>
            ))}
          </div>

          <div className="liq-legend">
            <span style={{ color: "#0ecb81" }}>■</span> Short liq &nbsp;
            <span style={{ color: "#f6465d" }}>■</span> Long liq &nbsp;
            <span style={{ color: "rgba(56,224,248,0.7)" }}>──</span> Mark price
          </div>

          <div className="liq-grid" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {loading && levels.length === 0 && <div className="liq-empty">Loading price levels…</div>}
            {levels.map((lv, i) => {
              const isAbove  = lv.price > markPrice;
              const barPct   = Math.round((lv.intensity / maxIntensity) * 100);
              const color    = isAbove ? "#0ecb81" : "#f6465d";
              const isMarkRow = i < levels.length - 1 && levels[i].price > markPrice && levels[i + 1].price < markPrice;
              return (
                <div key={`${lv.leverage}-${lv.side}`}>
                  {isMarkRow && (
                    <div className="liq-mark-line">
                      <span className="liq-mark-price">${fmtPrice(markPrice)}</span>
                      <div className="liq-mark-dash" />
                    </div>
                  )}
                  <div className={`liq-row liq-row--${isAbove ? "short" : "long"}`}>
                    <div className="liq-row-price">${fmtPrice(lv.price)}</div>
                    <div className="liq-bar-wrap">
                      <div className="liq-bar" style={{ width: `${barPct}%`, background: color, opacity: 0.15 + (barPct / 100) * 0.7 }} />
                      <span className="liq-bar-label" style={{ color }}>{fmtUSD(lv.usd)}</span>
                    </div>
                    <div className="liq-row-lev">{lv.leverage}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="liq-footer">Estimated · updates every 20s · Not financial advice</div>
        </div>
      )}
    </div>
  );
}
