import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const SHOWN_KEY = "referral_welcome_shown";

export default function ReferralWelcome() {
  const [searchParams] = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState("");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref") || searchParams.get("referral");
    if (!ref) return;
    const alreadyShown = sessionStorage.getItem(SHOWN_KEY);
    if (alreadyShown) return;
    setCode(ref.trim());
    const t = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SHOWN_KEY, "1");
    }, 1800);
    return () => clearTimeout(t);
  }, [searchParams]);

  const close = () => {
    setClosing(true);
    setTimeout(() => setVisible(false), 400);
  };

  if (!visible) return null;

  return (
    <div
      className={`referral-welcome-overlay${closing ? " rw-closing" : ""}`}
      onClick={close}
    >
      <div
        className="referral-welcome-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rw-glow" />

        <div className="rw-icon">❄️</div>

        <div className="rw-title">Welcome to FrostDex</div>
        <div className="rw-sub">
          You were invited via a referral link
        </div>

        <div className="rw-code-box">
          <span className="rw-code-label">Referral Code</span>
          <span className="rw-code-value">{code}</span>
        </div>

        <div className="rw-perks">
          <div className="rw-perk">
            <span className="rw-perk-icon">💎</span>
            <span>Reduced trading fees</span>
          </div>
          <div className="rw-perk">
            <span className="rw-perk-icon">⚡</span>
            <span>Instant access to all markets</span>
          </div>
          <div className="rw-perk">
            <span className="rw-perk-icon">🔒</span>
            <span>Non-custodial &amp; on-chain</span>
          </div>
        </div>

        <button className="rw-btn" onClick={close}>
          Start Trading
        </button>
      </div>
    </div>
  );
}
