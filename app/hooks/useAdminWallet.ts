import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WALLET_CONFIG,
  PINATA_CONFIG,
  saveWalletState,
  loadWalletState,
  clearWalletState,
  updateWalletUsage,
  type WalletState
} from "@/utils/wallet-config";

const PLATFORM_FEE_WALLET = "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ";

export function useAdminWallet() {
  const wallet = useWallet();
  const [savedWallet, setSavedWallet] = useState<WalletState | null>(null);
  const [programId, setProgramId] = useState<string>("");
  const [isVerified, setIsVerified] = useState(false);
  const [pinataJwt, setPinataJwt] = useState<string>("");

  // Initialize wallet state from localStorage on mount
  useEffect(() => {
    const stored = loadWalletState();
    setSavedWallet(stored);
    if (stored) {
      setProgramId(stored.programId);
      setIsVerified(true);
    }
  }, []);

  // Check Pinata JWT
  useEffect(() => {
    const jwt = PINATA_CONFIG.getJWT();
    setPinataJwt(jwt);
  }, []);

  // Handle wallet connection change
  useEffect(() => {
    if (wallet.publicKey) {
      const address = wallet.publicKey.toBase58();
      const state = saveWalletState(address);
      setSavedWallet(state);
      setProgramId(state.programId);
      setIsVerified(true);
      updateWalletUsage(address);
    }
  }, [wallet.publicKey]);

  const saveAdminWallet = (walletAddress: string) => {
    const state = saveWalletState(walletAddress);
    setSavedWallet(state);
    setProgramId(state.programId);
    setIsVerified(true);
  };

  const setPinataJwtToken = (token: string) => {
    PINATA_CONFIG.setJWT(token);
    setPinataJwt(token);
  };

  const clearAdminWallet = () => {
    clearWalletState();
    setSavedWallet(null);
    setProgramId("");
    setIsVerified(false);
  };

  // Use saved wallet or connected wallet, fall back to platform wallet
  const adminWallet = savedWallet?.address || wallet.publicKey?.toBase58() || PLATFORM_FEE_WALLET;

  return {
    adminWallet,
    programId: programId || (import.meta.env.VITE_PROGRAM_ID || "8pwEParUTtoh5GDpxs5RmspaSHpPuHmKQaEQSCxx2KGp"),
    isVerified,
    signature: savedWallet ? "user-wallet-verified" : "platform-default",
    savedWallet,
    pinataJwt,
    pinataConfigured: PINATA_CONFIG.isConfigured(),
    // Methods
    saveAdminWallet,
    setPinataJwtToken,
    clearAdminWallet,
  };
}

export { PLATFORM_FEE_WALLET };
