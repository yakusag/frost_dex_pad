import { useState, useCallback, useEffect } from "react";
import {
    FEE_CONFIG,
    AdminWalletSession,
    saveAdminSession,
    getAdminSession,
    clearAdminSession,
    isValidSolanaAddress,
    formatWalletAddress,
    getTotalFeesCollected,
    getFeeTransactionHistory,
    recordFeeTransaction,
} from "@/services/feeExtraction";

export function useAdminFeeWallet() {
    const [adminWallet, setAdminWallet] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [totalFeesCollected, setTotalFeesCollected] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load existing admin session on mount
    useEffect(() => {
        const session = getAdminSession();
        if (session && session.connected) {
            setAdminWallet(session.walletAddress);
            setIsConnected(true);
            setIsVerified(true);
            setTotalFeesCollected(getTotalFeesCollected());
        }
    }, []);

    const connectAdminWallet = useCallback(async (walletAddress: string) => {
        setError(null);
        setLoading(true);

        try {
            // Validate wallet address
            if (!isValidSolanaAddress(walletAddress)) {
                throw new Error("Invalid Solana wallet address format");
            }

            // In production, you would verify wallet ownership via signing
            const verified = true; // Placeholder - implement actual verification

            if (verified) {
                const session: AdminWalletSession = {
                    walletAddress,
                    connected: true,
                    verifiedAt: Date.now(),
                    totalFeesCollected: getTotalFeesCollected(),
                    transactionCount: getFeeTransactionHistory().length,
                };

                saveAdminSession(session);
                setAdminWallet(walletAddress);
                setIsConnected(true);
                setIsVerified(true);
                setTotalFeesCollected(session.totalFeesCollected);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to connect wallet";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const disconnectAdminWallet = useCallback(() => {
        clearAdminSession();
        setAdminWallet(null);
        setIsConnected(false);
        setIsVerified(false);
        setTotalFeesCollected(0);
        setError(null);
    }, []);

    const recordFee = useCallback((fee: Omit<Parameters<typeof recordFeeTransaction>[0], never>) => {
        if (!isVerified) {
            setError("Admin wallet not verified");
            return null;
        }

        const transaction = recordFeeTransaction({
            type: fee.type,
            amount: fee.amount,
            tokenSymbol: fee.tokenSymbol,
            timestamp: Date.now(),
        });

        setTotalFeesCollected(prev => prev + fee.amount);
        return transaction;
    }, [isVerified]);

    return {
        adminWallet,
        isConnected,
        isVerified,
        totalFeesCollected,
        loading,
        error,
        connectAdminWallet,
        disconnectAdminWallet,
        recordFee,
        formattedWallet: adminWallet ? formatWalletAddress(adminWallet) : null,
        feeHistory: getFeeTransactionHistory(),
    };
}

export function useFeeCalculation() {
    const calculateTokenCreationFee = useCallback((advancedOptions: Record<string, boolean> = {}) => {
        let totalFee = FEE_CONFIG.TOKEN_CREATION_BASE_FEE;

        Object.entries(advancedOptions).forEach(([key, enabled]) => {
            if (enabled) {
                const optionFee =
                    FEE_CONFIG.ADVANCED_FEES[key as keyof typeof FEE_CONFIG.ADVANCED_FEES];
                if (optionFee) {
                    totalFee += optionFee;
                }
            }
        });

        return totalFee;
    }, []);

    const calculateTradesFee = useCallback(
        (solAmount: number, type: "buy" | "sell", isInitialBuy: boolean = false) => {
            const feeBps =
                type === "buy"
                    ? isInitialBuy
                        ? FEE_CONFIG.INITIAL_BUY_FEE_BPS
                        : FEE_CONFIG.PLATFORM_FEE_BPS
                    : FEE_CONFIG.PLATFORM_FEE_BPS;

            const fee = solAmount * (feeBps / 10000);
            return {
                fee,
                net: solAmount - fee,
                percentage: (feeBps / 100).toFixed(2) + "%",
            };
        },
        []
    );

    return {
        calculateTokenCreationFee,
        calculateTradesFee,
    };
}
