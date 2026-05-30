import {
  useState,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { useAccount, useCollateral, useOrderEntry } from "@orderly.network/hooks";
import { OrderSide, OrderType } from "@orderly.network/types";
import { useBinanceFeed } from "@/hooks/useBinanceFeed";
import type { Candle } from "@/components/BotChart";

const BotBacktest = lazy(() => import("@/components/BotBacktest"));

type BotStrategy = "grid" | "dca" | "signal";
type BotStatus = "running" | "stopped" | "paused";

interface BotConfig {
  id: string;
  name: string;
  strategy: BotStrategy;
  symbol: string;
  investment: number;
  status: BotStatus;
  pnl: number;
  pnlPct: number;
  trades: number;
  createdAt: number;
  params: Record<string, string | number>;
  liveMode: boolean;
}

interface TradeLog {
  id: string;
  botId: string;
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  price: number;
  ts: number;
  live?: boolean;
  orderId?: string;
}

interface PendingOrder {
  botId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: string;
  triggerPrice: number;
}

const STORAGE_KEY = "frostdex_bots_v1";
const LOGS_KEY = "frostdex_bot_logs_v1";

const POPULAR_SYMBOLS = [
  "PERP_BTC_USDC",
  "PERP_ETH_USDC",
  "PERP_SOL_USDC",
  "PERP_ARB_USDC",
  "PERP_BNB_USDC",
  "PERP_MATIC_USDC",
  "PERP_AVAX_USDC",
  "PERP_DOGE_USDC",
  "PERP_LINK_USDC",
  "PERP_OP_USDC",
  "PERP_XAU_USDC",
  "PERP_XAG_USDC",
  "PERP_CL_USDC",
  "PERP_NATGAS_USDC_arthur",
];

const SYMBOL_DISPLAY_MAP: Record<string, string> = {
  "PERP_XAU_USDC":           "XAU/USDC",
  "PERP_XAG_USDC":           "XAG/USDC",
  "PERP_CL_USDC":            "OIL/USDC",
  "PERP_NATGAS_USDC_arthur": "GAS/USDC",
};

const BASE_SYMBOL_MAP: Record<string, string> = {
  "PERP_XAU_USDC":           "XAU",
  "PERP_XAG_USDC":           "XAG",
  "PERP_CL_USDC":            "CL",
  "PERP_NATGAS_USDC_arthur": "NATGAS",
};

function symbolDisplay(s: string) {
  if (SYMBOL_DISPLAY_MAP[s]) return SYMBOL_DISPLAY_MAP[s];
  const m = s.match(/^PERP_(.+?)_USDC/);
  return m ? `${m[1]}/USDC` : s;
}

function getBaseSymbol(s: string) {
  if (BASE_SYMBOL_MAP[s]) return BASE_SYMBOL_MAP[s];
  const m = s.match(/^PERP_(.+?)_USDC/);
  return m ? m[1] : s;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function computeRSI(candles: Candle[], period = 14): number[] {
  const rsi: number[] = Array(candles.length).fill(50);
  if (candles.length < period + 1) return rsi;
  let gainSum = 0,
    lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].c - candles[i - 1].c;
    if (d > 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period,
    avgLoss = lossSum / period;
  for (let i = period; i < candles.length; i++) {
    const d = candles[i].c - candles[i - 1].c;
    const gain = d > 0 ? d : 0,
      loss = d < 0 ? -d : 0;
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

const STRATEGY_INFO: Record<
  BotStrategy,
  { label: string; desc: string; icon: string; color: string }
> = {
  grid: {
    label: "Grid Bot",
    desc: "Buys low, sells high inside a price range. Best for sideways markets.",
    icon: "⊞",
    color: "#38e0f8",
  },
  dca: {
    label: "DCA Bot",
    desc: "Invests a fixed amount at regular intervals to average entry price.",
    icon: "↻",
    color: "#0ecb81",
  },
  signal: {
    label: "Signal Bot",
    desc: "Trades on RSI + EMA crossover signals for momentum-based entries.",
    icon: "◈",
    color: "#f0b90b",
  },
};

// ── Live Order Submitter ──────────────────────────────────────────────────────
// Renders briefly to place one real market order on Orderly, then calls onDone.
function OrderSubmitter({
  pending,
  onDone,
}: {
  pending: PendingOrder;
  onDone: (result: { success: boolean; orderId?: string }) => void;
}) {
  const { submit } = useOrderEntry(
    pending.symbol,
    {
      initialOrder: {
        side: pending.side === "BUY" ? OrderSide.BUY : OrderSide.SELL,
        order_type: OrderType.MARKET,
        order_quantity: pending.qty,
      },
      watchOrderbook: false,
    } as any
  );

  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || !submit) return;
    submitted.current = true;
    Promise.resolve()
      .then(() => (submit as () => Promise<any>)())
      .then((res: any) => {
        if (res instanceof Error) {
          onDone({ success: false });
        } else {
          onDone({ success: true, orderId: res?.order_id || res?.data?.order_id });
        }
      })
      .catch(() => onDone({ success: false }));
  }, [submit, onDone]);

  return null;
}

// ── Bot Live Engine ───────────────────────────────────────────────────────────
// Headless component: monitors real price + places real orders when signals fire.
function BotLiveEngine({
  bot,
  onTradeExecuted,
}: {
  bot: BotConfig;
  onTradeExecuted: (log: Omit<TradeLog, "id">) => void;
}) {
  const { state: accountState } = useAccount();
  const { freeCollateral } = useCollateral() as { freeCollateral: number };
  const feed = useBinanceFeed(getBaseSymbol(bot.symbol), "15m", true);

  const inPositionRef = useRef(false);
  const entryPriceRef = useRef(0);
  const lastEvalRef = useRef(0);
  const dcaCycleRef = useRef(0);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);

  useEffect(() => {
    if (bot.status !== "running") return;
    if (!accountState?.accountId) return;
    if (!feed.latestPrice || feed.candles.length < 22) return;

    const now = Date.now();
    if (now - lastEvalRef.current < 20_000) return;
    lastEvalRef.current = now;

    const price = feed.latestPrice;
    const candles = feed.candles;
    const investment = bot.investment;

    const minQty = 0.001;
    const buyQty = Math.max(minQty, (investment * 0.5) / price);
    const qtyStr = buyQty.toFixed(6);

    let shouldBuy = false;
    let shouldSell = false;

    if (bot.strategy === "signal") {
      const rsiPeriod = Number(bot.params.rsi) || 14;
      const emaPeriod = Number(bot.params.ema) || 20;
      const rsi = computeRSI(candles, rsiPeriod);
      const emaFast = computeEMA(candles, 9);
      const emaSlow = computeEMA(candles, emaPeriod);
      const last = candles.length - 1;
      shouldBuy =
        rsi[last] < 35 &&
        emaFast[last] > emaSlow[last] &&
        !inPositionRef.current;
      shouldSell =
        (rsi[last] > 68 || emaFast[last] < emaSlow[last]) &&
        inPositionRef.current;
    } else if (bot.strategy === "grid") {
      const grids = Number(bot.params.grids) || 10;
      const prices = candles.map((c) => c.c);
      const loP = Math.min(...prices);
      const hiP = Math.max(...prices);
      const step = (hiP - loP) / grids;
      const last = candles.length - 1;
      const curLevel = Math.floor((price - loP) / step);
      const prevLevel = Math.floor((candles[last - 1].c - loP) / step);
      shouldBuy = curLevel < prevLevel && !inPositionRef.current;
      shouldSell = curLevel > prevLevel && inPositionRef.current;
    } else if (bot.strategy === "dca") {
      const intervalMs =
        ({
          "15m": 15 * 60 * 1000,
          "30m": 30 * 60 * 1000,
          "1h": 60 * 60 * 1000,
          "4h": 4 * 60 * 60 * 1000,
          "8h": 8 * 60 * 60 * 1000,
          "12h": 12 * 60 * 60 * 1000,
          "1d": 24 * 60 * 60 * 1000,
        } as Record<string, number>)[String(bot.params.interval)] ||
        60 * 60 * 1000;
      dcaCycleRef.current += 1;
      const intervalsPerCycle = Math.max(1, Math.round(intervalMs / 20_000));
      shouldBuy = dcaCycleRef.current % intervalsPerCycle === 0;
      shouldSell =
        inPositionRef.current && price > entryPriceRef.current * 1.05;
    }

    if (shouldBuy && !pendingOrder) {
      inPositionRef.current = true;
      entryPriceRef.current = price;
      setPendingOrder({
        botId: bot.id,
        symbol: bot.symbol,
        side: "BUY",
        qty: qtyStr,
        triggerPrice: price,
      });
    } else if (shouldSell && !pendingOrder) {
      inPositionRef.current = false;
      const sellQty = Math.max(minQty, (investment * 0.5) / price);
      setPendingOrder({
        botId: bot.id,
        symbol: bot.symbol,
        side: "SELL",
        qty: sellQty.toFixed(6),
        triggerPrice: price,
      });
    }
  }, [feed.latestPrice, feed.candles, bot, accountState, pendingOrder]);

  if (pendingOrder) {
    return (
      <OrderSubmitter
        pending={pendingOrder}
        onDone={(result) => {
          if (result.success) {
            onTradeExecuted({
              botId: bot.id,
              side: pendingOrder.side,
              symbol: bot.symbol,
              qty: parseFloat(pendingOrder.qty),
              price: pendingOrder.triggerPrice,
              ts: Date.now(),
              live: true,
              orderId: result.orderId,
            });
          }
          setPendingOrder(null);
        }}
      />
    );
  }

  return null;
}

// ── Main Bot Page ─────────────────────────────────────────────────────────────
export default function BotPage() {
  const { state: accountState } = useAccount();
  const { freeCollateral } = useCollateral() as { freeCollateral: number };

  const [bots, setBots] = useState<BotConfig[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [logs, setLogs] = useState<TradeLog[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [tab, setTab] = useState<"bots" | "create" | "logs" | "backtest">(
    "bots"
  );
  const [allSymbols, setAllSymbols] = useState<string[]>(POPULAR_SYMBOLS);
  const [strategy, setStrategy] = useState<BotStrategy>("grid");
  const [symbol, setSymbol] = useState("PERP_BTC_USDC");
  const [investment, setInvestment] = useState("500");
  const [botName, setBotName] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [creating, setCreating] = useState(false);

  const [gridUpper, setGridUpper] = useState("");
  const [gridLower, setGridLower] = useState("");
  const [gridCount, setGridCount] = useState("10");
  const [dcaInterval, setDcaInterval] = useState("1h");
  const [dcaAmount, setDcaAmount] = useState("50");
  const [sigRsi, setSigRsi] = useState("14");
  const [sigEma, setSigEma] = useState("20");

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConnected = !!accountState?.accountId;

  const saveBots = useCallback((updated: BotConfig[]) => {
    setBots(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const saveLogs = useCallback((updated: TradeLog[]) => {
    setLogs(updated);
    localStorage.setItem(LOGS_KEY, JSON.stringify(updated));
  }, []);

  // Fetch all available Orderly perp markets
  useEffect(() => {
    fetch("https://api.orderly.org/v1/public/futures")
      .then((r) => r.json())
      .then((data) => {
        const syms: string[] = (data?.data?.rows ?? [])
          .map((r: any) => r.symbol as string)
          .filter(Boolean)
          .sort((a: string, b: string) => {
            const priority = ["PERP_BTC_USDC","PERP_ETH_USDC","PERP_SOL_USDC","PERP_ARB_USDC","PERP_BNB_USDC"];
            const ai = priority.indexOf(a), bi = priority.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
          });
        if (syms.length > 0) setAllSymbols(syms);
      })
      .catch(() => {});
  }, []);

  // Simulate PnL for non-live running bots
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setBots((prev) => {
        const updated = prev.map((bot) => {
          if (bot.status !== "running" || bot.liveMode) return bot;
          const delta = (Math.random() - 0.47) * (bot.investment * 0.002);
          const newPnl = bot.pnl + delta;
          const newPct = (newPnl / bot.investment) * 100;
          return { ...bot, pnl: newPnl, pnlPct: newPct };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }, 3000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  const handleTradeExecuted = useCallback(
    (log: Omit<TradeLog, "id">) => {
      const entry: TradeLog = { ...log, id: generateId() };
      setLogs((prev) => {
        const updated = [entry, ...prev.slice(0, 199)];
        localStorage.setItem(LOGS_KEY, JSON.stringify(updated));
        return updated;
      });
      setBots((prev) => {
        const updated = prev.map((b) =>
          b.id === log.botId ? { ...b, trades: b.trades + 1 } : b
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const handleCreate = () => {
    setCreating(true);
    const willUseLive = liveMode && isConnected;
    setTimeout(() => {
      const params: Record<string, string | number> =
        strategy === "grid"
          ? {
              upper: gridUpper || "auto",
              lower: gridLower || "auto",
              grids: Number(gridCount),
            }
          : strategy === "dca"
          ? { interval: dcaInterval, amount: Number(dcaAmount) }
          : { rsi: Number(sigRsi), ema: Number(sigEma) };

      const newBot: BotConfig = {
        id: generateId(),
        name:
          botName ||
          `${STRATEGY_INFO[strategy].label} #${generateId().slice(0, 4)}`,
        strategy,
        symbol,
        investment: Number(investment),
        status: "running",
        pnl: 0,
        pnlPct: 0,
        trades: 0,
        createdAt: Date.now(),
        params,
        liveMode: willUseLive,
      };
      saveBots([newBot, ...bots]);
      setCreating(false);
      setBotName("");
      setInvestment("500");
      setTab("bots");
    }, 1200);
  };

  const toggleBot = (id: string) => {
    saveBots(
      bots.map((b) =>
        b.id === id
          ? {
              ...b,
              status: b.status === "running" ? "stopped" : "running",
            }
          : b
      )
    );
  };

  const deleteBot = (id: string) => {
    saveBots(bots.filter((b) => b.id !== id));
  };

  const totalInvestment = bots.reduce((s, b) => s + b.investment, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const runningCount = bots.filter((b) => b.status === "running").length;
  const liveCount = bots.filter((b) => b.status === "running" && b.liveMode).length;

  const investmentNum = Number(investment);
  const balanceWarning =
    isConnected &&
    freeCollateral != null &&
    investmentNum > 0 &&
    investmentNum > (freeCollateral ?? 0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "rgb(11, 14, 17)",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* Live engines — one per running live bot */}
      {bots
        .filter((b) => b.status === "running" && b.liveMode && isConnected)
        .map((bot) => (
          <BotLiveEngine
            key={bot.id}
            bot={bot}
            onTradeExecuted={handleTradeExecuted}
          />
        ))}

      {/* Hero Header with FrostDex background */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "0 0 20px 20px",
          marginBottom: 24,
          minHeight: 180,
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Background image */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/bot-bg.png)",
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            backgroundRepeat: "no-repeat",
            opacity: 0.18,
            filter: "blur(1px)",
          }}
        />
        {/* Dark gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(11,14,17,0.85) 0%, rgba(11,14,17,0.6) 50%, rgba(11,14,17,0.85) 100%)",
          }}
        />
        {/* Cyan glow bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(56,224,248,0.5) 50%, transparent 100%)",
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, padding: "28px 24px 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 32 }}>🤖</span>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                fontFamily: "Manrope, sans-serif",
                background: "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                margin: 0,
              }}
            >
              AI Trading Bot
            </h1>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1.5px solid rgba(46,204,113,0.55)",
                borderRadius: 8,
                padding: "2px 8px",
                background: "rgba(56,224,248,0.05)",
                boxShadow: "0 0 14px rgba(56,224,248,0.22), 0 0 6px rgba(14,203,129,0.18)",
              }}
            >
              <img
                src="/frostdex-badge.png"
                alt="FrostDex"
                style={{ height: 28, objectFit: "contain", display: "block" }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <p
              style={{
                color: "rgba(180,190,210,0.65)",
                fontSize: 13,
                margin: 0,
              }}
            >
              Automated trading strategies —
            </p>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#38e0f8",
                letterSpacing: 0.5,
                fontFamily: "Manrope, sans-serif",
                textShadow: "0 0 12px rgba(56,224,248,0.6)",
              }}
            >
              ❄ Powered by FrostDex
            </span>
          {liveCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                color: "#0ecb81",
                background: "rgba(14,203,129,0.1)",
                border: "1px solid rgba(14,203,129,0.25)",
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#0ecb81",
                  boxShadow: "0 0 6px #0ecb81",
                  animation: "dot-pulse 1.5s ease infinite",
                  display: "inline-block",
                }}
              />
              {liveCount} bot{liveCount > 1 ? "s" : ""} trading live
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
          padding: "0 16px",
        }}
      >
        {[
          {
            label: "Active Bots",
            value: runningCount,
            suffix: "",
            color: "#0ecb81",
          },
          {
            label: "Live Bots",
            value: liveCount,
            suffix: "",
            color: "#38e0f8",
          },
          {
            label: "Total Invested",
            value: totalInvestment.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            prefix: "$",
            color: "#eaecef",
          },
          {
            label: "Total P&L",
            value:
              (totalPnl >= 0 ? "+" : "") + totalPnl.toFixed(2),
            prefix: "$",
            color: totalPnl >= 0 ? "#0ecb81" : "#f6465d",
          },
          {
            label: "Free Collateral",
            value: isConnected
              ? (freeCollateral ?? 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—",
            prefix: isConnected ? "$" : "",
            color: "#eaecef",
          },
        ].map((stat) => (
          <div key={stat.label} className="bot-card" style={{ padding: "16px 20px" }}>
            <div
              style={{
                fontSize: 11,
                color: "rgba(180,190,210,0.5)",
                fontWeight: 600,
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{ fontSize: 20, fontWeight: 700, color: stat.color }}
            >
              {(stat as any).prefix}{stat.value}{(stat as any).suffix}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "1px solid rgba(30,36,50,1)",
          paddingBottom: 0,
          overflowX: "auto",
          padding: "0 16px",
        }}
      >
        {(["bots", "create", "backtest", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "Manrope, sans-serif",
              color:
                tab === t ? "#38e0f8" : "rgba(180,190,210,0.5)",
              borderBottom:
                tab === t
                  ? "2px solid #38e0f8"
                  : "2px solid transparent",
              marginBottom: -1,
              whiteSpace: "nowrap",
              transition: "color 0.15s ease",
            }}
          >
            {t === "bots"
              ? `My Bots (${bots.length})`
              : t === "create"
              ? "+ Create Bot"
              : t === "backtest"
              ? "📊 Backtest"
              : `Trade History (${logs.length})`}
          </button>
        ))}
      </div>

      {/* ── Tab: My Bots ──────────────────────────────────────────────── */}
      {tab === "bots" && (
        <div style={{ padding: "0 16px" }}>
          {bots.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: "64px 24px",
                color: "rgba(180,190,210,0.4)",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 48 }}>🤖</span>
              <div style={{ fontSize: 16, fontWeight: 600 }}>No bots yet</div>
              <div style={{ fontSize: 13 }}>
                Create your first automated trading bot
              </div>
              <button
                onClick={() => setTab("create")}
                style={{
                  background:
                    "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 24px",
                  color: "#0b0e11",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                Create Bot
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bots.map((bot) => {
                const info = STRATEGY_INFO[bot.strategy];
                const isRunning = bot.status === "running";
                const isLive = bot.liveMode;
                const botLogs = logs.filter((l) => l.botId === bot.id);
                return (
                  <div key={bot.id} className="bot-card">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: `rgba(${
                              info.color === "#38e0f8"
                                ? "56,224,248"
                                : info.color === "#0ecb81"
                                ? "14,203,129"
                                : "240,185,11"
                            },0.12)`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            flexShrink: 0,
                          }}
                        >
                          {info.icon}
                        </div>
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 15,
                                color: "#eaecef",
                              }}
                            >
                              {bot.name}
                            </span>
                            <span
                              className={`bot-status-dot ${
                                isRunning ? "running" : "stopped"
                              }`}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                color: isRunning
                                  ? "#0ecb81"
                                  : "rgba(180,190,210,0.4)",
                                fontWeight: 600,
                              }}
                            >
                              {isRunning ? "RUNNING" : "STOPPED"}
                            </span>
                            {isLive && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "1px 7px",
                                  borderRadius: 4,
                                  background: "rgba(14,203,129,0.12)",
                                  color: "#0ecb81",
                                  border: "1px solid rgba(14,203,129,0.25)",
                                  letterSpacing: 0.5,
                                }}
                              >
                                ● LIVE
                              </span>
                            )}
                            {!isLive && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "1px 7px",
                                  borderRadius: 4,
                                  background: "rgba(180,190,210,0.06)",
                                  color: "rgba(180,190,210,0.4)",
                                  letterSpacing: 0.5,
                                }}
                              >
                                SIMULATION
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(180,190,210,0.5)",
                              marginTop: 2,
                            }}
                          >
                            {info.label} · {symbolDisplay(bot.symbol)} · $
                            {bot.investment.toLocaleString()} · {botLogs.length} trades
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color:
                                bot.pnl >= 0 ? "#0ecb81" : "#f6465d",
                            }}
                          >
                            {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toFixed(2)}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color:
                                bot.pnlPct >= 0 ? "#0ecb81" : "#f6465d",
                              fontWeight: 600,
                            }}
                          >
                            {bot.pnlPct >= 0 ? "+" : ""}
                            {bot.pnlPct.toFixed(2)}%
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => toggleBot(bot.id)}
                            style={{
                              background: isRunning
                                ? "rgba(246,70,93,0.1)"
                                : "rgba(14,203,129,0.1)",
                              border: `1px solid ${
                                isRunning
                                  ? "rgba(246,70,93,0.25)"
                                  : "rgba(14,203,129,0.25)"
                              }`,
                              borderRadius: 6,
                              color: isRunning ? "#f6465d" : "#0ecb81",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "6px 12px",
                              fontFamily: "Manrope, sans-serif",
                            }}
                          >
                            {isRunning ? "Stop" : "Start"}
                          </button>
                          <button
                            onClick={() => deleteBot(bot.id)}
                            style={{
                              background: "none",
                              border: "1px solid rgba(30,36,50,1)",
                              borderRadius: 6,
                              color: "rgba(180,190,210,0.4)",
                              cursor: "pointer",
                              fontSize: 12,
                              padding: "6px 10px",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Params */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginTop: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      {Object.entries(bot.params).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 11 }}>
                          <span
                            style={{
                              color: "rgba(180,190,210,0.4)",
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            {k}:{" "}
                          </span>
                          <span
                            style={{ color: "#eaecef", fontWeight: 600 }}
                          >
                            {String(v)}
                          </span>
                        </div>
                      ))}
                      <div style={{ fontSize: 11 }}>
                        <span
                          style={{
                            color: "rgba(180,190,210,0.4)",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          created:{" "}
                        </span>
                        <span
                          style={{ color: "#eaecef", fontWeight: 600 }}
                        >
                          {new Date(bot.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Create Bot ────────────────────────────────────────────── */}
      {tab === "create" && (
        <div style={{ maxWidth: 600 }}>
          {/* Strategy Picker */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Strategy</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {(["grid", "dca", "signal"] as BotStrategy[]).map((s) => {
                const info = STRATEGY_INFO[s];
                const selected = strategy === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStrategy(s)}
                    style={{
                      background: selected
                        ? `rgba(${
                            info.color === "#38e0f8"
                              ? "56,224,248"
                              : info.color === "#0ecb81"
                              ? "14,203,129"
                              : "240,185,11"
                          },0.1)`
                        : "rgb(20,24,30)",
                      border: `1px solid ${
                        selected ? info.color : "rgba(30,36,50,1)"
                      }`,
                      borderRadius: 10,
                      padding: "14px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      fontFamily: "Manrope, sans-serif",
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>
                      {info.icon}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: selected ? info.color : "#eaecef",
                      }}
                    >
                      {info.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(180,190,210,0.5)",
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {info.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Portfolio Balance */}
          {isConnected && (
            <div
              style={{
                background: "rgba(56,224,248,0.06)",
                border: "1px solid rgba(56,224,248,0.15)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(56,224,248,0.7)",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  Your Portfolio — Available to Trade
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#38e0f8",
                  }}
                >
                  $
                  {(freeCollateral ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "rgba(56,224,248,0.6)",
                    }}
                  >
                    USDC
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (freeCollateral && freeCollateral > 0) {
                    setInvestment(
                      Math.floor(freeCollateral * 0.8).toString()
                    );
                  }
                }}
                style={{
                  background: "rgba(56,224,248,0.1)",
                  border: "1px solid rgba(56,224,248,0.2)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  color: "#38e0f8",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                Use 80%
              </button>
            </div>
          )}

          {/* Basic Settings */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div>
              <label style={labelStyle}>Bot Name (optional)</label>
              <input
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder={`My ${STRATEGY_INFO[strategy].label}`}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                style={inputStyle}
              >
                {allSymbols.map((s) => (
                  <option key={s} value={s}>
                    {symbolDisplay(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                Investment (USDC)
                {isConnected && freeCollateral != null && (
                  <span
                    style={{
                      marginLeft: 6,
                      color: "rgba(56,224,248,0.5)",
                      fontWeight: 500,
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    max ${(freeCollateral ?? 0).toFixed(2)}
                  </span>
                )}
              </label>
              <input
                type="number"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                placeholder="500"
                min="10"
                style={{
                  ...inputStyle,
                  borderColor: balanceWarning
                    ? "rgba(246,70,93,0.5)"
                    : "rgba(30,36,50,1)",
                }}
              />
              {balanceWarning && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#f6465d",
                    marginTop: 4,
                  }}
                >
                  ⚠ Exceeds available balance (${(freeCollateral ?? 0).toFixed(2)} free)
                </div>
              )}
            </div>
          </div>

          {/* Strategy-specific params */}
          {strategy === "grid" && (
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabelStyle}>Grid Parameters</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelStyle}>Upper Price</label>
                  <input
                    value={gridUpper}
                    onChange={(e) => setGridUpper(e.target.value)}
                    placeholder="Auto"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Lower Price</label>
                  <input
                    value={gridLower}
                    onChange={(e) => setGridLower(e.target.value)}
                    placeholder="Auto"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Grid Count</label>
                  <input
                    type="number"
                    value={gridCount}
                    onChange={(e) => setGridCount(e.target.value)}
                    min="3"
                    max="200"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(180,190,210,0.4)",
                  lineHeight: 1.5,
                }}
              >
                💡 Leave Upper/Lower empty for auto range detection based on
                current volatility.
              </div>
            </div>
          )}

          {strategy === "dca" && (
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabelStyle}>DCA Parameters</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelStyle}>Buy Interval</label>
                  <select
                    value={dcaInterval}
                    onChange={(e) => setDcaInterval(e.target.value)}
                    style={inputStyle}
                  >
                    {["15m", "30m", "1h", "4h", "8h", "12h", "1d", "3d", "1w"].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Amount per Buy (USDC)</label>
                  <input
                    type="number"
                    value={dcaAmount}
                    onChange={(e) => setDcaAmount(e.target.value)}
                    min="1"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(180,190,210,0.4)",
                  lineHeight: 1.5,
                }}
              >
                💡 DCA reduces volatility impact by spreading purchases over
                time.
              </div>
            </div>
          )}

          {strategy === "signal" && (
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabelStyle}>Signal Parameters</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label style={labelStyle}>RSI Period</label>
                  <input
                    type="number"
                    value={sigRsi}
                    onChange={(e) => setSigRsi(e.target.value)}
                    min="2"
                    max="50"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>EMA Period</label>
                  <input
                    type="number"
                    value={sigEma}
                    onChange={(e) => setSigEma(e.target.value)}
                    min="5"
                    max="200"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(180,190,210,0.4)",
                  lineHeight: 1.5,
                }}
              >
                💡 Buys when RSI &lt; 35 + EMA crossover confirmed, sells
                when RSI &gt; 68.
              </div>
            </div>
          )}

          {/* Live Mode Toggle */}
          <div
            style={{
              background: liveMode
                ? "rgba(14,203,129,0.06)"
                : "rgba(20,24,30,1)",
              border: `1px solid ${
                liveMode
                  ? "rgba(14,203,129,0.25)"
                  : "rgba(30,36,50,1)"
              }`,
              borderRadius: 8,
              padding: "14px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: liveMode ? "#0ecb81" : "#eaecef",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {liveMode && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#0ecb81",
                      boxShadow: "0 0 6px #0ecb81",
                      display: "inline-block",
                    }}
                  />
                )}
                {liveMode ? "Live Trading Mode" : "Simulation Mode"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(180,190,210,0.5)",
                  lineHeight: 1.5,
                }}
              >
                {liveMode
                  ? isConnected
                    ? "Real orders will be placed on Orderly Network using your portfolio."
                    : "⚠ Connect your wallet first to use live trading."
                  : "Bot runs in simulation mode — no real orders are placed."}
              </div>
            </div>
            <button
              onClick={() => setLiveMode((v) => !v)}
              style={{
                flexShrink: 0,
                width: 44,
                height: 24,
                borderRadius: 12,
                border: "none",
                background: liveMode
                  ? "#0ecb81"
                  : "rgba(30,36,50,1)",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: liveMode ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s ease",
                  display: "block",
                }}
              />
            </button>
          </div>

          {/* Risk Warning */}
          <div
            style={{
              background: "rgba(246,70,93,0.06)",
              border: "1px solid rgba(246,70,93,0.15)",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 12,
              color: "rgba(246,70,93,0.8)",
              lineHeight: 1.5,
            }}
          >
            ⚠️ Trading bots involve financial risk. Only invest what you can
            afford to lose. Past performance does not guarantee future results.
          </div>

          <button
            onClick={handleCreate}
            disabled={
              creating ||
              !investment ||
              Number(investment) <= 0 ||
              (liveMode && !isConnected)
            }
            style={{
              width: "100%",
              padding: "14px",
              background:
                creating ||
                (liveMode && !isConnected)
                  ? "rgba(56,224,248,0.3)"
                  : "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)",
              border: "none",
              borderRadius: 8,
              color: "#0b0e11",
              fontSize: 15,
              fontWeight: 700,
              cursor:
                creating || (liveMode && !isConnected)
                  ? "not-allowed"
                  : "pointer",
              fontFamily: "Manrope, sans-serif",
              letterSpacing: 0.3,
              transition: "opacity 0.15s ease",
            }}
          >
            {creating
              ? "Creating Bot..."
              : liveMode && !isConnected
              ? "Connect Wallet to Use Live Mode"
              : `🚀 Launch ${STRATEGY_INFO[strategy].label}${
                  liveMode ? " (Live)" : " (Simulation)"
                }`}
          </button>
        </div>
      )}

      {/* ── Tab: Trade History ─────────────────────────────────────────── */}
      {tab === "logs" && (
        <div>
          {/* Link to full Orderly history */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(180,190,210,0.5)" }}>
              Bot trade history · {logs.length} executions
              {logs.filter((l) => l.live).length > 0 && (
                <span style={{ marginLeft: 8, color: "#0ecb81", fontWeight: 600 }}>
                  ({logs.filter((l) => l.live).length} live)
                </span>
              )}
            </div>
            <a
              href="/portfolio/history"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#38e0f8",
                textDecoration: "none",
                background: "rgba(56,224,248,0.08)",
                border: "1px solid rgba(56,224,248,0.2)",
                borderRadius: 6,
                padding: "5px 12px",
              }}
            >
              Full Trade History →
            </a>
          </div>

          {logs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "64px 24px",
                color: "rgba(180,190,210,0.35)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                No trade history yet
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Start a bot in Live Mode to see real executed trades here
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 130px 100px 110px 90px 120px",
                  gap: 8,
                  padding: "8px 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(180,190,210,0.4)",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  borderBottom: "1px solid rgba(30,36,50,1)",
                }}
              >
                <div>Bot</div>
                <div>Side</div>
                <div>Symbol</div>
                <div style={{ textAlign: "right" }}>Qty</div>
                <div style={{ textAlign: "right" }}>Price</div>
                <div>Mode</div>
                <div style={{ textAlign: "right" }}>Time</div>
              </div>
              {logs.slice(0, 100).map((log) => {
                const bot = bots.find((b) => b.id === log.botId);
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 130px 100px 110px 90px 120px",
                      gap: 8,
                      padding: "10px 16px",
                      fontSize: 13,
                      borderBottom: "1px solid rgba(30,36,50,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ color: "#eaecef", fontWeight: 600 }}
                    >
                      {bot?.name || log.botId}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background:
                            log.side === "BUY"
                              ? "rgba(14,203,129,0.12)"
                              : "rgba(246,70,93,0.12)",
                          color:
                            log.side === "BUY" ? "#0ecb81" : "#f6465d",
                        }}
                      >
                        {log.side}
                      </span>
                    </div>
                    <div style={{ color: "rgba(180,190,210,0.7)" }}>
                      {symbolDisplay(log.symbol)}
                    </div>
                    <div style={{ textAlign: "right", color: "#eaecef" }}>
                      {log.qty}
                    </div>
                    <div
                      style={{ textAlign: "right", color: "#eaecef" }}
                    >
                      ${log.price.toFixed(2)}
                    </div>
                    <div>
                      {log.live ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#0ecb81",
                            background: "rgba(14,203,129,0.1)",
                            padding: "1px 6px",
                            borderRadius: 3,
                          }}
                        >
                          LIVE
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: "rgba(180,190,210,0.35)",
                          }}
                        >
                          SIM
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        color: "rgba(180,190,210,0.45)",
                        fontSize: 11,
                      }}
                    >
                      {new Date(log.ts).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Chart & Backtest ──────────────────────────────────────── */}
      {tab === "backtest" && (
        <div>
          <Suspense
            fallback={
              <div
                style={{
                  textAlign: "center",
                  padding: "64px 24px",
                  color: "rgba(180,190,210,0.35)",
                  fontSize: 13,
                }}
              >
                Loading chart...
              </div>
            }
          >
            <BotBacktest defaultStrategy="signal" defaultSymbol="BTC" />
          </Suspense>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(180,190,210,0.5)",
  letterSpacing: 0.5,
  textTransform: "uppercase",
  marginBottom: 6,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(180,190,210,0.5)",
  letterSpacing: 1,
  textTransform: "uppercase",
  marginBottom: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgb(20,24,30)",
  border: "1px solid rgba(30,36,50,1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#eaecef",
  fontSize: 14,
  fontFamily: "Manrope, sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
