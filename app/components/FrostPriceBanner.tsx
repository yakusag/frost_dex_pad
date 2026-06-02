import { useEffect, useState, lazy, Suspense } from "react";
import { FROST_TOKEN } from "@/utils/customTokens";

const FrostDexScreenerChart = lazy(() => import("./FrostDexScreenerChart"));

interface PairData {
  priceUsd: string;
  priceChange: { h24: number };
  volume: { h24: number };
  marketCap: number;
  fdv: number;
}

function fmt(n: number, compact = false): string {
  if (!n || isNaN(n)) return "—";
  if (compact) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

export default function FrostPriceBanner() {
  const [data, setData] = useState<PairData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(false);

  const fetchPrice = async () => {
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/arbitrum/${FROST_TOKEN.poolAddress}`
      );
      const json = await res.json();
      const pair = json?.pair ?? json?.pairs?.[0];
      if (pair) setData(pair);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => clearInterval(id);
  }, []);

  const price = parseFloat(data?.priceUsd ?? "0");
  const change = data?.priceChange?.h24 ?? 0;
  const vol = data?.volume?.h24 ?? 0;
  const mc = data?.marketCap ?? data?.fdv ?? 0;
  const up = change >= 0;

  const statColor = "rgba(var(--oui-color-base-foreground), 0.55)";
  const valColor = "rgb(var(--oui-color-base-foreground))";
  const changeColor = up ? "rgb(60,230,180)" : "rgb(255,80,110)";

  return (
    <div style={{ width: "100%" }}>
      <div
        className="w-full flex items-center justify-between flex-wrap gap-2 px-4 py-2.5"
        style={{
          background: "rgb(var(--oui-color-base-2))",
          borderBottom: showChart
            ? "none"
            : "1px solid rgba(var(--oui-color-primary), 0.12)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              background: "rgba(var(--oui-color-primary), 0.15)",
              color: "rgb(var(--oui-color-primary))",
              border: "1px solid rgba(var(--oui-color-primary), 0.3)",
            }}
          >
            ❄
          </div>
          <div>
            <div className="text-xs font-semibold" style={{ color: valColor }}>
              FROST / WETH
            </div>
            <div className="text-xs" style={{ color: statColor }}>
              Arbitrum · Uniswap V3
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-xs" style={{ color: statColor }}>Loading…</div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-center">
              <div className="text-xs" style={{ color: statColor }}>Price</div>
              <div className="text-sm font-bold" style={{ color: "rgb(var(--oui-color-primary))" }}>
                {fmt(price)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs" style={{ color: statColor }}>24h Change</div>
              <div className="text-sm font-bold" style={{ color: changeColor }}>
                {up ? "+" : ""}{change.toFixed(2)}%
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs" style={{ color: statColor }}>24h Volume</div>
              <div className="text-sm font-semibold" style={{ color: valColor }}>
                {fmt(vol, true)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs" style={{ color: statColor }}>Market Cap</div>
              <div className="text-sm font-semibold" style={{ color: valColor }}>
                {fmt(mc, true)}
              </div>
            </div>

            <button
              onClick={() => setShowChart((v) => !v)}
              style={{
                background: showChart
                  ? "rgba(var(--oui-color-primary), 0.15)"
                  : "rgba(var(--oui-color-primary), 0.07)",
                border: "1px solid rgba(var(--oui-color-primary), 0.3)",
                borderRadius: 6,
                padding: "3px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: "rgb(var(--oui-color-primary))",
                fontFamily: "Manrope, sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "background 0.15s ease",
              }}
            >
              📊 {showChart ? "Hide Chart" : "Live Chart"}
            </button>
          </div>
        )}
      </div>

      {showChart && (
        <Suspense
          fallback={
            <div
              style={{
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgb(var(--oui-color-base-2))",
                borderBottom: "1px solid rgba(var(--oui-color-primary), 0.12)",
                fontSize: 12,
                color: "rgba(var(--oui-color-base-foreground), 0.4)",
              }}
            >
              Loading chart…
            </div>
          }
        >
          <FrostDexScreenerChart />
        </Suspense>
      )}
    </div>
  );
}
