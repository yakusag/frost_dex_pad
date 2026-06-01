import { useState, useCallback } from "react";
import {
  INITIAL_BUY_FEE_BPS,
  calcBuyQuote,
  calcAdvancedOptionsFee,
} from "@/services/solana";

const STORAGE_KEY = "frostdex_tokens_v1";
const VIRTUAL_SOL = 30;
const VIRTUAL_TOKENS = 1_000_000_000;
const GRADUATION_TARGET = 85;

export interface TokenData {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  creator: string;
  createdAt: number;
  website: string;
  telegram: string;
  twitter: string;
  virtualSol: number;
  virtualTokens: number;
  graduated: boolean;
  advancedOptions: string[];
  tradeHistory: Trade[];
  marketCap: number;
}

export interface Trade {
  type: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  price: number;
  ts: number;
  wallet: string;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website: string;
  telegram: string;
  twitter: string;
  advancedOptions: Record<string, boolean>;
  initialBuyEnabled: boolean;
  initialBuyAmount: number;
  walletAddress?: string;
}

function loadTokens(): TokenData[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveTokens(tokens: TokenData[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function useTokenCreation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createToken = useCallback(async (params: CreateTokenParams): Promise<TokenData | null> => {
    setError(null);
    setSuccess(null);

    if (!params.name.trim()) { setError("Token name is required."); return null; }
    if (!params.symbol.trim()) { setError("Token symbol is required."); return null; }
    if (!params.image) { setError("Token image is required."); return null; }

    setLoading(true);
    try {
      const mintAddress = `${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

      let virtualSol = VIRTUAL_SOL;
      let virtualTokens = VIRTUAL_TOKENS;
      const history: Trade[] = [];

      if (params.initialBuyEnabled && params.initialBuyAmount > 0) {
        const q = calcBuyQuote(virtualSol, virtualTokens, params.initialBuyAmount, INITIAL_BUY_FEE_BPS);
        virtualSol += params.initialBuyAmount - q.fee;
        virtualTokens -= q.tokensOut;
        history.push({
          type: "buy",
          solAmount: params.initialBuyAmount,
          tokenAmount: q.tokensOut,
          price: q.price,
          ts: Date.now(),
          wallet: params.walletAddress || "Creator",
        });
      }

      const selectedOptions = Object.entries(params.advancedOptions)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const advancedFee = calcAdvancedOptionsFee(params.advancedOptions);

      const token: TokenData = {
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        mint: mintAddress,
        name: params.name.trim(),
        symbol: params.symbol.trim().toUpperCase(),
        description: params.description.trim(),
        image: params.image,
        creator: params.walletAddress || "You",
        createdAt: Date.now(),
        website: params.website.trim(),
        telegram: params.telegram.trim(),
        twitter: params.twitter.trim(),
        virtualSol,
        virtualTokens,
        graduated: virtualSol >= GRADUATION_TARGET,
        advancedOptions: selectedOptions,
        tradeHistory: history,
        marketCap: (virtualSol / virtualTokens) * VIRTUAL_TOKENS,
      };

      const updated = [token, ...loadTokens()];
      saveTokens(updated);

      const feeMsg = advancedFee > 0 ? ` · Advanced fees: ${advancedFee.toFixed(3)} SOL` : "";
      setSuccess(`🎉 ${params.name} ($${params.symbol.toUpperCase()}) created! Mint: ${mintAddress}${feeMsg}`);

      return token;
    } catch (e: any) {
      setError(e?.message || "Failed to create token.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return { createToken, loading, error, success, clearMessages };
}
