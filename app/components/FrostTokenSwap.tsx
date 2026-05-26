import { FROST_TOKEN } from "@/utils/customTokens";

const DEXSCREENER_EMBED = `https://dexscreener.com/arbitrum/${FROST_TOKEN.poolAddress}?embed=1&theme=dark&trades=0&info=0`;

export default function FrostTokenSwap() {
  const shortAddress = `${FROST_TOKEN.address.slice(0, 6)}...${FROST_TOKEN.address.slice(-4)}`;
  const poolShort = `${FROST_TOKEN.poolAddress!.slice(0, 6)}...${FROST_TOKEN.poolAddress!.slice(-4)}`;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "rgba(var(--oui-color-primary), 0.25)" }}
      >
        <iframe
          src={DEXSCREENER_EMBED}
          style={{ width: "100%", height: "400px", border: "none" }}
          title="FROST/WETH Price Chart"
          allow="clipboard-write"
        />
      </div>

      <div
        className="rounded-xl border p-5 flex flex-col gap-4"
        style={{
          background: "rgb(var(--oui-color-base-2))",
          borderColor: "rgba(var(--oui-color-primary), 0.25)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
            style={{
              background: "rgba(var(--oui-color-primary), 0.15)",
              color: "rgb(var(--oui-color-primary))",
              border: "1px solid rgba(var(--oui-color-primary), 0.4)",
            }}
          >
            ❄
          </div>
          <div>
            <div className="font-bold text-base" style={{ color: "rgb(var(--oui-color-base-foreground))" }}>
              {FROST_TOKEN.name}
            </div>
            <div className="text-xs" style={{ color: "rgb(var(--oui-color-primary))" }}>
              {FROST_TOKEN.symbol} · Arbitrum One
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(var(--oui-color-base-3), 0.5)" }}
          >
            <div style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }} className="mb-1">
              Contract
            </div>
            <a
              href={`https://arbiscan.io/token/${FROST_TOKEN.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:underline"
              style={{ color: "rgb(var(--oui-color-primary))" }}
            >
              {shortAddress}
            </a>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(var(--oui-color-base-3), 0.5)" }}
          >
            <div style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }} className="mb-1">
              Uniswap V3 Pool
            </div>
            <a
              href={`https://arbiscan.io/address/${FROST_TOKEN.poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:underline"
              style={{ color: "rgb(var(--oui-color-primary))" }}
            >
              {poolShort}
            </a>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(var(--oui-color-base-3), 0.5)" }}
          >
            <div style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }} className="mb-1">
              Pair
            </div>
            <span style={{ color: "rgb(var(--oui-color-base-foreground))" }} className="font-semibold">
              {FROST_TOKEN.symbol} / {FROST_TOKEN.pairWith}
            </span>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: "rgba(var(--oui-color-base-3), 0.5)" }}
          >
            <div style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }} className="mb-1">
              Network
            </div>
            <span style={{ color: "rgb(var(--oui-color-base-foreground))" }} className="font-semibold">
              Arbitrum One
            </span>
          </div>
        </div>

        <a
          href={FROST_TOKEN.uniswapPoolUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 rounded-xl font-bold text-sm text-center transition-opacity hover:opacity-90 active:opacity-75"
          style={{
            background: "rgb(var(--oui-color-primary))",
            color: "rgb(var(--oui-color-base-1))",
          }}
        >
          Swap FROST / WETH on Uniswap ↗
        </a>

        <p className="text-xs text-center" style={{ color: "rgba(var(--oui-color-base-foreground), 0.4)" }}>
          Opens Uniswap V3 on Arbitrum · Make sure your wallet is on Arbitrum One
        </p>
      </div>
    </div>
  );
}
