import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import { lazy, Suspense, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import FrostTokenSwap from "@/components/FrostTokenSwap";

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
      <div className="w-full h-full flex flex-col items-center p-4 pt-8 gap-6">
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
          <FrostTokenSwap />
        ) : (
          <Suspense fallback={<LoadingSpinner />}>
            <WooFiWidget />
          </Suspense>
        )}
      </div>
    </>
  );
}
