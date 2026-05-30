import { useState, useCallback } from "react";

const STORAGE_KEY = "frost-widget-visibility";

interface Visibility {
  ai: boolean;
  whale: boolean;
  sentiment: boolean;
  frost: boolean;
  smartmoney: boolean;
  liq: boolean;
}

function load(): Visibility {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ai: true, whale: true, sentiment: true, frost: true, smartmoney: true, liq: true, ...JSON.parse(saved) };
  } catch {}
  return { ai: true, whale: true, sentiment: true, frost: true, smartmoney: true, liq: true };
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
    const next = { ai: true, whale: true, sentiment: true, frost: true, smartmoney: true, liq: true };
    setVisibility(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const anyHidden = Object.values(visibility).some(v => !v);

  return { visibility, toggle, showAll, anyHidden };
}
