import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { withBasePath } from './utils/base-path';
import { getRuntimeConfig } from './utils/runtime-config';

import './styles/index.css';

const IndexPage = lazy(() => import('./pages/Index'));
const PerpLayout = lazy(() => import('./pages/perp/Layout'));
const PerpIndex = lazy(() => import('./pages/perp/Index'));
const PerpSymbol = lazy(() => import('./pages/perp/Symbol'));
const PortfolioLayout = lazy(() => import('./pages/portfolio/Layout'));
const PortfolioIndex = lazy(() => import('./pages/portfolio/Index'));
const PortfolioPositions = lazy(() => import('./pages/portfolio/Positions'));
const PortfolioOrders = lazy(() => import('./pages/portfolio/Orders'));
const PortfolioAssets = lazy(() => import('./pages/portfolio/Assets'));
const PortfolioApiKey = lazy(() => import('./pages/portfolio/ApiKey'));
const PortfolioFee = lazy(() => import('./pages/portfolio/Fee'));
const PortfolioHistory = lazy(() => import('./pages/portfolio/History'));
const PortfolioSetting = lazy(() => import('./pages/portfolio/Setting'));
const MarketsLayout = lazy(() => import('./pages/markets/Layout'));
const MarketsIndex = lazy(() => import('./pages/markets/Index'));
const LeaderboardLayout = lazy(() => import('./pages/leaderboard/Layout'));
const LeaderboardIndex = lazy(() => import('./pages/leaderboard/Index'));
const RewardsLayout = lazy(() => import('./pages/rewards/Layout'));
const RewardsIndex = lazy(() => import('./pages/rewards/Index'));
const RewardsAffiliate = lazy(() => import('./pages/rewards/Affiliate'));
const VaultsLayout = lazy(() => import('./pages/vaults/Layout'));
const VaultsIndex = lazy(() => import('./pages/vaults/Index'));
const SwapLayout = lazy(() => import('./pages/swap/Layout'));
const SwapIndex = lazy(() => import('./pages/swap/Index'));
const PointsLayout = lazy(() => import('./pages/points/Layout'));
const PointsIndex = lazy(() => import('./pages/points/Index'));
const BotLayout = lazy(() => import('./pages/bot/Layout'));
const BotIndex = lazy(() => import('./pages/bot/Index'));
const CreateTokenLayout = lazy(() => import('./pages/create-token/Layout'));
const CreateTokenIndex = lazy(() => import('./pages/create-token/Index'));


async function loadRuntimeConfig() {
  return new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = withBasePath('/config.js');
    script.onload = () => {
      console.log('Runtime config loaded successfully');
      resolve();
    };
    script.onerror = () => {
      console.log('Runtime config not found, using build-time env vars');
      resolve();
    };
    document.head.appendChild(script);
  });
}

function loadAnalytics() {
  const analyticsScript = getRuntimeConfig('VITE_ANALYTICS_SCRIPT');

  if (analyticsScript) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(analyticsScript, 'text/html');
    const scripts = doc.querySelectorAll('script');
    
    scripts.forEach((originalScript) => {
      const newScript = document.createElement('script');
      
      Array.from(originalScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      
      if (originalScript.textContent) {
        newScript.textContent = originalScript.textContent;
      }
      
      document.head.appendChild(newScript);
    });
  }
}

const basePath = import.meta.env.BASE_URL || '/';

const PageFallback = () => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0e11" }}>
    <div style={{ width: 32, height: 32, border: "3px solid rgba(56,224,248,0.15)", borderTopColor: "#38e0f8", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Suspense fallback={<PageFallback />}><IndexPage /></Suspense> },
      {
        path: 'perp',
        element: <Suspense fallback={<PageFallback />}><PerpLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><PerpIndex /></Suspense> },
          { path: ':symbol', element: <Suspense fallback={<PageFallback />}><PerpSymbol /></Suspense> },
        ],
      },
      {
        path: 'portfolio',
        element: <Suspense fallback={<PageFallback />}><PortfolioLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><PortfolioIndex /></Suspense> },
          { path: 'positions', element: <Suspense fallback={<PageFallback />}><PortfolioPositions /></Suspense> },
          { path: 'orders', element: <Suspense fallback={<PageFallback />}><PortfolioOrders /></Suspense> },
          { path: 'assets', element: <Suspense fallback={<PageFallback />}><PortfolioAssets /></Suspense> },
          { path: 'api-key', element: <Suspense fallback={<PageFallback />}><PortfolioApiKey /></Suspense> },
          { path: 'fee', element: <Suspense fallback={<PageFallback />}><PortfolioFee /></Suspense> },
          { path: 'history', element: <Suspense fallback={<PageFallback />}><PortfolioHistory /></Suspense> },
          { path: 'setting', element: <Suspense fallback={<PageFallback />}><PortfolioSetting /></Suspense> },
        ],
      },
      {
        path: 'markets',
        element: <Suspense fallback={<PageFallback />}><MarketsLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><MarketsIndex /></Suspense> },
        ],
      },
      {
        path: 'leaderboard',
        element: <Suspense fallback={<PageFallback />}><LeaderboardLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><LeaderboardIndex /></Suspense> },
        ],
      },
      {
        path: 'rewards',
        element: <Suspense fallback={<PageFallback />}><RewardsLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><RewardsIndex /></Suspense> },
          { path: 'affiliate', element: <Suspense fallback={<PageFallback />}><RewardsAffiliate /></Suspense> },
        ],
      },
      {
        path: 'vaults',
        element: <Suspense fallback={<PageFallback />}><VaultsLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><VaultsIndex /></Suspense> },
        ],
      },
      {
        path: 'swap',
        element: <Suspense fallback={<PageFallback />}><SwapLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><SwapIndex /></Suspense> },
        ],
      },
      {
        path: 'points',
        element: <Suspense fallback={<PageFallback />}><PointsLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><PointsIndex /></Suspense> },
        ],
      },
      {
        path: 'bot',
        element: <Suspense fallback={<PageFallback />}><BotLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><BotIndex /></Suspense> },
        ],
      },
      {
        path: 'create-token',
        element: <Suspense fallback={<PageFallback />}><CreateTokenLayout /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<PageFallback />}><CreateTokenIndex /></Suspense> },
        ],
      },
    ],
  },
], { basename: basePath });

function prefetchRoutes() {
  const prefetch = () => {
    import('./pages/perp/Layout');
    import('./pages/perp/Index');
    import('./pages/portfolio/Layout');
    import('./pages/portfolio/Index');
    import('./pages/markets/Layout');
    import('./pages/markets/Index');
    import('./pages/leaderboard/Layout');
    import('./pages/leaderboard/Index');
    import('./pages/swap/Layout');
    import('./pages/swap/Index');
    import('./pages/bot/Layout');
    import('./pages/bot/Index');
    import('./pages/rewards/Layout');
    import('./pages/rewards/Index');
    import('./pages/vaults/Layout');
    import('./pages/vaults/Index');
    import('./pages/create-token/Layout');
    import('./pages/create-token/Index');
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(prefetch, { timeout: 3000 });
  } else {
    setTimeout(prefetch, 2000);
  }
}

loadRuntimeConfig().then(() => {
  loadAnalytics();
  
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HelmetProvider>
        <RouterProvider router={router} />
      </HelmetProvider>
    </React.StrictMode>
  );

  prefetchRoutes();
});

// Recover from stale dynamic-import chunks after a new deployment.
// When the page's HTML references a chunk hash that no longer exists on the
// server (e.g. "Failed to fetch dynamically imported module"), reload once to
// pull the fresh index.html and its current chunk references.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('vitePreloadReload') || '0');
  if (Date.now() - last > 10000) {
    sessionStorage.setItem('vitePreloadReload', String(Date.now()));
    window.location.reload();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(withBasePath('/sw.js'))
      .then((registration) => {
        console.log('SW registered:', registration);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

