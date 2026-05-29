import { useEffect, useRef, useState, useCallback } from "react";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Signal {
  t: number;
  price: number;
  side: "BUY" | "SELL";
}

interface Props {
  candles: Candle[];
  signals?: Signal[];
  height?: number;
  showVolume?: boolean;
  realtime?: boolean;
}

const W = 800;
const H_CHART = 260;
const H_VOL = 48;
const PAD = { top: 12, right: 60, bottom: 4, left: 8 };

function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return ((v - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function formatPrice(p: number) {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100) return p.toFixed(1);
  return p.toFixed(2);
}

export default function BotChart({ candles, signals = [], height = 320, showVolume = true }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; candle: Candle } | null>(null);

  const hChart = showVolume ? H_CHART : height - PAD.top - PAD.bottom;
  const hVol = showVolume ? H_VOL : 0;
  const totalH = hChart + hVol + (showVolume ? 8 : 0);

  if (!candles.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(180,190,210,0.3)", fontSize: 13 }}>
        Loading chart...
      </div>
    );
  }

  const prices = candles.flatMap((c) => [c.h, c.l]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const padP = (maxP - minP) * 0.05 || 1;
  const lo = minP - padP;
  const hi = maxP + padP;

  const volumes = candles.map((c) => c.v);
  const maxVol = Math.max(...volumes, 1);

  const n = candles.length;
  const innerW = W - PAD.left - PAD.right;
  const cw = Math.max(1, innerW / n);
  const gap = Math.max(1, cw * 0.15);
  const bodyW = Math.max(1, cw - gap * 2);

  const px = (i: number) => PAD.left + i * cw + cw / 2;
  const py = (price: number) => lerp(price, lo, hi, PAD.top + hChart, PAD.top);
  const pVol = (v: number) => lerp(v, 0, maxVol, totalH, hChart + 8 + PAD.top);

  // Price grid lines
  const gridCount = 5;
  const gridPrices = Array.from({ length: gridCount }, (_, i) =>
    lo + ((hi - lo) * i) / (gridCount - 1)
  );

  // EMA line
  const period = 20;
  const ema: number[] = [];
  const k = 2 / (period + 1);
  candles.forEach((c, i) => {
    if (i === 0) { ema.push(c.c); return; }
    ema.push(c.c * k + ema[i - 1] * (1 - k));
  });

  const emaPath = ema
    .map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`)
    .join(" ");

  // Close price area
  const areaPath = candles
    .map((c, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(c.c).toFixed(1)}`)
    .join(" ") +
    ` L${px(n - 1).toFixed(1)},${(PAD.top + hChart).toFixed(1)} L${px(0).toFixed(1)},${(PAD.top + hChart).toFixed(1)} Z`;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const svgX = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.round((svgX - PAD.left) / cw - 0.5);
      if (i >= 0 && i < n) {
        setTooltip({ x: px(i), y: py(candles[i].c), candle: candles[i] });
      }
    },
    [candles, cw, n]
  );

  return (
    <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${totalH + PAD.top + PAD.bottom}`}
        style={{ width: "100%", height: height, display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,224,248,0.12)" />
            <stop offset="100%" stopColor="rgba(56,224,248,0)" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={hChart} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {gridPrices.map((p) => {
          const y = py(p);
          return (
            <g key={p}>
              <line
                x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="rgba(30,36,50,1)" strokeWidth="1"
              />
              <text
                x={W - PAD.right + 6} y={y + 4}
                fontSize="10" fill="rgba(180,190,210,0.4)"
                fontFamily="Manrope, sans-serif"
              >
                {formatPrice(p)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#chartClip)" />

        {/* Candles */}
        <g clipPath="url(#chartClip)">
          {candles.map((c, i) => {
            const x = px(i);
            const isUp = c.c >= c.o;
            const color = isUp ? "#0ecb81" : "#f6465d";
            const bodyTop = Math.min(py(c.o), py(c.c));
            const bodyH = Math.max(1, Math.abs(py(c.o) - py(c.c)));
            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x} y1={py(c.h)} x2={x} y2={py(c.l)}
                  stroke={color} strokeWidth="1" opacity="0.7"
                />
                {/* Body */}
                <rect
                  x={x - bodyW / 2} y={bodyTop}
                  width={bodyW} height={bodyH}
                  fill={isUp ? color : color}
                  opacity={isUp ? "0.85" : "0.75"}
                />
              </g>
            );
          })}

          {/* EMA line */}
          <path d={emaPath} fill="none" stroke="rgba(240,185,11,0.7)" strokeWidth="1.5" />

          {/* Signals */}
          {signals.map((sig, i) => {
            const idx = candles.findIndex((c) => Math.abs(c.t - sig.t) < 120000);
            if (idx < 0) return null;
            const x = px(idx);
            const y = sig.side === "BUY" ? py(sig.price) + 14 : py(sig.price) - 14;
            const isBuy = sig.side === "BUY";
            return (
              <g key={i}>
                {isBuy ? (
                  <polygon
                    points={`${x},${y - 8} ${x - 6},${y + 4} ${x + 6},${y + 4}`}
                    fill="#0ecb81" opacity="0.9"
                  />
                ) : (
                  <polygon
                    points={`${x},${y + 8} ${x - 6},${y - 4} ${x + 6},${y - 4}`}
                    fill="#f6465d" opacity="0.9"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Volume bars */}
        {showVolume && (
          <g>
            <line
              x1={PAD.left} y1={PAD.top + hChart + 6} x2={W - PAD.right} y2={PAD.top + hChart + 6}
              stroke="rgba(30,36,50,1)" strokeWidth="1"
            />
            {candles.map((c, i) => {
              const isUp = c.c >= c.o;
              const bh = Math.max(1, (PAD.top + totalH) - pVol(c.v));
              return (
                <rect
                  key={i}
                  x={px(i) - bodyW / 2} y={pVol(c.v)}
                  width={bodyW} height={bh}
                  fill={isUp ? "rgba(14,203,129,0.35)" : "rgba(246,70,93,0.3)"}
                />
              );
            })}
          </g>
        )}

        {/* Tooltip crosshair */}
        {tooltip && (
          <g pointerEvents="none">
            <line
              x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + hChart}
              stroke="rgba(56,224,248,0.3)" strokeWidth="1" strokeDasharray="4,3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r="3" fill="#38e0f8" opacity="0.8" />
          </g>
        )}
      </svg>

      {/* Tooltip box */}
      {tooltip && (() => {
        const c = tooltip.candle;
        const isUp = c.c >= c.o;
        const pct = ((c.c - c.o) / c.o) * 100;
        return (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 12,
              background: "rgba(14,17,22,0.95)",
              border: "1px solid rgba(30,36,50,1)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 11,
              fontFamily: "Manrope, sans-serif",
              color: "#eaecef",
              pointerEvents: "none",
              lineHeight: 1.7,
              minWidth: 140,
            }}
          >
            <div style={{ color: "rgba(180,190,210,0.5)", marginBottom: 4 }}>
              {new Date(c.t).toLocaleString()}
            </div>
            <div>O: <b>{formatPrice(c.o)}</b>  H: <b style={{ color: "#0ecb81" }}>{formatPrice(c.h)}</b></div>
            <div>L: <b style={{ color: "#f6465d" }}>{formatPrice(c.l)}</b>  C: <b style={{ color: isUp ? "#0ecb81" : "#f6465d" }}>{formatPrice(c.c)}</b></div>
            <div>
              Chg: <b style={{ color: isUp ? "#0ecb81" : "#f6465d" }}>{isUp ? "+" : ""}{pct.toFixed(2)}%</b>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{ position: "absolute", bottom: showVolume ? 52 : 8, right: 68, display: "flex", gap: 12, fontSize: 10, fontFamily: "Manrope, sans-serif" }}>
        <span style={{ color: "rgba(240,185,11,0.8)" }}>─ EMA20</span>
        <span style={{ color: "#0ecb81" }}>▲ Buy</span>
        <span style={{ color: "#f6465d" }}>▼ Sell</span>
      </div>
    </div>
  );
}
