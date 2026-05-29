import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FROST_TOKEN } from "@/utils/customTokens";
import { useDraggable } from "@/hooks/useDraggable";

interface FrostData {
  priceUsd: string;
  priceChange: { h24: number };
  volume: { h24: number };
}

interface Props {
  onHide?: () => void;
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

function getDefaultPos() {
  if (typeof window === "undefined") return { x: 200, y: 400 };
  return {
    x: window.innerWidth - 164,
    y: window.innerHeight - 260,
  };
}

export default function FrostTradeWidget({ onHide }: Props) {
  const [data, setData] = useState<FrostData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPrice = useRef<number>(0);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps } =
    useDraggable("frost-widget", getDefaultPos());

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

  const priceFlashClass =
    flash === "up"
      ? "frost-widget-flash-up"
      : flash === "down"
      ? "frost-widget-flash-down"
      : "";

  return (
    <div
      ref={elementRef}
      className="frost-trade-widget"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        transition: isSnapping
          ? "left 0.3s cubic-bezier(0.34,1.56,0.64,1), top 0.3s cubic-bezier(0.34,1.56,0.64,1)"
          : isDragging
          ? "none"
          : undefined,
        cursor: isDragging ? "grabbing" : undefined,
        zIndex: isDragging ? 300 : 50,
        userSelect: isDragging ? "none" : undefined,
      }}
    >
      <div
        className="frost-trade-widget__header"
        {...dragHandleProps}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div
          className="frost-trade-widget__title"
          onClick={() => { if (wasDragged()) return; setCollapsed((v) => !v); }}
          style={{ flex: 1, cursor: isDragging ? "grabbing" : "grab" }}
        >
          <span className="frost-trade-widget__icon">❄</span>
          <span>FROST</span>
        </div>
        <div
          className="frost-trade-widget__toggle"
          onClick={() => { if (wasDragged()) return; setCollapsed((v) => !v); }}
        >
          {collapsed ? "▲" : "▼"}
        </div>
        {onHide && (
          <button
            className="frost-trade-widget__close"
            onMouseDown={e => e.stopPropagation()}
            onClick={onHide}
            title="Hide widget"
          >
            ✕
          </button>
        )}
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
            <Link
              to="/swap"
              className="frost-trade-widget__btn frost-trade-widget__btn--primary"
            >
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
