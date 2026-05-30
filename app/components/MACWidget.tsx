import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface KlineRow { close: number; volume: number; start_timestamp: number; }
interface MACSignal {
  symbol: string;
  base: string;
  ema9: number;
  ema21: number;
  signal: "golden" | "death" | "bull" | "bear";
  crossover: boolean;
  pricePct: number;
  volume24h: number;
  oi: number;
}

const LIQUID_SYMBOLS = [
  "PERP_BTC_USDC","PERP_ETH_USDC","PERP_SOL_USDC","PERP_ARB_USDC",
  "PERP_BNB_USDC","PERP_AVAX_USDC","PERP_DOGE_USDC","PERP_SUI_USDC",
  "PERP_LINK_USDC","PERP_OP_USDC","PERP_XAU_USDC","PERP_PEPE_USDC",
];

const OI_MIN = 500_000;
const VOL_MIN = 1_000_000;
const TIMEFRAMES = ["1h", "4h", "1d"] as const;
type TF = typeof TIMEFRAMES[number];

function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return closes.map(() => 0);
  const k = 2 / (period + 1);
  const emas: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  emas.push(sum / period);
  for (let i = period; i < closes.length; i++) {
    emas.push(closes[i] * k + emas[emas.length - 1] * (1 - k));
  }
  return emas;
}

async function fetchKlines(symbol: string, type: TF): Promise<KlineRow[]> {
  try {
    const res = await fetch(
      `https://api.orderly.org/v1/kline?symbol=${symbol}&type=${type}&limit=50`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json?.data?.rows ?? [];
    return rows.map((r: any) => ({
      close: Number(r.close ?? r[4] ?? 0),
      volume: Number(r.volume ?? r[5] ?? 0),
      start_timestamp: Number(r.start_timestamp ?? r[0] ?? 0),
    })).filter((r: KlineRow) => r.close > 0);
  } catch { return []; }
}

async function fetchMarkets(): Promise<Record<string, { oi: number; volume: number; close: number; open: number }>> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "no-store" });
    if (!res.ok) return {};
    const rows: any[] = (await res.json())?.data?.rows ?? [];
    const out: Record<string, any> = {};
    for (const r of rows) {
      out[r.symbol] = {
        oi: Number(r.open_interest ?? 0),
        volume: Number(r["24h_volume"] ?? r.volume ?? 0),
        close: Number(r["24h_close"] ?? 0),
        open: Number(r["24h_open"] ?? 0),
      };
    }
    return out;
  } catch { return {}; }
}

async function computeSignals(tf: TF): Promise<MACSignal[]> {
  const markets = await fetchMarkets();
  const candidates = LIQUID_SYMBOLS.filter(sym => {
    const m = markets[sym];
    return m && m.oi >= OI_MIN && m.volume >= VOL_MIN;
  });

  const results = await Promise.all(
    candidates.map(async (sym) => {
      const klines = await fetchKlines(sym, tf);
      if (klines.length < 22) return null;
      const closes = klines.map(k => k.close);
      const ema9arr = calcEMA(closes, 9);
      const ema21arr = calcEMA(closes, 21);
      const ema9 = ema9arr[ema9arr.length - 1];
      const ema21 = ema21arr[ema21arr.length - 1];
      const prevEma9 = ema9arr[ema9arr.length - 2] ?? ema9;
      const prevEma21 = ema21arr[ema21arr.length - 2] ?? ema21;

      const crossedUp = prevEma9 <= prevEma21 && ema9 > ema21;
      const crossedDown = prevEma9 >= prevEma21 && ema9 < ema21;
      const crossover = crossedUp || crossedDown;

      const signal: MACSignal["signal"] = crossedUp
        ? "golden"
        : crossedDown
        ? "death"
        : ema9 > ema21
        ? "bull"
        : "bear";

      const m = markets[sym];
      const pricePct = m.open > 0 ? ((m.close - m.open) / m.open) * 100 : 0;
      const base = sym.split("_")[1];

      return { symbol: sym, base, ema9, ema21, signal, crossover, pricePct, volume24h: m.volume, oi: m.oi } as MACSignal;
    })
  );

  return (results.filter(Boolean) as MACSignal[]).sort((a, b) => {
    const rank = (s: MACSignal) => (s.crossover ? 2 : 0) + (s.signal === "golden" || s.signal === "bull" ? 1 : 0);
    return rank(b) - rank(a);
  });
}

function fmtVol(v: number) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
  return "$" + (v / 1e3).toFixed(0) + "K";
}

const SIG_CFG = {
  golden: { label: "GOLDEN ✦", color: "#f0b90b", bg: "rgba(240,185,11,0.1)" },
  death:  { label: "DEATH ✦",  color: "#f6465d", bg: "rgba(246,70,93,0.08)" },
  bull:   { label: "BULL",     color: "#0ecb81", bg: "rgba(14,203,129,0.08)" },
  bear:   { label: "BEAR",     color: "#f6465d", bg: "rgba(246,70,93,0.06)" },
};

interface Props { onHide: () => void; }

export default function MACWidget({ onHide }: Props) {
  const [signals, setSignals]   = useState<MACSignal[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [hasNew, setHasNew]     = useState(false);
  const [hovered, setHovered]   = useState(false);
  const [tf, setTf]             = useState<TF>("1h");
  const [filter, setFilter]     = useState<"all" | "crossover" | "bull" | "bear">("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const defaultPos = {
    x: typeof window !== "undefined" ? window.innerWidth - 120 : 1160,
    y: typeof window !== "undefined" ? window.innerHeight - 340 : 240,
  };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } =
    useDraggable("mac-widget", defaultPos);

  const load = async () => {
    setLoading(true);
    const data = await computeSignals(tf);
    setSignals(data);
    setLoading(false);
    if (!open) setHasNew(true);
  };

  useEffect(() => {
    load();
    const interval = tf === "1h" ? 60_000 : tf === "4h" ? 120_000 : 300_000;
    intervalRef.current = setInterval(load, interval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tf]);

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  const crossCount = signals.filter(s => s.crossover).length;
  const filtered = filter === "all" ? signals
    : filter === "crossover" ? signals.filter(s => s.crossover)
    : filter === "bull" ? signals.filter(s => s.signal === "golden" || s.signal === "bull")
    : signals.filter(s => s.signal === "death" || s.signal === "bear");

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

      <button
        className="mac-fab"
        onClick={() => { if (wasDragged()) return; setOpen(v => !v); setHasNew(false); }}
        aria-label="MAC + Liquidity Filter"
      >
        <span className="mac-fab-icon">📈</span>
        {hasNew && crossCount > 0 && (
          <span className="mac-fab-badge">{crossCount}</span>
        )}
      </button>

      {open && (
        <div className="mac-panel" style={{ ...panelStyle, width: 310, maxWidth: "calc(100vw - 24px)" }}>
          <div className="mac-header">
            <div className="mac-header-left">
              <span style={{ fontSize: 14 }}>📈</span>
              <div>
                <div className="mac-title">MAC + Liquidity</div>
                <div className="mac-sub">EMA 9/21 crossover · liquid markets only</div>
              </div>
            </div>
            {crossCount > 0 && (
              <div className="mac-cross-badge">{crossCount} cross</div>
            )}
          </div>

          {/* Timeframe + filter controls */}
          <div className="mac-controls" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <div className="mac-tf-group">
              {TIMEFRAMES.map(t => (
                <button key={t} className={`mac-tf-btn ${tf === t ? "mac-tf-btn--active" : ""}`} onClick={() => setTf(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="mac-filter-group">
              {(["all", "crossover", "bull", "bear"] as const).map(f => (
                <button key={f} className={`mac-filter-btn ${filter === f ? "mac-filter-btn--active" : ""}`} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "crossover" ? "✦ Cross" : f === "bull" ? "▲" : "▼"}
                </button>
              ))}
            </div>
          </div>

          <div className="mac-legend">
            <span style={{ color: "#f0b90b" }}>✦</span> Golden/Death = fresh crossover &nbsp;·&nbsp; Liq: OI &gt; $500K
          </div>

          <div className="mac-list" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {loading && signals.length === 0 && <div className="mac-empty">Calculating MA crossovers…</div>}
            {!loading && filtered.length === 0 && <div className="mac-empty">No signals match this filter</div>}
            {filtered.map(s => {
              const cfg = SIG_CFG[s.signal];
              const spread = s.ema9 !== 0 ? ((s.ema9 - s.ema21) / s.ema21 * 100) : 0;
              return (
                <div key={s.symbol} className="mac-row" style={{ borderLeft: `2px solid ${cfg.color}40` }}>
                  <div className="mac-row-left">
                    <span className="mac-base">{s.base}</span>
                    <span className="mac-sig-badge" style={{ color: cfg.color, background: cfg.bg }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="mac-row-right">
                    <div className="mac-row-stats">
                      <span style={{ fontSize: 11, fontWeight: 700, color: s.pricePct >= 0 ? "#0ecb81" : "#f6465d" }}>
                        {s.pricePct >= 0 ? "+" : ""}{s.pricePct.toFixed(2)}%
                      </span>
                      <span style={{ fontSize: 9, color: "rgba(180,190,210,0.4)", margin: "0 2px" }}>·</span>
                      <span style={{ fontSize: 10, color: spread >= 0 ? "rgba(14,203,129,0.7)" : "rgba(246,70,93,0.7)" }}>
                        Δ{spread >= 0 ? "+" : ""}{spread.toFixed(2)}%
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(180,190,210,0.4)" }}>
                      Vol {fmtVol(s.volume24h)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mac-footer">
            EMA9 vs EMA21 · liquid filter · updates auto · Not financial advice
          </div>
        </div>
      )}
    </div>
  );
}
