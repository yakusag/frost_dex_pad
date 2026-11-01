import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Outlet } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import AIAssistant from "@/components/AIAssistant";
import FrostTradeWidget from "@/components/FrostTradeWidget";
import { HttpsRequiredWarning } from "@/components/HttpsRequiredWarning";
import IOSInstallGuide from "@/components/IOSInstallGuide";
import LeverageAutoMax from "@/components/LeverageAutoMax";
import LiqHeatmap from "@/components/LiqHeatmap";
import MACWidget from "@/components/MACWidget";
import MarketTickerBar from "@/components/MarketTickerBar";
import { NetworkStatus } from "@/components/NetworkStatus";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PriceAlert from "@/components/PriceAlert";
import ReferralHandler from "@/components/ReferralHandler";
import ReferralWelcome from "@/components/ReferralWelcome";
import SentimentDashboard from "@/components/SentimentDashboard";
import SmartMoney from "@/components/SmartMoney";
import WhaleAlerts from "@/components/WhaleAlerts";
import WidgetManager from "@/components/WidgetManager";
import OrderlyProvider from "@/components/orderlyProvider";
import { useWidgetVisibility } from "@/hooks/useWidgetVisibility";
import { withBasePath } from "./utils/base-path";
import { startFaviconAnimation } from "./utils/favicon-animation";
import { getSEOConfig, getUserLanguage } from "./utils/seo";

export default function App() {
  const seoConfig = getSEOConfig();
  const defaultLanguage = getUserLanguage();
  const { visibility, toggle, showAll, hideAll, anyHidden, allVisible } =
    useWidgetVisibility();

  useEffect(() => {
    if (typeof (window as any).__hideSplash === "function") {
      (window as any).__hideSplash();
    }
    startFaviconAnimation(withBasePath("/favicon.webp"));

    // One-time reset of widget positions to new left-side layout
    const LAYOUT_VER = "left-v1";
    if (localStorage.getItem("frost-layout-ver") !== LAYOUT_VER) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("widget-pos-"))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem("frost-layout-ver", LAYOUT_VER);
    }
  }, []);

  return (
    <>
      <Helmet>
        <html lang={defaultLanguage || seoConfig.language || "en"} />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="icon"
          type="image/webp"
          href={withBasePath("/favicon.webp")}
        />
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
      {visibility.frost && <FrostTradeWidget onHide={() => toggle("frost")} />}
      {visibility.ai && <AIAssistant onHide={() => toggle("ai")} />}
      {visibility.whale && <WhaleAlerts onHide={() => toggle("whale")} />}
      {visibility.smartmoney && (
        <SmartMoney onHide={() => toggle("smartmoney")} />
      )}
      {visibility.liq && <LiqHeatmap onHide={() => toggle("liq")} />}
      {visibility.mac && <MACWidget onHide={() => toggle("mac")} />}
      {visibility.palert && <PriceAlert onHide={() => toggle("palert")} />}
      {visibility.sentiment && (
        <SentimentDashboard onHide={() => toggle("sentiment")} />
      )}
      <WidgetManager
        visibility={visibility}
        anyHidden={anyHidden}
        allVisible={allVisible}
        onToggle={toggle}
        onShowAll={showAll}
        onHideAll={hideAll}
      />
      <PWAInstallPrompt />
      <IOSInstallGuide />
      <SpeedInsights />
      <Analytics />
    </>
  );
}
