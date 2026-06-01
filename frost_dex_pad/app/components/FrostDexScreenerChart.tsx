import { useState } from "react";
import { FROST_TOKEN } from "@/utils/customTokens";

const DEXSCREENER_EMBED = `https://dexscreener.com/arbitrum/${FROST_TOKEN.poolAddress}?embed=1&theme=dark&trades=1&info=1`;

export default function FrostDexScreenerChart() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "rgb(var(--oui-color-base-2))",
        borderBottom: "1px solid rgba(var(--oui-color-primary), 0.12)",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "Manrope, sans-serif",
          borderBottom: expanded ? "1px solid rgba(var(--oui-color-primary), 0.12)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>📊</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "rgb(var(--oui-color-primary))",
            }}
          >
            FROST / WETH — Live Chart
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              background: "rgba(var(--oui-color-primary), 0.1)",
              color: "rgb(var(--oui-color-primary))",
              letterSpacing: 0.5,
            }}
          >
            DexScreener
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "rgba(var(--oui-color-base-foreground), 0.4)",
            transition: "transform 0.2s ease",
            display: "inline-block",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ width: "100%", height: 480, position: "relative" }}>
          <iframe
            src={DEXSCREENER_EMBED}
            title="FROST/WETH DexScreener Chart"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            allow="clipboard-write"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
