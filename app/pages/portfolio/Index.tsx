import { Suspense, lazy } from "react";
import { OverviewModule } from "@orderly.network/portfolio";
import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";

const PnlChart = lazy(() => import("@/components/PnlChart"));

export default function PortfolioIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Portfolio");

  return (
    <div className="oui-portfolio-page">
      {renderSEOTags(pageMeta, pageTitle)}
      <Suspense fallback={null}>
        <PnlChart />
      </Suspense>
      <OverviewModule.OverviewPage />
    </div>
  );
}
