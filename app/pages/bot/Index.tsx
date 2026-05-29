import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";

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
}

interface TradeLog {
  id: string;
  botId: string;
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  price: number;
  ts: number;
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
];

function symbolDisplay(s: string) {
  return s.replace("PERP_", "").replace("_USDC", "/USDC");
}

function generateId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const STRATEGY_INFO: Record<BotStrategy, { label: string; desc: string; icon: string; color: string }> = {
  grid: {
    label: "Grid Bot",
    desc: "Buys low and sells high in a price range using a grid of orders. Works well in sideways markets.",
    icon: "⊞",
    color: "#38e0f8",
  },
  dca: {
    label: "DCA Bot",
    desc: "Dollar Cost Averaging — invests a fixed amount at regular intervals regardless of price.",
    icon: "↻",
    color: "#0ecb81",
  },
  signal: {
    label: "Signal Bot",
    desc: "Executes trades based on momentum signals: RSI, EMA crossover, and volume breakouts.",
    icon: "◈",
    color: "#f0b90b",
  },
};

export default function BotPage() {
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
  const [tab, setTab] = useState<"bots" | "create" | "logs" | "backtest">("bots");
  const [strategy, setStrategy] = useState<BotStrategy>("grid");
  const [symbol, setSymbol] = useState("PERP_BTC_USDC");
  const [investment, setInvestment] = useState("500");
  const [botName, setBotName] = useState("");
  const [creating, setCreating] = useState(false);

  // Grid params
  const [gridUpper, setGridUpper] = useState("");
  const [gridLower, setGridLower] = useState("");
  const [gridCount, setGridCount] = useState("10");

  // DCA params
  const [dcaInterval, setDcaInterval] = useState("1h");
  const [dcaAmount, setDcaAmount] = useState("50");

  // Signal params
  const [sigRsi, setSigRsi] = useState("14");
  const [sigEma, setSigEma] = useState("20");

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveBots = useCallback((updated: BotConfig[]) => {
    setBots(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const saveLogs = useCallback((updated: TradeLog[]) => {
    setLogs(updated);
    localStorage.setItem(LOGS_KEY, JSON.stringify(updated));
  }, []);

  // Simulate bot activity for running bots
  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setBots((prev) => {
        const updated = prev.map((bot) => {
          if (bot.status !== "running") return bot;
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

  const handleCreate = () => {
    setCreating(true);
    setTimeout(() => {
      const params: Record<string, string | number> =
        strategy === "grid"
          ? { upper: gridUpper || "auto", lower: gridLower || "auto", grids: Number(gridCount) }
          : strategy === "dca"
          ? { interval: dcaInterval, amount: Number(dcaAmount) }
          : { rsi: Number(sigRsi), ema: Number(sigEma) };

      const newBot: BotConfig = {
        id: generateId(),
        name: botName || `${STRATEGY_INFO[strategy].label} #${generateId().slice(0, 4)}`,
        strategy,
        symbol,
        investment: Number(investment),
        status: "running",
        pnl: 0,
        pnlPct: 0,
        trades: 0,
        createdAt: Date.now(),
        params,
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
          ? { ...b, status: b.status === "running" ? "stopped" : "running" }
          : b
      )
    );
  };

  const deleteBot = (id: string) => {
    saveBots(bots.filter((b) => b.id !== id));
  };

  const addLog = (botId: string) => {
    const bot = bots.find((b) => b.id === botId);
    if (!bot) return;
    const log: TradeLog = {
      id: generateId(),
      botId,
      side: Math.random() > 0.5 ? "BUY" : "SELL",
      symbol: bot.symbol,
      qty: Math.round(Math.random() * 100) / 100,
      price: 40000 + Math.random() * 5000,
      ts: Date.now(),
    };
    saveLogs([log, ...logs.slice(0, 99)]);
  };

  const totalInvestment = bots.reduce((s, b) => s + b.investment, 0);
  const totalPnl = bots.reduce((s, b) => s + b.pnl, 0);
  const runningCount = bots.filter((b) => b.status === "running").length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "rgb(11, 14, 17)",
        padding: "24px 16px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>🤖</span>
          <h1
            style={{
              fontSize: 22,
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
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#38e0f8",
              background: "rgba(56,224,248,0.1)",
              border: "1px solid rgba(56,224,248,0.2)",
              borderRadius: 4,
              padding: "2px 8px",
            }}
          >
            BETA
          </span>
        </div>
        <p style={{ color: "rgba(180,190,210,0.55)", fontSize: 13, margin: 0 }}>
          Automated trading strategies powered by FrostDex
        </p>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { label: "Active Bots", value: runningCount, suffix: "", color: "#0ecb81" },
          { label: "Total Bots", value: bots.length, suffix: "", color: "#38e0f8" },
          {
            label: "Total Invested",
            value: totalInvestment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            prefix: "$",
            color: "#eaecef",
          },
          {
            label: "Total P&L",
            value: (totalPnl >= 0 ? "+" : "") + totalPnl.toFixed(2),
            prefix: "$",
            color: totalPnl >= 0 ? "#0ecb81" : "#f6465d",
          },
        ].map((stat) => (
          <div key={stat.label} className="bot-card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
              {stat.prefix}{stat.value}{stat.suffix}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(30,36,50,1)", paddingBottom: 0 }}>
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
              color: tab === t ? "#38e0f8" : "rgba(180,190,210,0.5)",
              borderBottom: tab === t ? "2px solid #38e0f8" : "2px solid transparent",
              marginBottom: -1,
              textTransform: "capitalize",
              transition: "color 0.15s ease",
            }}
          >
            {t === "bots"
              ? `My Bots (${bots.length})`
              : t === "create"
              ? "+ Create Bot"
              : t === "backtest"
              ? "📊 Chart & Backtest"
              : `Trade Log (${logs.length})`}
          </button>
        ))}
      </div>

      {/* Tab: My Bots */}
      {tab === "bots" && (
        <div>
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
              <div style={{ fontSize: 13 }}>Create your first automated trading bot</div>
              <button
                onClick={() => setTab("create")}
                style={{
                  background: "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)",
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
                return (
                  <div key={bot.id} className="bot-card">
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: `rgba(${info.color === "#38e0f8" ? "56,224,248" : info.color === "#0ecb81" ? "14,203,129" : "240,185,11"},0.12)`,
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#eaecef" }}>{bot.name}</span>
                            <span className={`bot-status-dot ${isRunning ? "running" : "stopped"}`} />
                            <span style={{ fontSize: 11, color: isRunning ? "#0ecb81" : "rgba(180,190,210,0.4)", fontWeight: 600 }}>
                              {isRunning ? "RUNNING" : "STOPPED"}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(180,190,210,0.5)", marginTop: 2 }}>
                            {info.label} · {symbolDisplay(bot.symbol)} · ${bot.investment.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: bot.pnl >= 0 ? "#0ecb81" : "#f6465d",
                            }}
                          >
                            {bot.pnl >= 0 ? "+" : ""}${bot.pnl.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 11, color: bot.pnlPct >= 0 ? "#0ecb81" : "#f6465d", fontWeight: 600 }}>
                            {bot.pnlPct >= 0 ? "+" : ""}{bot.pnlPct.toFixed(2)}%
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => addLog(bot.id)}
                            title="Simulate trade"
                            style={{
                              background: "rgba(56,224,248,0.08)",
                              border: "1px solid rgba(56,224,248,0.15)",
                              borderRadius: 6,
                              color: "#38e0f8",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "6px 10px",
                              fontFamily: "Manrope, sans-serif",
                            }}
                          >
                            Trade
                          </button>
                          <button
                            onClick={() => toggleBot(bot.id)}
                            style={{
                              background: isRunning ? "rgba(246,70,93,0.1)" : "rgba(14,203,129,0.1)",
                              border: `1px solid ${isRunning ? "rgba(246,70,93,0.25)" : "rgba(14,203,129,0.25)"}`,
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
                    <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                      {Object.entries(bot.params).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 11 }}>
                          <span style={{ color: "rgba(180,190,210,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}: </span>
                          <span style={{ color: "#eaecef", fontWeight: 600 }}>{String(v)}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 11 }}>
                        <span style={{ color: "rgba(180,190,210,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>created: </span>
                        <span style={{ color: "#eaecef", fontWeight: 600 }}>
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

      {/* Tab: Create Bot */}
      {tab === "create" && (
        <div style={{ maxWidth: 600 }}>
          {/* Strategy Picker */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.5)", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 10 }}>
              Strategy
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {(["grid", "dca", "signal"] as BotStrategy[]).map((s) => {
                const info = STRATEGY_INFO[s];
                const selected = strategy === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStrategy(s)}
                    style={{
                      background: selected ? `rgba(${info.color === "#38e0f8" ? "56,224,248" : info.color === "#0ecb81" ? "14,203,129" : "240,185,11"},0.1)` : "rgb(20,24,30)",
                      border: `1px solid ${selected ? info.color : "rgba(30,36,50,1)"}`,
                      borderRadius: 10,
                      padding: "14px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      fontFamily: "Manrope, sans-serif",
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{info.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected ? info.color : "#eaecef" }}>
                      {info.label}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", marginTop: 4, lineHeight: 1.4 }}>
                      {info.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Basic Settings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
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
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inputStyle}>
                {POPULAR_SYMBOLS.map((s) => (
                  <option key={s} value={s}>{symbolDisplay(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Total Investment (USDC)</label>
              <input
                type="number"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                placeholder="500"
                min="10"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Strategy-specific params */}
          {strategy === "grid" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.5)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Grid Parameters
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Upper Price</label>
                  <input value={gridUpper} onChange={(e) => setGridUpper(e.target.value)} placeholder="Auto" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Lower Price</label>
                  <input value={gridLower} onChange={(e) => setGridLower(e.target.value)} placeholder="Auto" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Grid Count</label>
                  <input type="number" value={gridCount} onChange={(e) => setGridCount(e.target.value)} min="3" max="200" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(180,190,210,0.4)", lineHeight: 1.5 }}>
                💡 Leave Upper/Lower empty for AI-assisted auto range detection based on current volatility.
              </div>
            </div>
          )}

          {strategy === "dca" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.5)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                DCA Parameters
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Buy Interval</label>
                  <select value={dcaInterval} onChange={(e) => setDcaInterval(e.target.value)} style={inputStyle}>
                    {["15m","30m","1h","4h","8h","12h","1d","3d","1w"].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Amount per Buy (USDC)</label>
                  <input type="number" value={dcaAmount} onChange={(e) => setDcaAmount(e.target.value)} min="1" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(180,190,210,0.4)", lineHeight: 1.5 }}>
                💡 DCA reduces the impact of volatility by spreading purchases over time.
              </div>
            </div>
          )}

          {strategy === "signal" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(180,190,210,0.5)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                Signal Parameters
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>RSI Period</label>
                  <input type="number" value={sigRsi} onChange={(e) => setSigRsi(e.target.value)} min="2" max="50" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>EMA Period</label>
                  <input type="number" value={sigEma} onChange={(e) => setSigEma(e.target.value)} min="5" max="200" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(180,190,210,0.4)", lineHeight: 1.5 }}>
                💡 Signal bot buys when RSI &lt; 35 + EMA crossover confirmed, sells when RSI &gt; 68.
              </div>
            </div>
          )}

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
            ⚠️ Trading bots involve financial risk. Only invest what you can afford to lose. Past performance does not guarantee future results.
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !investment || Number(investment) <= 0}
            style={{
              width: "100%",
              padding: "14px",
              background: creating ? "rgba(56,224,248,0.3)" : "linear-gradient(135deg, #38e0f8 0%, #0ecb81 100%)",
              border: "none",
              borderRadius: 8,
              color: "#0b0e11",
              fontSize: 15,
              fontWeight: 700,
              cursor: creating ? "not-allowed" : "pointer",
              fontFamily: "Manrope, sans-serif",
              letterSpacing: 0.3,
              transition: "opacity 0.15s ease",
            }}
          >
            {creating ? "Creating Bot..." : `🚀 Launch ${STRATEGY_INFO[strategy].label}`}
          </button>
        </div>
      )}

      {/* Tab: Trade Log */}
      {tab === "logs" && (
        <div>
          {logs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "64px 24px",
                color: "rgba(180,190,210,0.35)",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No trade logs yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Start a bot and click "Trade" to simulate trades</div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 120px 100px 100px 120px",
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
                <div style={{ textAlign: "right" }}>Time</div>
              </div>
              {logs.slice(0, 50).map((log) => {
                const bot = bots.find((b) => b.id === log.botId);
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 120px 100px 100px 120px",
                      gap: 8,
                      padding: "10px 16px",
                      fontSize: 13,
                      borderBottom: "1px solid rgba(30,36,50,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ color: "#eaecef", fontWeight: 600 }}>
                      {bot?.name || log.botId}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: log.side === "BUY" ? "rgba(14,203,129,0.12)" : "rgba(246,70,93,0.12)",
                          color: log.side === "BUY" ? "#0ecb81" : "#f6465d",
                        }}
                      >
                        {log.side}
                      </span>
                    </div>
                    <div style={{ color: "rgba(180,190,210,0.7)" }}>{symbolDisplay(log.symbol)}</div>
                    <div style={{ textAlign: "right", color: "#eaecef" }}>{log.qty}</div>
                    <div style={{ textAlign: "right", color: "#eaecef" }}>${log.price.toFixed(2)}</div>
                    <div style={{ textAlign: "right", color: "rgba(180,190,210,0.45)", fontSize: 11 }}>
                      {new Date(log.ts).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Chart & Backtest */}
      {tab === "backtest" && (
        <div>
          <Suspense fallback={
            <div style={{ textAlign: "center", padding: "64px 24px", color: "rgba(180,190,210,0.35)", fontSize: 13 }}>
              Loading chart...
            </div>
          }>
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
