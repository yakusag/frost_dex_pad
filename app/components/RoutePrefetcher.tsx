import { useEffect, useRef } from "react";

const ROUTE_MAP: Record<string, () => void> = {
  "/":           () => { import("../pages/perp/Layout"); import("../pages/perp/Index"); },
  "/perp":       () => { import("../pages/perp/Layout"); import("../pages/perp/Index"); },
  "/portfolio":  () => { import("../pages/portfolio/Layout"); import("../pages/portfolio/Index"); },
  "/markets":    () => { import("../pages/markets/Layout"); import("../pages/markets/Index"); },
  "/swap":       () => { import("../pages/swap/Layout"); import("../pages/swap/Index"); },
  "/leaderboard":() => { import("../pages/leaderboard/Layout"); import("../pages/leaderboard/Index"); },
  "/rewards":    () => { import("../pages/rewards/Layout"); import("../pages/rewards/Index"); },
  "/vaults":     () => { import("../pages/vaults/Layout"); import("../pages/vaults/Index"); },
  "/bot":        () => { import("../pages/bot/Layout"); import("../pages/bot/Index"); },
  "/about":      () => { import("../pages/about/Layout"); import("../pages/about/Index"); },
  "/token":      () => { import("../pages/token/Layout"); import("../pages/token/Index"); },
  "/points":     () => { import("../pages/points/Layout"); import("../pages/points/Index"); },
};

export default function RoutePrefetcher() {
  const prefetched = useRef(new Set<string>());

  useEffect(() => {
    function onHover(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("http") || href.startsWith("#")) return;

      try {
        const pathname = new URL(href, window.location.origin).pathname
          .replace(/\/$/, "") || "/";

        const key = Object.keys(ROUTE_MAP).find(
          (k) => pathname === k || pathname.startsWith(k + "/")
        );
        if (!key || prefetched.current.has(key)) return;

        prefetched.current.add(key);
        ROUTE_MAP[key]();
      } catch {}
    }

    document.addEventListener("mouseover", onHover, { passive: true });
    return () => document.removeEventListener("mouseover", onHover);
  }, []);

  return null;
}
