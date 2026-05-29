import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FROST_TOKEN } from "@/utils/customTokens";

interface FrostData {
  priceUsd: string;
  priceChange: { h24: number };
  volume: { h24: number };
}

function fmtPrice(n: number): string {
  if (!n || isNaN(n)) return "—";
  if (n < 0.000001) return "$" + n.toFixed(10);
  if (n < 0.0001) return "$" + n.toFixed(8);
  if (n < 0.01) return "$" + n.toFixed(6);
  return "$" + n.toFixed(4);
}

function fmtVol(n: number): string {
  if (!n || isNaN(n)) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

export default function FrostTradeWidget() {
  const [data, setData] = useState<FrostData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPrice = useRef<number>(0);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  const fetchPrice = async () => {
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/arbitrum/${FROST_TOKEN.poolAddress}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      const pair = json?.pair ?? json?.pairs?.[0];
      if (pair) {
        const newPrice = parseFloat(pair.priceUsd ?? "0");
        if (prevPrice.current && newPrice !== prevPrice.current) {
          setFlash(newPrice > prevPrice.current ? "up" : "down");
          setTimeout(() => setFlash(null), 700);
        }
        prevPrice.current = newPrice;
        setData(pair);
      }
    } catch {}
  };

  useEffect(() => {
    fetchPrice();
    intervalRef.current = setInterval(fetchPrice, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const price = parseFloat(data?.priceUsd ?? "0");
  const change = data?.priceChange?.h24 ?? 0;
  const vol = data?.volume?.h24 ?? 0;
  const up = change >= 0;

  const priceFlashClass = flash === "up" ? "frost-widget-flash-up" : flash === "down" ? "frost-widget-flash-down" : "";

  return (
    <div className="frost-trade-widget">
      <div className="frost-trade-widget__header" onClick={() => setCollapsed((v) => !v)}>
        <div className="frost-trade-widget__title">
          <span className="frost-trade-widget__icon">❄</span>
          <span>FROST</span>
        </div>
        <div className="frost-trade-widget__toggle">
          {collapsed ? "▲" : "▼"}
        </div>
      </div>

      {!collapsed && (
        <div className="frost-trade-widget__body">
          <div className={`frost-trade-widget__price ${priceFlashClass}`}>
            {data ? fmtPrice(price) : <span className="frost-trade-widget__loading">…</span>}
          </div>

          <div className="frost-trade-widget__row">
            <span className="frost-trade-widget__label">24h</span>
            <span
              className="frost-trade-widget__change"
              style={{ color: up ? "rgb(14,203,129)" : "rgb(246,70,93)" }}
            >
              {data ? `${up ? "+" : ""}${change.toFixed(2)}%` : "—"}
            </span>
          </div>

          <div className="frost-trade-widget__row">
            <span className="frost-trade-widget__label">Vol</span>
            <span className="frost-trade-widget__val">{data ? fmtVol(vol) : "—"}</span>
          </div>

          <div className="frost-trade-widget__actions">
            <Link to="/swap" className="frost-trade-widget__btn frost-trade-widget__btn--primary">
              Buy ❄
            </Link>
            <a
              href={`https://dexscreener.com/arbitrum/${FROST_TOKEN.poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="frost-trade-widget__btn frost-trade-widget__btn--secondary"
            >
              Chart ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
