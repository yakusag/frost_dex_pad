import { useEffect } from "react";
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
import AIAssistant from "@/components/AIAssistant";
import WhaleAlerts from "@/components/WhaleAlerts";
import SentimentDashboard from "@/components/SentimentDashboard";
import FrostTradeWidget from "@/components/FrostTradeWidget";
import SmartMoney from "@/components/SmartMoney";
import LiqHeatmap from "@/components/LiqHeatmap";
import MACWidget from "@/components/MACWidget";
import WidgetManager from "@/components/WidgetManager";
import { useWidgetVisibility } from "@/hooks/useWidgetVisibility";
import { withBasePath } from "./utils/base-path";
import { getSEOConfig, getUserLanguage } from "./utils/seo";
import { startFaviconAnimation } from "./utils/favicon-animation";

export default function App() {
  const seoConfig = getSEOConfig();
  const defaultLanguage = getUserLanguage();
  const { visibility, toggle, showAll, anyHidden } = useWidgetVisibility();

  useEffect(() => {
    if (typeof (window as any).__hideSplash === "function") {
      (window as any).__hideSplash();
    }
    startFaviconAnimation(withBasePath("/favicon.webp"));
  }, []);

  return (
    <>
      <Helmet>
        <html lang={seoConfig.language || defaultLanguage} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/webp" href={withBasePath("/favicon.webp")} />
      </Helmet>
      <HttpsRequiredWarning />
      <NetworkStatus />
      <ReferralHandler />
      <ReferralWelcome />
      <MarketTickerBar />
      <OrderlyProvider>
        <LeverageAutoMax />
        <Outlet />
      </OrderlyProvider>
      {visibility.frost      && <FrostTradeWidget  onHide={() => toggle("frost")} />}
      {visibility.ai         && <AIAssistant        onHide={() => toggle("ai")} />}
      {visibility.whale      && <WhaleAlerts         onHide={() => toggle("whale")} />}
      {visibility.smartmoney && <SmartMoney          onHide={() => toggle("smartmoney")} />}
      {visibility.liq        && <LiqHeatmap          onHide={() => toggle("liq")} />}
      {visibility.mac        && <MACWidget            onHide={() => toggle("mac")} />}
      {visibility.sentiment  && <SentimentDashboard  onHide={() => toggle("sentiment")} />}
      <WidgetManager
        visibility={visibility}
        anyHidden={anyHidden}
        onToggle={toggle}
        onShowAll={showAll}
      />
      <SpeedInsights />
      <Analytics />
    </>
  );
}
