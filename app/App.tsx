import { lazy, Suspense, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import OrderlyProvider from "@/components/orderlyProvider";
import { HttpsRequiredWarning } from "@/components/HttpsRequiredWarning";
import { NetworkStatus } from "@/components/NetworkStatus";
import LeverageAutoMax from "@/components/LeverageAutoMax";
import ReferralHandler from "@/components/ReferralHandler";
import ReferralWelcome from "@/components/ReferralWelcome";
import MarketTickerBar from "@/components/MarketTickerBar";
import RoutePrefetcher from "@/components/RoutePrefetcher";
import { useWidgetVisibility } from "@/hooks/useWidgetVisibility";
import { withBasePath } from "./utils/base-path";
import { getSEOConfig, getUserLanguage } from "./utils/seo";
import { startFaviconAnimation } from "./utils/favicon-animation";

const AIAssistant      = lazy(() => import("@/components/AIAssistant"));
const WhaleAlerts      = lazy(() => import("@/components/WhaleAlerts"));
const SentimentDashboard = lazy(() => import("@/components/SentimentDashboard"));
const FrostTradeWidget = lazy(() => import("@/components/FrostTradeWidget"));
const SmartMoney       = lazy(() => import("@/components/SmartMoney"));
const LiqHeatmap       = lazy(() => import("@/components/LiqHeatmap"));
const MACWidget        = lazy(() => import("@/components/MACWidget"));
const PriceAlert       = lazy(() => import("@/components/PriceAlert"));
const WidgetManager    = lazy(() => import("@/components/WidgetManager"));

export default function App() {
  const seoConfig = getSEOConfig();
  const defaultLanguage = getUserLanguage();
  const { visibility, toggle, showAll, hideAll, anyHidden, allVisible } = useWidgetVisibility();

  useEffect(() => {
    if (typeof (window as any).__hideSplash === "function") {
      (window as any).__hideSplash();
    }
    startFaviconAnimation(withBasePath("/favicon.webp"));

    const LAYOUT_VER = "left-v1";
    if (localStorage.getItem("frost-layout-ver") !== LAYOUT_VER) {
      Object.keys(localStorage)
        .filter(k => k.startsWith("widget-pos-"))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem("frost-layout-ver", LAYOUT_VER);
    }
  }, []);

  return (
    <>
      <Helmet>
        <html lang={seoConfig.language || defaultLanguage} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/webp" href={withBasePath("/favicon.webp")} />
      </Helmet>
      <RoutePrefetcher />
      <HttpsRequiredWarning />
      <NetworkStatus />
      <ReferralHandler />
      <ReferralWelcome />
      <MarketTickerBar />
      <OrderlyProvider>
        <LeverageAutoMax />
        <Outlet />
      </OrderlyProvider>
      <Suspense fallback={null}>
        {visibility.frost      && <FrostTradeWidget  onHide={() => toggle("frost")} />}
        {visibility.ai         && <AIAssistant        onHide={() => toggle("ai")} />}
        {visibility.whale      && <WhaleAlerts         onHide={() => toggle("whale")} />}
        {visibility.smartmoney && <SmartMoney          onHide={() => toggle("smartmoney")} />}
        {visibility.liq        && <LiqHeatmap          onHide={() => toggle("liq")} />}
        {visibility.mac        && <MACWidget            onHide={() => toggle("mac")} />}
        {visibility.palert     && <PriceAlert           onHide={() => toggle("palert")} />}
        {visibility.sentiment  && <SentimentDashboard  onHide={() => toggle("sentiment")} />}
        <WidgetManager
          visibility={visibility}
          anyHidden={anyHidden}
          allVisible={allVisible}
          onToggle={toggle}
          onShowAll={showAll}
          onHideAll={hideAll}
        />
      </Suspense>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
