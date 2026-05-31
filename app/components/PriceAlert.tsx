import { useEffect, useRef, useState, useCallback } from "react";
import { useDraggable } from "@/hooks/useDraggable";

interface Alert {
  id: string;
  symbol: string;
  base: string;
  target: number;
  direction: "above" | "below";
  createdAt: number;
  triggered?: boolean;
}

interface Notification {
  id: string;
  symbol: string;
  base: string;
  target: number;
  direction: "above" | "below";
  price: number;
}

const STORAGE_KEY = "frost-price-alerts";
const POLL_MS = 10_000;

function loadAlerts(): Alert[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveAlerts(alerts: Alert[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)); } catch {}
}

function fmtPrice(p: number) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

async function fetchPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "no-store" });
    if (!res.ok) return {};
    const rows: any[] = (await res.json())?.data?.rows ?? [];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.symbol] = Number(r["24h_close"] ?? r.mark_price ?? 0);
    return out;
  } catch { return {}; }
}

async function fetchSymbols(): Promise<{ symbol: string; base: string }[]> {
  try {
    const res = await fetch("https://api.orderly.org/v1/public/futures", { cache: "default" });
    if (!res.ok) return [];
    const rows: any[] = (await res.json())?.data?.rows ?? [];
    return rows
      .filter(r => r.symbol?.startsWith("PERP_"))
      .map(r => {
        const base = r.symbol.replace(/^PERP_/, "").replace(/_USDC.*$/, "");
        return { symbol: r.symbol, base };
      })
      .sort((a, b) => a.base.localeCompare(b.base));
  } catch { return []; }
}

interface Props { onHide: () => void; }

export default function PriceAlert({ onHide }: Props) {
  const [alerts, setAlerts]         = useState<Alert[]>(loadAlerts);
  const [open, setOpen]             = useState(false);
  const [hovered, setHovered]       = useState(false);
  const [notifications, setNotifs]  = useState<Notification[]>([]);
  const [prices, setPrices]         = useState<Record<string, number>>({});
  const [symbols, setSymbols]       = useState<{ symbol: string; base: string }[]>([]);
  const [symSearch, setSymSearch]   = useState("");
  const [selSymbol, setSelSymbol]   = useState("");
  const [targetVal, setTargetVal]   = useState("");
  const [direction, setDirection]   = useState<"above" | "below">("above");
  const [showForm, setShowForm]     = useState(false);
  const notifTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const defaultPos = { x: 12, y: 278 };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } =
    useDraggable("price-alert-widget", defaultPos);

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", right: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0 };

  // Load symbols once
  useEffect(() => {
    fetchSymbols().then(s => {
      setSymbols(s);
      if (s.length > 0 && !selSymbol) setSelSymbol(s[0].symbol);
    });
  }, []);

  // Poll prices
  const poll = useCallback(async () => {
    const p = await fetchPrices();
    setPrices(p);

    setAlerts(prev => {
      const triggered: Alert[] = [];
      const remaining: Alert[] = [];
      for (const a of prev) {
        if (a.triggered) { remaining.push(a); continue; }
        const cur = p[a.symbol];
        if (!cur) { remaining.push(a); continue; }
        const hit = a.direction === "above" ? cur >= a.target : cur <= a.target;
        if (hit) {
          triggered.push({ ...a, triggered: true });
          setNotifs(n => [
            { id: a.id, symbol: a.symbol, base: a.base, target: a.target, direction: a.direction, price: cur },
            ...n.slice(0, 4),
          ]);
          // auto-dismiss notification after 8s
          notifTimers.current[a.id] = setTimeout(() => {
            setNotifs(n => n.filter(x => x.id !== a.id));
          }, 8000);
        } else {
          remaining.push(a);
        }
      }
      if (triggered.length === 0) return prev;
      const next = [...remaining, ...triggered];
      saveAlerts(next);
      return next;
    });
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const addAlert = () => {
    const target = parseFloat(targetVal);
    if (!selSymbol || isNaN(target) || target <= 0) return;
    const base = selSymbol.replace(/^PERP_/, "").replace(/_USDC.*$/, "");
    const newAlert: Alert = {
      id: Date.now().toString(),
      symbol: selSymbol,
      base,
      target,
      direction,
      createdAt: Date.now(),
    };
    const next = [newAlert, ...alerts.filter(a => !a.triggered)];
    setAlerts(next);
    saveAlerts(next);
    setTargetVal("");
    setShowForm(false);
  };

  const removeAlert = (id: string) => {
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next);
    saveAlerts(next);
    clearTimeout(notifTimers.current[id]);
    setNotifs(n => n.filter(x => x.id !== id));
  };

  const dismissNotif = (id: string) => {
    clearTimeout(notifTimers.current[id]);
    setNotifs(n => n.filter(x => x.id !== id));
  };

  const activeAlerts  = alerts.filter(a => !a.triggered);
  const firedAlerts   = alerts.filter(a => a.triggered);
  const filteredSyms  = symbols.filter(s =>
    !symSearch || s.base.toLowerCase().includes(symSearch.toLowerCase()) || s.symbol.toLowerCase().includes(symSearch.toLowerCase())
  ).slice(0, 80);

  const curPrice = prices[selSymbol] ?? 0;
  const pendingCount = activeAlerts.length;

  return (
    <>
      {/* Global notifications — rendered outside the widget */}
      <div className="palert-notif-wrap" aria-live="polite">
        {notifications.map(n => (
          <div key={n.id} className={`palert-notif ${n.direction === "above" ? "palert-notif--bull" : "palert-notif--bear"}`}>
            <span className="palert-notif-icon">{n.direction === "above" ? "🎯" : "🎯"}</span>
            <div className="palert-notif-body">
              <div className="palert-notif-title">
                {n.base} {n.direction === "above" ? "crossed above" : "dropped below"} ${fmtPrice(n.target)}
              </div>
              <div className="palert-notif-price">Current: ${fmtPrice(n.price)}</div>
            </div>
            <button className="palert-notif-close" onClick={() => dismissNotif(n.id)}>✕</button>
          </div>
        ))}
      </div>

      {/* Widget */}
      <div
        ref={elementRef}
        {...dragHandleProps}
        style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto", cursor: isDragging ? "grabbing" : "grab", transition: isSnapping ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)" : "none" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {(hovered || isMobile) && !open && (
          <div className="widget-controls widget-controls--right">
            <button className="widget-hide-btn" onMouseDown={e => e.stopPropagation()} onClick={onHide} title="Hide">✕</button>
          </div>
        )}

        <button
          className="palert-fab"
          onClick={() => { if (wasDragged()) return; setOpen(v => !v); }}
          aria-label="Price Alerts"
        >
          <span className="palert-fab-icon">🔔</span>
          {pendingCount > 0 && <span className="palert-fab-badge">{pendingCount}</span>}
        </button>

        {open && (
          <div className="palert-panel" style={{ ...panelStyle, width: 300, maxWidth: "calc(100vw - 24px)" }}>
            {/* Header */}
            <div className="palert-header">
              <div className="palert-header-left">
                <span style={{ fontSize: 14 }}>🔔</span>
                <div>
                  <div className="palert-title">Price Alerts</div>
                  <div className="palert-sub">{pendingCount} active · checks every 10s</div>
                </div>
              </div>
              <button
                className="palert-add-btn"
                onClick={() => { setShowForm(v => !v); }}
                onMouseDown={e => e.stopPropagation()}
              >
                {showForm ? "✕" : "+ Add"}
              </button>
            </div>

            {/* Add alert form */}
            {showForm && (
              <div className="palert-form" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                {/* Symbol picker */}
                <div className="palert-form-label">Symbol</div>
                <input
                  className="palert-sym-search"
                  placeholder="Search pair…"
                  value={symSearch}
                  onChange={e => setSymSearch(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                />
                <div className="palert-sym-list">
                  {filteredSyms.map(s => (
                    <button
                      key={s.symbol}
                      className={`palert-sym-btn ${selSymbol === s.symbol ? "palert-sym-btn--active" : ""}`}
                      onClick={() => { setSelSymbol(s.symbol); setSymSearch(""); }}
                    >
                      {s.base}
                    </button>
                  ))}
                </div>

                {/* Current price hint */}
                {selSymbol && curPrice > 0 && (
                  <div className="palert-cur-price">
                    Current <strong>{selSymbol.replace("PERP_", "").replace("_USDC", "")}</strong>: ${fmtPrice(curPrice)}
                  </div>
                )}

                {/* Direction toggle */}
                <div className="palert-dir-row">
                  <button
                    className={`palert-dir-btn ${direction === "above" ? "palert-dir-btn--bull" : ""}`}
                    onClick={() => setDirection("above")}
                  >▲ Above</button>
                  <button
                    className={`palert-dir-btn ${direction === "below" ? "palert-dir-btn--bear" : ""}`}
                    onClick={() => setDirection("below")}
                  >▼ Below</button>
                </div>

                {/* Target price */}
                <div className="palert-form-label" style={{ marginTop: 8 }}>Target Price (USDC)</div>
                <div className="palert-input-row">
                  <input
                    className="palert-price-input"
                    type="number"
                    placeholder={curPrice > 0 ? fmtPrice(curPrice) : "0.00"}
                    value={targetVal}
                    onChange={e => setTargetVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addAlert(); }}
                    onMouseDown={e => e.stopPropagation()}
                  />
                  <button className="palert-submit-btn" onClick={addAlert}>Set</button>
                </div>
              </div>
            )}

            {/* Active alerts list */}
            <div className="palert-list" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              {activeAlerts.length === 0 && firedAlerts.length === 0 && (
                <div className="palert-empty">No alerts set yet.<br/>Tap <strong>+ Add</strong> to create one.</div>
              )}

              {activeAlerts.map(a => {
                const cur = prices[a.symbol] ?? 0;
                const pct = cur > 0 ? ((a.target - cur) / cur * 100) : 0;
                return (
                  <div key={a.id} className="palert-row">
                    <div className="palert-row-left">
                      <span className="palert-row-base">{a.base}</span>
                      <span className={`palert-row-dir ${a.direction === "above" ? "palert-row-dir--bull" : "palert-row-dir--bear"}`}>
                        {a.direction === "above" ? "▲" : "▼"}
                      </span>
                      <div>
                        <div className="palert-row-target">${fmtPrice(a.target)}</div>
                        {cur > 0 && (
                          <div className="palert-row-dist">
                            {Math.abs(pct).toFixed(2)}% {a.direction === "above" ? "away ↑" : "away ↓"}
                          </div>
                        )}
                      </div>
                    </div>
                    <button className="palert-row-del" onClick={() => removeAlert(a.id)} title="Remove">✕</button>
                  </div>
                );
              })}

              {firedAlerts.length > 0 && (
                <>
                  <div className="palert-section-label">Triggered</div>
                  {firedAlerts.map(a => (
                    <div key={a.id} className="palert-row palert-row--fired">
                      <div className="palert-row-left">
                        <span className="palert-row-base" style={{ opacity: 0.5 }}>{a.base}</span>
                        <span className="palert-row-fired-badge">FIRED</span>
                        <div className="palert-row-target" style={{ opacity: 0.5 }}>${fmtPrice(a.target)}</div>
                      </div>
                      <button className="palert-row-del" onClick={() => removeAlert(a.id)} title="Remove">✕</button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="palert-footer">
              Live price checks · Alerts reset on page refresh
            </div>
          </div>
        )}
      </div>
    </>
  );
}
