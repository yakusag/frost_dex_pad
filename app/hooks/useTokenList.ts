import { useState, useEffect, useCallback } from "react";
import { TokenData } from "@/hooks/useTokenCreation";
import { calcBuyQuote, calcSellQuote, PLATFORM_FEE_BPS } from "@/services/solana";

const STORAGE_KEY = "frostdex_tokens_v1";
const GRADUATION_TARGET = 85;

function loadTokens(): TokenData[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveTokens(tokens: TokenData[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function useTokenList() {
  const [tokens, setTokens] = useState<TokenData[]>(loadTokens);
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => {
    setTokens(loadTokens());
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const addToken = useCallback((token: TokenData) => {
    setTokens(prev => {
      const updated = [token, ...prev];
      saveTokens(updated);
      return updated;
    });
  }, []);

  const executeBuy = useCallback((tokenId: string, solAmount: number, walletAddress = "Demo"): TokenData | null => {
    const all = loadTokens();
    const idx = all.findIndex(t => t.id === tokenId);
    if (idx === -1) return null;

    const t = { ...all[idx] };
    const q = calcBuyQuote(t.virtualSol, t.virtualTokens, solAmount, PLATFORM_FEE_BPS);

    t.virtualSol    += solAmount - q.fee;
    t.virtualTokens -= q.tokensOut;
    t.tradeHistory   = [
      { type: "buy", solAmount, tokenAmount: q.tokensOut, price: q.price, ts: Date.now(), wallet: walletAddress },
      ...t.tradeHistory,
    ].slice(0, 50);
    if (t.virtualSol >= GRADUATION_TARGET) t.graduated = true;
    t.marketCap = (t.virtualSol / t.virtualTokens) * 1_000_000_000;

    all[idx] = t;
    saveTokens(all);
    setTokens([...all]);
    return t;
  }, []);

  const executeSell = useCallback((tokenId: string, tokenAmount: number, walletAddress = "Demo"): TokenData | null => {
    const all = loadTokens();
    const idx = all.findIndex(t => t.id === tokenId);
    if (idx === -1) return null;

    const t = { ...all[idx] };
    const q = calcSellQuote(t.virtualSol, t.virtualTokens, tokenAmount, PLATFORM_FEE_BPS);

    t.virtualSol    -= q.solOut + q.fee;
    t.virtualTokens += tokenAmount;
    t.tradeHistory   = [
      { type: "sell", solAmount: q.solOut, tokenAmount, price: q.solOut / Math.max(tokenAmount, 1), ts: Date.now(), wallet: walletAddress },
      ...t.tradeHistory,
    ].slice(0, 50);
    t.marketCap = (t.virtualSol / t.virtualTokens) * 1_000_000_000;

    all[idx] = t;
    saveTokens(all);
    setTokens([...all]);
    return t;
  }, []);

  const filteredTokens = tokens.filter(t =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return { tokens: filteredTokens, allTokens: tokens, search, setSearch, refresh, addToken, executeBuy, executeSell };
}
