/**
 * 💎 FrostDex Fee Extraction Service
 * Manages platform fees, admin wallet collection, and transaction tracking
 * 
 * Admin Wallet: EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ
 * PROGRAM_ID: FrDxBNvCWaUW5oGHCTL5eFLLSQVzakRB5TnYGFzJGwSn
 */

export const FEE_CONFIG = {
    ADMIN_WALLET: "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ",
    PROGRAM_ID: "FrDxBNvCWaUW5oGHCTL5eFLLSQVzakRB5TnYGFzJGwSn",

    // Fee basis points (1% = 100 bps)
    PLATFORM_FEE_BPS: 1500,         // 15% platform fee on trades
    INITIAL_BUY_FEE_BPS: 2000,      // 20% fee on initial token purchase
    TOKEN_CREATION_BASE_FEE: 0.1,   // 0.1 SOL base fee to create token

    // Advanced option fees (in SOL)
    ADVANCED_FEES: {
        revoke_mint: 0.05,             // Revoke mint authority
        revoke_freeze: 0.03,           // Revoke freeze authority
        immutable_metadata: 0.02,      // Make metadata immutable
    },

    // Bonding curve settings
    VIRTUAL_SOL_INITIAL: 30,
    VIRTUAL_TOKENS_INITIAL: 1_000_000_000,
    GRADUATION_TARGET_SOL: 85,
};

export interface FeeTransaction {
    id: string;
    type: "token_creation" | "buy_trade" | "sell_trade" | "advanced_option";
    amount: number;
    tokenSymbol?: string;
    timestamp: number;
    status: "pending" | "confirmed" | "failed";
}

export interface AdminWalletSession {
    walletAddress: string;
    connected: boolean;
    verifiedAt: number;
    totalFeesCollected: number;
    transactionCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate fees for various operations
// ─────────────────────────────────────────────────────────────────────────────

export function calculateBuyFee(solAmount: number, isInitialBuy: boolean = false): {
    fee: number;
    feePercentage: number;
    netAmount: number;
} {
    const feeBps = isInitialBuy ? FEE_CONFIG.INITIAL_BUY_FEE_BPS : FEE_CONFIG.PLATFORM_FEE_BPS;
    const fee = solAmount * (feeBps / 10000);
    const feePercentage = (feeBps / 100);
    const netAmount = solAmount - fee;

    return {
        fee,
        feePercentage,
        netAmount,
    };
}

export function calculateSellFee(solOut: number): {
    fee: number;
    feePercentage: number;
    netAmount: number;
} {
    const feeBps = FEE_CONFIG.PLATFORM_FEE_BPS;
    const fee = solOut * (feeBps / 10000);
    const feePercentage = (feeBps / 100);
    const netAmount = solOut - fee;

    return {
        fee,
        feePercentage,
        netAmount,
    };
}

export function calculateAdvancedFeeTotal(options: Record<string, boolean>): number {
    return Object.entries(options)
        .filter(([, enabled]) => enabled)
        .reduce((total, [key]) => {
            const fee = FEE_CONFIG.ADVANCED_FEES[key as keyof typeof FEE_CONFIG.ADVANCED_FEES];
            return total + (fee || 0);
        }, 0) + FEE_CONFIG.TOKEN_CREATION_BASE_FEE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee tracking and storage
// ─────────────────────────────────────────────────────────────────────────────

const FEE_LEDGER_KEY = "frostdex_fee_ledger_v1";
const ADMIN_SESSION_KEY = "frostdex_admin_session_v1";

export function recordFeeTransaction(tx: Omit<FeeTransaction, "id" | "status">): FeeTransaction {
    const transaction: FeeTransaction = {
        ...tx,
        id: crypto.randomUUID ? crypto.randomUUID() : `tx_${Date.now()}_${Math.random()}`,
        status: "confirmed",
    };

    try {
        const ledger = JSON.parse(localStorage.getItem(FEE_LEDGER_KEY) || "[]") as FeeTransaction[];
        ledger.push(transaction);
        // Keep last 1000 transactions
        localStorage.setItem(FEE_LEDGER_KEY, JSON.stringify(ledger.slice(-1000)));
    } catch {
        console.error("Failed to record fee transaction");
    }

    return transaction;
}

export function getFeeTransactionHistory(): FeeTransaction[] {
    try {
        return JSON.parse(localStorage.getItem(FEE_LEDGER_KEY) || "[]");
    } catch {
        return [];
    }
}

export function getTotalFeesCollected(): number {
    const transactions = getFeeTransactionHistory();
    return transactions
        .filter(tx => tx.status === "confirmed")
        .reduce((sum, tx) => sum + tx.amount, 0);
}

export function saveAdminSession(session: AdminWalletSession): void {
    try {
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch {
        console.error("Failed to save admin session");
    }
}

export function getAdminSession(): AdminWalletSession | null {
    try {
        const data = localStorage.getItem(ADMIN_SESSION_KEY);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

export function clearAdminSession(): void {
    try {
        localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
        console.error("Failed to clear admin session");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet validation and verification
// ─────────────────────────────────────────────────────────────────────────────

export function isValidSolanaAddress(address: string): boolean {
    if (!address || address.length < 32 || address.length > 44) return false;
    try {
        // Verify it's valid base58
        const decoded = Buffer.from(address, "utf8");
        return decoded.length > 0;
    } catch {
        return false;
    }
}

export function formatWalletAddress(address: string, chars: number = 4): string {
    if (!address || address.length < chars * 2) return address;
    return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee breakdown display
// ─────────────────────────────────────────────────────────────────────────────

export function generateFeeBreakdown(
    solAmount: number,
    operation: "buy" | "sell" | "create",
    advancedOptions?: Record<string, boolean>
): {
    operationFee: number;
    advancedFee: number;
    totalFee: number;
    netAmount: number;
    breakdown: Array<{ label: string; amount: number; percentage: string }>;
} {
    let operationFee = 0;
    let operationLabel = "";
    let totalSol = solAmount;

    if (operation === "buy") {
        const result = calculateBuyFee(solAmount, false);
        operationFee = result.fee;
        operationLabel = `Trading Fee (${result.feePercentage}%)`;
    } else if (operation === "sell") {
        const result = calculateSellFee(solAmount);
        operationFee = result.fee;
        operationLabel = `Trading Fee (${result.feePercentage}%)`;
    } else if (operation === "create") {
        operationFee = FEE_CONFIG.TOKEN_CREATION_BASE_FEE;
        operationLabel = "Token Creation Fee";
        totalSol = solAmount + operationFee;
    }

    const advancedFee = advancedOptions ? calculateAdvancedFeeTotal(advancedOptions) : 0;
    const totalFee = operationFee + advancedFee;
    const netAmount = solAmount - totalFee;

    const breakdown: Array<{ label: string; amount: number; percentage: string }> = [
        {
            label: operationLabel,
            amount: operationFee,
            percentage: ((operationFee / totalFee) * 100).toFixed(1) + "%",
        },
    ];

    if (advancedOptions && Object.values(advancedOptions).some(v => v)) {
        Object.entries(advancedOptions).forEach(([key, enabled]) => {
            if (enabled) {
                const fee = FEE_CONFIG.ADVANCED_FEES[key as keyof typeof FEE_CONFIG.ADVANCED_FEES] || 0;
                if (fee > 0) {
                    breakdown.push({
                        label: `Advanced: ${key.replace(/_/g, " ")}`,
                        amount: fee,
                        percentage: ((fee / totalFee) * 100).toFixed(1) + "%",
                    });
                }
            }
        });
    }

    return {
        operationFee,
        advancedFee,
        totalFee,
        netAmount,
        breakdown,
    };
}
