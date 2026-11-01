import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as any).standalone === true;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem("pwa-dismissed")) return;

    if (isAndroid()) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler as any);
      return () => window.removeEventListener("beforeinstallprompt", handler as any);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("appinstalled", () => setInstalled(true));
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem("pwa-dismissed", "1");
  };

  if (!show || installed) return null;

  return (
    <>
      <style>{`
        @keyframes pwa-rise {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pwa-btn:active { transform: scale(0.97); }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          padding: "12px 16px 20px",
          background: "linear-gradient(180deg, rgba(10,13,20,0.0) 0%, rgba(10,13,20,0.98) 18%)",
          animation: "pwa-rise 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "all",
            maxWidth: "480px",
            margin: "0 auto",
            background: "rgba(14,18,28,0.96)",
            border: "1px solid rgba(56,224,248,0.22)",
            borderRadius: "20px",
            padding: "14px 14px 14px 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 -4px 40px rgba(56,224,248,0.08), 0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
          <img
            src="/favicon.webp"
            alt="FrostDex"
            style={{ width: "48px", height: "48px", borderRadius: "12px", flexShrink: 0 }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "14px", margin: 0, lineHeight: 1.3 }}>
              Install FrostDex App
            </p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: "3px 0 0" }}>
              Trade faster from your home screen
            </p>
          </div>

          <button
            className="pwa-btn"
            onClick={handleInstall}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "linear-gradient(135deg, rgba(56,224,248,0.22) 0%, rgba(14,203,129,0.16) 100%)",
              color: "rgba(56,224,248,1)",
              border: "1px solid rgba(56,224,248,0.4)",
              borderRadius: "12px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
              boxShadow: "0 0 16px rgba(56,224,248,0.18)",
              transition: "transform 0.1s",
            }}
          >
            <Download size={14} />
            Install
          </button>

          <button
            onClick={handleDismiss}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.25)",
              cursor: "pointer",
              padding: "6px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
