import { useState, useCallback, useEffect, useRef } from "react";
import BotChart, { Candle, Signal } from "./BotChart";
import { useBinanceFeed } from "@/hooks/useBinanceFeed";

type Strategy = "grid" | "dca" | "signal";
type Timeframe = "15m" | "1h" | "4h" | "1d";

interface BacktestResult {
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpe: number;
  signals: Signal[];
  equityCurve: number[];
}

interface SymbolOption { value: string; label: string; }

const FALLBACK_SYMBOLS: SymbolOption[] = [
  { value: "BTC",  label: "BTC/USDT" },
  { value: "ETH",  label: "ETH/USDT" },
  { value: "SOL",  label: "SOL/USDT" },
  { value: "ARB",  label: "ARB/USDT" },
  { value: "BNB",  label: "BNB/USDT" },
];

const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];
const TF_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};
const TF_CANDLES: Record<Timeframe, number> = {
  "15m": 96,
  "1h": 120,
  "4h": 90,
  "1d": 180,
};


function computeRSI(candles: Candle[], period = 14): number[] {
  const rsi: number[] = Array(candles.length).fill(50);
  if (candles.length < period + 1) return rsi;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].c - candles[i - 1].c;
    if (d > 0) gainSum += d; else lossSum -= d;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  for (let i = period; i < candles.length; i++) {
    const d = candles[i].c - candles[i - 1].c;
    const gain = d > 0 ? d : 0, loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeEMA(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  candles.forEach((c, i) => {
    ema.push(i === 0 ? c.c : c.c * k + ema[i - 1] * (1 - k));
  });
  return ema;
}

function runBacktest(candles: Candle[], strategy: Strategy, params: Record<string, number>, investment: number): BacktestResult {
  const signals: Signal[] = [];
  const equity: number[] = [investment];
  let cash = investment;
  let position = 0;
  let trades = 0;
  let wins = 0;
  let entryPrice = 0;
  let peak = investment;
  let maxDD = 0;

  const rsi = computeRSI(candles, params.rsiPeriod || 14);
  const emaFast = computeEMA(candles, params.emaFast || 9);
  const emaSlow = computeEMA(candles, params.emaSlow || 21);

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i];
    const portfolioValue = cash + position * c.c;
    equity.push(portfolioValue);
    if (portfolioValue > peak) peak = portfolioValue;
    const dd = (peak - portfolioValue) / peak;
    if (dd > maxDD) maxDD = dd;

    let shouldBuy = false;
    let shouldSell = false;

    if (strategy === "signal") {
      const rsiBuy = params.rsiOversold || 35;
      const rsiSell = params.rsiOverbought || 68;
      shouldBuy = rsi[i] < rsiBuy && emaFast[i] > emaSlow[i] && position === 0;
      shouldSell = (rsi[i] > rsiSell || emaFast[i] < emaSlow[i]) && position > 0;
    } else if (strategy === "grid") {
      const loP = Math.min(...candles.map((c) => c.l));
      const hiP = Math.max(...candles.map((c) => c.h));
      const gridCount = params.grids || 10;
      const step = (hiP - loP) / gridCount;
      const gridLevel = Math.floor((c.c - loP) / step);
      const prevLevel = Math.floor((candles[i - 1].c - loP) / step);
      shouldBuy = gridLevel < prevLevel && position === 0 && cash > c.c * 0.1;
      shouldSell = gridLevel > prevLevel && position > 0;
    } else if (strategy === "dca") {
      const interval = params.intervalCandles || 8;
      shouldBuy = i % interval === 0 && cash >= (params.amountPerBuy || investment * 0.1);
      shouldSell = position > 0 && c.c > entryPrice * 1.05;
    }

    if (shouldBuy && cash > c.c * 0.05) {
      const amount = Math.min(cash * 0.95, params.amountPerBuy || cash * 0.5);
      position += amount / c.c;
      entryPrice = c.c;
      cash -= amount;
      trades++;
      signals.push({ t: c.t, price: c.c, side: "BUY" });
    } else if (shouldSell && position > 0) {
      const proceeds = position * c.c;
      if (proceeds > entryPrice * (position)) wins++;
      cash += proceeds;
      position = 0;
      trades++;
      signals.push({ t: c.t, price: c.c, side: "SELL" });
    }
  }

  const finalValue = cash + position * candles[candles.length - 1].c;
  const totalReturn = finalValue - investment;
  const totalReturnPct = (totalReturn / investment) * 100;
  const winRate = trades > 0 ? (wins / Math.max(1, Math.floor(trades / 2))) * 100 : 0;

  const returns = equity.slice(1).map((v, i) => (v - equity[i]) / equity[i]);
  const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdR = Math.sqrt(returns.reduce((a, r) => a + (r - meanR) ** 2, 0) / returns.length);
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(365) : 0;

  return {
    totalReturn, totalReturnPct,
    totalTrades: trades,
    winRate: Math.min(winRate, 100),
    maxDrawdown: maxDD * 100,
    sharpe,
    signals,
    equityCurve: equity,
  };
}

function EquityCurve({ data, investment }: { data: number[]; investment: number }) {
  if (data.length < 2) return null;
  const W = 800, H = 80;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min) * 0.05 || 1;
  const lo = min - pad, hi = max + pad;
  const n = data.length;
  const pts = data
    .map((v, i) => `${((i / (n - 1)) * (W - 20) + 10).toFixed(1)},${lerp(v, lo, hi, H - 8, 8).toFixed(1)}`)
    .join(" ");
  const areaEnd = `${((1) * (W - 20) + 10).toFixed(1)},${H} 10,${H}`;
  const isProfit = data[data.length - 1] >= investment;
  const color = isProfit ? "#0ecb81" : "#f6465d";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${pts} ${areaEnd}`} fill="url(#eqGrad)" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1={lerp(investment, lo, hi, H - 8, 8)} x2={W - 10} y2={lerp(investment, lo, hi, H - 8, 8)}
        stroke="rgba(180,190,210,0.15)" strokeWidth="1" strokeDasharray="3,3" />
    </svg>
  );
}

function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return ((v - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function useAllMarkets(): { symbols: SymbolOption[]; loading: boolean } {
  const [symbols, setSymbols] = useState<SymbolOption[]>(FALLBACK_SYMBOLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.orderly.org/v1/public/futures")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = data?.data?.rows ?? [];
        if (rows.length === 0) return;
        const opts: SymbolOption[] = rows
          .map((row: any) => {
            const sym: string = row.symbol ?? "";
            const base = sym.replace(/^PERP_/, "").replace(/_USDC$|_USDT$/, "");
            return base ? { value: base, label: `${base}/USDT` } : null;
          })
          .filter(Boolean)
          .sort((a: SymbolOption, b: SymbolOption) => a.value.localeCompare(b.value));
        setSymbols(opts);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { symbols, loading };
}

function SearchableSelect({
  symbols,
  value,
  onChange,
  loading,
}: {
  symbols: SymbolOption[];
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const ref                 = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? symbols.filter((s) =>
        s.value.toLowerCase().includes(query.toLowerCase()) ||
        s.label.toLowerCase().includes(query.toLowerCase())
      )
    : symbols;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const selected = symbols.find((s) => s.value === value);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 150 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...selectSt,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontWeight: 600, color: "#eaecef" }}>
          {selected?.label ?? value + "/USDT"}
        </span>
        <span style={{ color: "rgba(180,190,210,0.4)", fontSize: 10 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          zIndex: 9999,
          background: "rgb(14,17,22)",
          border: "1px solid rgba(56,224,248,0.25)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          minWidth: 200,
          maxHeight: 320,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(30,36,50,1)" }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search token…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(56,224,248,0.2)",
                borderRadius: 5,
                padding: "5px 9px",
                color: "#eaecef",
                fontSize: 13,
                fontFamily: "Manrope, sans-serif",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ overflowY: "auto", maxHeight: 260 }}>
            {loading && (
              <div style={{ padding: "10px 12px", color: "rgba(180,190,210,0.4)", fontSize: 12 }}>
                Loading markets…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "10px 12px", color: "rgba(180,190,210,0.35)", fontSize: 12 }}>
                No results
              </div>
            )}
            {filtered.map((s) => (
              <div
                key={s.value}
                onMouseDown={() => { onChange(s.value); setOpen(false); setQuery(""); }}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: s.value === value ? 700 : 400,
                  color: s.value === value ? "#38e0f8" : "#eaecef",
                  background: s.value === value ? "rgba(56,224,248,0.08)" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = s.value === value ? "rgba(56,224,248,0.08)" : "transparent"; }}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div style={{
            padding: "5px 10px",
            borderTop: "1px solid rgba(30,36,50,1)",
            fontSize: 10,
            color: "rgba(180,190,210,0.3)",
            textAlign: "right",
          }}>
            {filtered.length} / {symbols.length} markets
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  defaultStrategy?: Strategy;
  defaultSymbol?: string;
}

export default function BotBacktest({ defaultStrategy = "signal", defaultSymbol = "BTC" }: Props) {
  const { symbols, loading: marketsLoading } = useAllMarkets();
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [tf, setTf] = useState<Timeframe>("1h");
  const [strategy, setStrategy] = useState<Strategy>(defaultStrategy);
  const [investment, setInvestment] = useState(1000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [realtimeMode, setRealtimeMode] = useState(false);

  const feed = useBinanceFeed(symbol, tf, realtimeMode);

  const [rsiOversold, setRsiOversold] = useState(35);
  const [rsiOverbought, setRsiOverbought] = useState(68);
  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);
  const [grids, setGrids] = useState(10);
  const [dcaInterval, setDcaInterval] = useState(8);
  const [dcaAmount, setDcaAmount] = useState(100);

  useEffect(() => {
    setResult(null);
  }, [symbol, tf]);

  const handleBacktest = useCallback(() => {
    if (feed.candles.length < 20) return;
    setRunning(true);
    const snapshot = [...feed.candles];
    setTimeout(() => {
      const params: Record<string, number> =
        strategy === "signal"
          ? { rsiOversold, rsiOverbought, emaFast, emaSlow }
          : strategy === "grid"
          ? { grids }
          : { intervalCandles: dcaInterval, amountPerBuy: dcaAmount };
      const res = runBacktest(snapshot, strategy, params, investment);
      setResult(res);
      setRunning(false);
    }, 400);
  }, [feed.candles, strategy, rsiOversold, rsiOverbought, emaFast, emaSlow, grids, dcaInterval, dcaAmount, investment]);

  const chartData = feed.candles;
  const chartSignals = result?.signals || [];

  const symInfo = symbols.find((s) => s.value === symbol) || { value: symbol, label: `${symbol}/USDT` };

  const fmtPrice = (p: number | null) => {
    if (!p) return "—";
    if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
  };

  return (
    <div style={{ fontFamily: "Manrope, sans-serif" }}>

      {/* Controls bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <div>
          <label style={labelSt}>
            Symbol
            {marketsLoading && (
              <span style={{ marginLeft: 6, color: "rgba(56,224,248,0.5)", fontWeight: 400 }}>loading…</span>
            )}
            {!marketsLoading && (
              <span style={{ marginLeft: 6, color: "rgba(14,203,129,0.6)", fontWeight: 400 }}>
                {symbols.length} markets
              </span>
            )}
          </label>
          <SearchableSelect
            symbols={symbols}
            value={symbol}
            onChange={setSymbol}
            loading={marketsLoading}
          />
        </div>
        <div>
          <label style={labelSt}>Timeframe</label>
          <div style={{ display: "flex", gap: 4 }}>
            {TIMEFRAMES.map((t) => (
              <button key={t} onClick={() => setTf(t)} style={{
                ...btnSm,
                background: tf === t ? "rgba(56,224,248,0.15)" : "rgb(20,24,30)",
                border: `1px solid ${tf === t ? "rgba(56,224,248,0.4)" : "rgba(30,36,50,1)"}`,
                color: tf === t ? "#38e0f8" : "rgba(180,190,210,0.6)",
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelSt}>Strategy</label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["grid", "dca", "signal"] as Strategy[]).map((s) => (
              <button key={s} onClick={() => setStrategy(s)} style={{
                ...btnSm,
                background: strategy === s ? "rgba(56,224,248,0.12)" : "rgb(20,24,30)",
                border: `1px solid ${strategy === s ? "rgba(56,224,248,0.35)" : "rgba(30,36,50,1)"}`,
                color: strategy === s ? "#38e0f8" : "rgba(180,190,210,0.55)",
                textTransform: "capitalize",
              }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelSt}>Investment ($)</label>
          <input
            type="number" value={investment}
            onChange={(e) => setInvestment(Number(e.target.value))}
            style={{ ...selectSt, width: 90 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "flex-end" }}>
          <button
            onClick={() => setRealtimeMode((v) => !v)}
            style={{
              ...btnSm,
              background: feed.wsConnected ? "rgba(14,203,129,0.12)" : realtimeMode ? "rgba(240,185,11,0.1)" : "rgb(20,24,30)",
              border: `1px solid ${feed.wsConnected ? "rgba(14,203,129,0.35)" : realtimeMode ? "rgba(240,185,11,0.3)" : "rgba(30,36,50,1)"}`,
              color: feed.wsConnected ? "#0ecb81" : realtimeMode ? "#f0b90b" : "rgba(180,190,210,0.55)",
              display: "flex", alignItems: "center", gap: 5, padding: "7px 12px",
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: feed.wsConnected ? "#0ecb81" : realtimeMode ? "#f0b90b" : "rgba(180,190,210,0.3)",
              boxShadow: feed.wsConnected ? "0 0 6px #0ecb81" : "none",
              animation: feed.wsConnected ? "dot-pulse 1.5s ease infinite" : "none",
              display: "inline-block",
            }} />
            {feed.wsConnected ? "Live" : realtimeMode ? "Connecting…" : "Live"}
          </button>
          <button
            onClick={handleBacktest}
            disabled={running || feed.loading || feed.candles.length < 20}
            style={{
              background: (running || feed.loading || feed.candles.length < 20) ? "rgba(56,224,248,0.18)" : "linear-gradient(135deg,#38e0f8,#0ecb81)",
              border: "none", borderRadius: 6, padding: "7px 18px",
              color: "#0b0e11", fontSize: 13, fontWeight: 700,
              cursor: (running || feed.loading || feed.candles.length < 20) ? "not-allowed" : "pointer",
              fontFamily: "Manrope, sans-serif",
            }}
          >
            {running ? "Running..." : feed.loading ? "Loading…" : "▶ Backtest"}
          </button>
        </div>
      </div>

      {/* Strategy params */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {strategy === "signal" && (
          <>
            <ParamInput label="RSI Oversold" value={rsiOversold} min={10} max={50} onChange={setRsiOversold} />
            <ParamInput label="RSI Overbought" value={rsiOverbought} min={50} max={90} onChange={setRsiOverbought} />
            <ParamInput label="EMA Fast" value={emaFast} min={3} max={50} onChange={setEmaFast} />
            <ParamInput label="EMA Slow" value={emaSlow} min={10} max={200} onChange={setEmaSlow} />
          </>
        )}
        {strategy === "grid" && (
          <ParamInput label="Grid Count" value={grids} min={3} max={50} onChange={setGrids} />
        )}
        {strategy === "dca" && (
          <>
            <ParamInput label="Buy every (candles)" value={dcaInterval} min={1} max={100} onChange={setDcaInterval} />
            <ParamInput label="Amount per buy ($)" value={dcaAmount} min={1} max={10000} onChange={setDcaAmount} />
          </>
        )}
      </div>

      {/* Chart */}
      <div className="bot-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid rgba(30,36,50,1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#eaecef" }}>{symInfo.label}</span>
            <span style={{ fontSize: 11, color: "rgba(180,190,210,0.45)", background: "rgba(30,36,50,1)", padding: "2px 6px", borderRadius: 4 }}>
              {tf}
            </span>
            {feed.latestPrice !== null && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "#eaecef", letterSpacing: -0.3 }}>
                ${fmtPrice(feed.latestPrice)}
              </span>
            )}
            {realtimeMode && feed.wsConnected && (
              <span style={{ fontSize: 10, color: "#0ecb81", fontWeight: 700, letterSpacing: 0.5 }}>
                ● LIVE
              </span>
            )}
            {realtimeMode && !feed.wsConnected && (
              <span style={{ fontSize: 10, color: "#f0b90b", fontWeight: 700, letterSpacing: 0.5 }}>
                ◌ CONNECTING
              </span>
            )}
            {feed.loading && (
              <span style={{ fontSize: 10, color: "rgba(180,190,210,0.4)" }}>Loading data…</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {feed.error && (
              <span style={{ fontSize: 10, color: "#f6465d" }}>⚠ {feed.error}</span>
            )}
            {!feed.error && !feed.loading && (
              <span style={{ fontSize: 10, color: "rgba(56,224,248,0.5)", background: "rgba(56,224,248,0.07)", padding: "2px 6px", borderRadius: 4 }}>
                Binance · Real Data
              </span>
            )}
            <span style={{ fontSize: 11, color: "rgba(180,190,210,0.4)" }}>
              {chartData.length} candles{result ? ` · ${result.signals.length} signals` : ""}
            </span>
          </div>
        </div>
        {feed.loading ? (
          <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(180,190,210,0.3)", fontSize: 13 }}>
            <span>Fetching candles from Binance…</span>
          </div>
        ) : (
          <BotChart
            candles={chartData}
            signals={chartSignals}
            height={320}
            showVolume
          />
        )}
      </div>

      {/* Results */}
      {result && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Backtest Results
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              {
                label: "Total Return",
                value: `${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct.toFixed(2)}%`,
                sub: `$${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn.toFixed(2)}`,
                color: result.totalReturnPct >= 0 ? "#0ecb81" : "#f6465d",
              },
              {
                label: "Win Rate",
                value: `${result.winRate.toFixed(1)}%`,
                sub: `${result.totalTrades} trades`,
                color: result.winRate >= 50 ? "#0ecb81" : "#f6465d",
              },
              {
                label: "Max Drawdown",
                value: `-${result.maxDrawdown.toFixed(2)}%`,
                sub: "peak to trough",
                color: result.maxDrawdown > 20 ? "#f6465d" : result.maxDrawdown > 10 ? "#f0b90b" : "#0ecb81",
              },
              {
                label: "Sharpe Ratio",
                value: result.sharpe.toFixed(2),
                sub: "annualized",
                color: result.sharpe >= 1.5 ? "#0ecb81" : result.sharpe >= 0.5 ? "#f0b90b" : "#f6465d",
              },
              {
                label: "Buy Signals",
                value: result.signals.filter((s) => s.side === "BUY").length.toString(),
                sub: "total entries",
                color: "#38e0f8",
              },
              {
                label: "Sell Signals",
                value: result.signals.filter((s) => s.side === "SELL").length.toString(),
                sub: "total exits",
                color: "#38e0f8",
              },
            ].map((stat) => (
              <div key={stat.label} className="bot-card" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "rgba(180,190,210,0.4)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: "rgba(180,190,210,0.4)", marginTop: 2 }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Equity Curve */}
          <div className="bot-card" style={{ padding: 0, overflow: "hidden", marginBottom: 0 }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(30,36,50,1)", fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.5)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Portfolio Value
            </div>
            <div style={{ padding: "8px 16px 12px" }}>
              <EquityCurve data={result.equityCurve} investment={investment} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(180,190,210,0.4)", marginTop: 4 }}>
                <span>${investment.toFixed(0)} (start)</span>
                <span style={{ color: result.totalReturnPct >= 0 ? "#0ecb81" : "#f6465d", fontWeight: 700 }}>
                  ${(investment + result.totalReturn).toFixed(2)} (final)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamInput({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label style={labelSt}>{label}</label>
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ...selectSt, width: 80 }}
      />
    </div>
  );
}

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: "rgba(180,190,210,0.45)", letterSpacing: 0.5,
  textTransform: "uppercase", marginBottom: 5,
};
const selectSt: React.CSSProperties = {
  background: "rgb(20,24,30)", border: "1px solid rgba(30,36,50,1)",
  borderRadius: 6, padding: "7px 10px", color: "#eaecef",
  fontSize: 13, fontFamily: "Manrope, sans-serif", outline: "none",
};
const btnSm: React.CSSProperties = {
  borderRadius: 6, padding: "7px 10px", fontSize: 12,
  fontWeight: 600, cursor: "pointer", fontFamily: "Manrope, sans-serif",
};
