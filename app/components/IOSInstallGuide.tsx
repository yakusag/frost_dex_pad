import { useEffect, useState } from "react";
import { X } from "lucide-react";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    (window.navigator as any).standalone === true
  );
}

export default function IOSInstallGuide() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOS()) return;
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem("ios-guide-dismissed")) return;
    const timer = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <>
      <style>{`
        @keyframes ios-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ios-arrow {
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-top: 10px solid rgba(56,224,248,0.22);
        }
        .ios-arrow-inner {
          position: absolute;
          bottom: -9px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 9px solid transparent;
          border-right: 9px solid transparent;
          border-top: 9px solid rgba(14,18,28,0.97);
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          width: "calc(100% - 28px)",
          maxWidth: "400px",
          animation: "ios-rise 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
          pointerEvents: "all",
        }}
      >
        <div
          style={{
            background: "rgba(14,18,28,0.97)",
            border: "1px solid rgba(56,224,248,0.22)",
            borderRadius: "18px",
            padding: "16px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(56,224,248,0.06)",
            position: "relative",
          }}
        >
          <div className="ios-arrow" />
          <div className="ios-arrow-inner" />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <img src="/favicon.webp" alt="FrostDex" style={{ width: "36px", height: "36px", borderRadius: "9px" }} />
              <div>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: "13px", margin: 0 }}>Install FrostDex</p>
                <p style={{ color: "rgba(255,255,255,0.38)", fontSize: "11px", margin: "2px 0 0" }}>Add to Home Screen</p>
              </div>
            </div>
            <button
              onClick={() => { setShow(false); sessionStorage.setItem("ios-guide-dismissed", "1"); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", padding: "2px" }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              {
                step: "1",
                icon: (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(56,224,248,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                ),
                text: "Tap the Share button in Safari",
              },
              {
                step: "2",
                icon: (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(56,224,248,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                ),
                text: 'Scroll down and tap "Add to Home Screen"',
              },
              {
                step: "3",
                icon: (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(14,203,129,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ),
                text: 'Tap "Add" — FrostDex is on your home screen!',
                green: true,
              },
            ].map((s) => (
              <div key={s.step} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "28px", height: "28px", borderRadius: "8px", flexShrink: 0,
                  background: s.green ? "rgba(14,203,129,0.1)" : "rgba(56,224,248,0.08)",
                  border: s.green ? "1px solid rgba(14,203,129,0.25)" : "1px solid rgba(56,224,248,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {s.icon}
                </div>
                <p style={{ color: s.green ? "rgba(14,203,129,0.85)" : "rgba(255,255,255,0.55)", fontSize: "12px", margin: 0, lineHeight: 1.4 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
