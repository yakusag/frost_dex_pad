import { useEffect, useRef, useState } from "react";
import { FROST_TOKEN } from "@/utils/customTokens";

interface MarketItem {
  symbol: string;
  base: string;
  price: number;
  change: number;
  isFrost?: boolean;
}

const SYMBOLS = [
  "PERP_BTC_USDC",
  "PERP_ETH_USDC",
  "PERP_SOL_USDC",
  "PERP_ARB_USDC",
  "PERP_BNB_USDC",
  "PERP_AVAX_USDC",
  "PERP_DOGE_USDC",
  "PERP_WIF_USDC",
  "PERP_PEPE_USDC",
  "PERP_OP_USDC",
  "PERP_TIA_USDC",
  "PERP_SUI_USDC",
  "PERP_LINK_USDC",
  "PERP_NEAR_USDC",
];

function fmt(price: number, base: string): string {
  if (["PEPE", "BONK", "SHIB"].includes(base)) {
    return price.toFixed(8);
  }
  if (price < 0.000001) return price.toFixed(10);
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(3);
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchMarkets(): Promise<MarketItem[]> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures");
    if (!res.ok) return [];
    const json = await res.json();
    const rows: MarketItem[] = [];
    for (const sym of SYMBOLS) {
      const d = json?.data?.rows?.find((r: any) => r.symbol === sym);
      if (!d) continue;
      const price = Number(d["24h_close"] ?? d.last_price ?? 0);
      const open = Number(d["24h_open"] ?? 0);
      const change = open > 0 ? ((price - open) / open) * 100 : 0;
      const base = sym.split("_")[1];
      rows.push({ symbol: sym, base, price, change });
    }
    return rows;
  } catch {
    return [];
  }
}

async function fetchFrostPrice(): Promise<MarketItem | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/arbitrum/pools/${FROST_TOKEN.poolAddress}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const attrs = json?.data?.attributes;
    if (!attrs) return null;
    const price = parseFloat(attrs.base_token_price_usd ?? "0");
    const change = parseFloat(attrs.price_change_percentage?.h24 ?? "0");
    if (!price) return null;
    return {
      symbol: "FROST_USDC",
      base: "FROST",
      price,
      change,
      isFrost: true,
    };
  } catch {
    return null;
  }
}

export default function MarketTickerBar() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      const [markets, frost] = await Promise.all([fetchMarkets(), fetchFrostPrice()]);
      const all = frost ? [frost, ...markets] : markets;
      setItems(all);
    }
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div className="market-ticker-bar" aria-label="Live market prices">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <div key={`${item.symbol}-${i}`} className={`ticker-item${item.isFrost ? " ticker-item--frost" : ""}`}>
            {item.isFrost && (
              <span className="ticker-frost-badge">❄</span>
            )}
            <span className="ticker-base">{item.base}</span>
            <span className="ticker-price">${fmt(item.price, item.base)}</span>
            <span className={`ticker-change ${item.change >= 0 ? "up" : "down"}`}>
              {item.change >= 0 ? "▲" : "▼"} {Math.abs(item.change).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
