import { useState, useEffect, useRef, useCallback } from "react";
import type { Candle } from "@/components/BotChart";

export const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  ARB: "ARBUSDT",
  BNB: "BNBUSDT",
};

const TF_LIMIT: Record<string, number> = {
  "15m": 96,
  "1h": 120,
  "4h": 90,
  "1d": 180,
};

function mapKline(k: (string | number)[]): Candle {
  return {
    t: k[0] as number,
    o: parseFloat(k[1] as string),
    h: parseFloat(k[2] as string),
    l: parseFloat(k[3] as string),
    c: parseFloat(k[4] as string),
    v: parseFloat(k[5] as string),
  };
}

export interface BinanceFeedResult {
  candles: Candle[];
  latestPrice: number | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  refetch: () => void;
}

export function useBinanceFeed(
  symbol: string,
  timeframe: string,
  liveEnabled = false
): BinanceFeedResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const binanceSymbol = BINANCE_SYMBOLS[symbol];
  const limit = TF_LIMIT[timeframe] ?? 120;

  const fetchCandles = useCallback(() => {
    if (!binanceSymbol) {
      setError("Symbol not on Binance");
      setLoading(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${timeframe}&limit=${limit}`,
      { signal: ctrl.signal }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: (string | number)[][]) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(mapKline);
          setCandles(mapped);
          setLatestPrice(mapped[mapped.length - 1].c);
        } else {
          setError("Empty response");
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") {
          setError(e?.message ?? "Fetch failed");
          setLoading(false);
        }
      });
  }, [binanceSymbol, timeframe, limit]);

  // Fetch historical klines on symbol/tf change
  useEffect(() => {
    fetchCandles();
    return () => { abortRef.current?.abort(); };
  }, [fetchCandles]);

  // WebSocket for live candle updates
  useEffect(() => {
    if (!liveEnabled || !binanceSymbol) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnected(false);
      }
      return;
    }

    const streamName = `${binanceSymbol.toLowerCase()}@kline_${timeframe}`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const k = msg.k;
        if (!k) return;
        const candle: Candle = {
          t: k.t as number,
          o: parseFloat(k.o as string),
          h: parseFloat(k.h as string),
          l: parseFloat(k.l as string),
          c: parseFloat(k.c as string),
          v: parseFloat(k.v as string),
        };
        setLatestPrice(candle.c);
        setCandles((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.t === candle.t) {
            return [...prev.slice(0, -1), candle];
          } else if (candle.t > last.t) {
            return [...prev.slice(-(limit - 1)), candle];
          }
          return prev;
        });
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [liveEnabled, binanceSymbol, timeframe, limit]);

  return { candles, latestPrice, loading, error, wsConnected, refetch: fetchCandles };
}
