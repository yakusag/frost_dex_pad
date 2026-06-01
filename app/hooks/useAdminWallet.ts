import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "frost_admin_wallet";
const STORAGE_SIG_KEY = "frost_admin_wallet_sig";

declare const __ADMIN_WALLET__: string;
const ENV_ADMIN_WALLET: string =
  (typeof __ADMIN_WALLET__ !== "undefined" ? __ADMIN_WALLET__ : "") || "";

export function useAdminWallet() {
  const [adminWallet, setAdminWallet] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || ENV_ADMIN_WALLET || "";
    } catch {
      return ENV_ADMIN_WALLET || "";
    }
  });
  const [signature, setSignature] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_SIG_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || ENV_ADMIN_WALLET || "";
    setAdminWallet(stored);
    setSignature(localStorage.getItem(STORAGE_SIG_KEY) || "");
  }, []);

  const saveAdminWallet = useCallback((address: string, sig: string) => {
    localStorage.setItem(STORAGE_KEY, address);
    localStorage.setItem(STORAGE_SIG_KEY, sig);
    setAdminWallet(address);
    setSignature(sig);
  }, []);

  const clearAdminWallet = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_SIG_KEY);
    setAdminWallet(ENV_ADMIN_WALLET || "");
    setSignature("");
  }, []);

  const isVerified = !!signature && !!adminWallet;

  return { adminWallet, signature, isVerified, saveAdminWallet, clearAdminWallet };
}
