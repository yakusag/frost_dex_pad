import { useNavigate } from "react-router-dom";
import {
  MarketCategoriesConfigProvider,
  type MarketCategoryConfig,
} from "@orderly.network/hooks";
import { MarketsHomePage } from "@orderly.network/markets";
import {
  getRuntimeConfig,
  getRuntimeConfigBoolean,
} from "@/utils/runtime-config";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import { generatePageTitle } from "@/utils/utils";

const marketQuoteTabs: MarketCategoryConfig = (tabs, { componentKey }) => {
  if (componentKey !== "marketsDataList") return tabs;

  return [
    ...tabs,
    {
      id: "usdt-pairs",
      name: "USDT Pairs",
      match: (market) => /_USDT(?:_|$)/.test(market.symbol),
    },
    {
      id: "usdc-pairs",
      name: "USDC Pairs",
      match: (market) => /_USDC(?:_|$)/.test(market.symbol),
    },
  ];
};

export default function MarketsIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Markets");
  const navigate = useNavigate();

  return (
    <>
      {renderSEOTags(pageMeta, pageTitle)}
      <MarketCategoriesConfigProvider value={marketQuoteTabs}>
        <MarketsHomePage
          comparisonProps={{
            exchangesIconSrc: getRuntimeConfigBoolean("VITE_HAS_SECONDARY_LOGO")
              ? "/logo-secondary.webp"
              : undefined,
            exchangesName: getRuntimeConfig("VITE_ORDERLY_BROKER_NAME"),
          }}
          onSymbolChange={(symbol) => {
            navigate(`/perp/${symbol.symbol}`);
          }}
        />
      </MarketCategoriesConfigProvider>
    </>
  );
}
