import { useState, useCallback } from "react";

const STORAGE_KEY = "frost-widget-visibility";

interface Visibility {
  ai: boolean;
  whale: boolean;
  sentiment: boolean;
  frost: boolean;
  smartmoney: boolean;
  liq: boolean;
  mac: boolean;
  palert: boolean;
}

// Perf: default to the two lightweight widgets only (AI is just a button until
// opened; Frost is the brand swap widget). The 6 data-polling analytics widgets
// (whale, sentiment, smartmoney, liq, mac, palert) stay OFF by default so first
// load stays light — each one lazy-loads its chunk + polls APIs only once enabled
// via the Widget Manager. Returning users keep their saved choices (merge below).
const DEFAULTS: Visibility = {
  ai: true, frost: true,
  whale: false, sentiment: false, smartmoney: false, liq: false, mac: false, palert: false,
};

function load(): Visibility {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULTS };
}

export function useWidgetVisibility() {
  const [visibility, setVisibility] = useState<Visibility>(load);

  const toggle = useCallback((key: keyof Visibility) => {
    setVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    const next = { ai: true, whale: true, sentiment: true, frost: true, smartmoney: true, liq: true, mac: true, palert: true };
    setVisibility(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const hideAll = useCallback(() => {
    const next = { ai: false, whale: false, sentiment: false, frost: false, smartmoney: false, liq: false, mac: false, palert: false };
    setVisibility(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const anyHidden = Object.values(visibility).some(v => !v);
  const allVisible = Object.values(visibility).every(v => v);

  return { visibility, toggle, showAll, hideAll, anyHidden, allVisible };
}
