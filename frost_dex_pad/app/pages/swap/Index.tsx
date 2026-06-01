import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import { lazy, Suspense, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import FrostSwapWidget from "@/components/FrostSwapWidget";
import FrostPriceBanner from "@/components/FrostPriceBanner";
import { FROST_TOKEN } from "@/utils/customTokens";

const WooFiWidget = lazy(() => import("@/components/WooFiWidget"));

export default function SwapIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Swap");
  const [activeTab, setActiveTab] = useState<"frost" | "general">("frost");

  const tabBase =
    "px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer";
  const activeStyle = {
    background: "rgb(var(--oui-color-primary))",
    color: "rgb(var(--oui-color-base-1))",
  };
  const inactiveStyle = {
    background: "rgba(var(--oui-color-base-3), 0.5)",
    color: "rgba(var(--oui-color-base-foreground), 0.6)",
  };

  return (
    <>
      {renderSEOTags(pageMeta, pageTitle)}
      <FrostPriceBanner />
      <div className="w-full h-full flex flex-col items-center p-4 pt-6 gap-6">
        <div
          className="flex gap-2 p-1 rounded-xl"
          style={{ background: "rgb(var(--oui-color-base-2))" }}
        >
          <button
            className={tabBase}
            style={activeTab === "frost" ? activeStyle : inactiveStyle}
            onClick={() => setActiveTab("frost")}
          >
            ❄ Buy FROST
          </button>
          <button
            className={tabBase}
            style={activeTab === "general" ? activeStyle : inactiveStyle}
            onClick={() => setActiveTab("general")}
          >
            General Swap
          </button>
        </div>

        {activeTab === "frost" ? (
          <div className="w-full flex flex-col gap-4" style={{ maxWidth: 900 }}>
            {/* Chart full width on top */}
            <div
              className="rounded-xl overflow-hidden w-full"
              style={{
                background: "rgb(var(--oui-color-base-2))",
                border: "1px solid rgba(var(--oui-color-primary), 0.15)",
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: "1px solid rgba(var(--oui-color-primary), 0.1)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "rgb(var(--oui-color-base-foreground))" }}>
                    FROST / WETH
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(var(--oui-color-primary), 0.1)",
                      color: "rgb(var(--oui-color-primary))",
                    }}
                  >
                    Uniswap V3 · Arbitrum
                  </span>
                </div>
                <a
                  href={`https://dexscreener.com/arbitrum/${FROST_TOKEN.poolAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:opacity-80 transition-opacity"
                  style={{ color: "rgba(var(--oui-color-base-foreground), 0.4)" }}
                >
                  Full chart ↗
                </a>
              </div>
              <iframe
                src={`https://www.geckoterminal.com/arbitrum/pools/${FROST_TOKEN.poolAddress}?embed=1&info=0&swaps=0&light_chart=0`}
                style={{ width: "100%", height: 380, border: "none", display: "block" }}
                title="FROST/WETH price chart"
                allow="clipboard-write"
              />
            </div>

            {/* Swap widget + contract info centered below chart */}
            <div className="flex flex-col items-center gap-3 w-full">
              <div style={{ width: "100%", maxWidth: 400 }}>
                <FrostSwapWidget />
              </div>
              <div
                className="rounded-xl p-4"
                style={{
                  width: "100%",
                  maxWidth: 400,
                  background: "rgb(var(--oui-color-base-2))",
                  border: "1px solid rgba(var(--oui-color-primary), 0.15)",
                }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(var(--oui-color-base-foreground), 0.4)" }}>
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      background: "rgba(var(--oui-color-primary), 0.12)",
                      color: "rgb(var(--oui-color-primary))",
                    }}
                  >i</span>
                  <span>
                    Contract:{" "}
                    <a
                      href={`https://arbiscan.io/token/${FROST_TOKEN.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:underline"
                      style={{ color: "rgb(var(--oui-color-primary))" }}
                    >
                      {FROST_TOKEN.address.slice(0, 6)}…{FROST_TOKEN.address.slice(-4)}
                    </a>
                    {" · "}
                    <a
                      href={FROST_TOKEN.uniswapPoolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: "rgb(var(--oui-color-primary))" }}
                    >
                      Trade on Uniswap ↗
                    </a>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Suspense fallback={<LoadingSpinner />}>
            <WooFiWidget />
          </Suspense>
        )}
      </div>
    </>
  );
}
