import { useState } from "react";

interface Props {
  visibility: { ai: boolean; whale: boolean; sentiment: boolean };
  anyHidden: boolean;
  onToggle: (key: "ai" | "whale" | "sentiment") => void;
  onShowAll: () => void;
}

const WIDGETS = [
  { key: "ai" as const, label: "FrostAI", icon: "🤖" },
  { key: "whale" as const, label: "Whale Alerts", icon: "🐋" },
  { key: "sentiment" as const, label: "Market Mood", icon: "📊" },
];

export default function WidgetManager({ visibility, anyHidden, onToggle, onShowAll }: Props) {
  const [open, setOpen] = useState(false);

  if (!anyHidden && !open) return null;

  return (
    <div className="wm-wrap">
      <button
        className="wm-fab"
        onClick={() => setOpen(v => !v)}
        title="Manage widgets"
      >
        {open ? "✕" : "⠿"}
      </button>

      {open && (
        <div className="wm-panel">
          <div className="wm-title">Widgets</div>
          {WIDGETS.map(w => (
            <div key={w.key} className="wm-row">
              <span className="wm-label">{w.icon} {w.label}</span>
              <button
                className={`wm-toggle ${visibility[w.key] ? "wm-toggle--on" : "wm-toggle--off"}`}
                onClick={() => onToggle(w.key)}
              >
                {visibility[w.key] ? "ON" : "OFF"}
              </button>
            </div>
          ))}
          {anyHidden && (
            <button className="wm-show-all" onClick={() => { onShowAll(); setOpen(false); }}>
              Show All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
