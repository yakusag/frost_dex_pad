import { PublicKey } from "@solana/web3.js";

// Environment configuration
export const WALLET_CONFIG = {
    // Wallet storage
    STORAGE_KEY_WALLET: "frost_dex_wallet_v1",
    STORAGE_KEY_PROGRAM_ID: "frost_dex_program_id_v1",
    STORAGE_KEY_JWT: "frost_dex_pinata_jwt_v1",

    // Get or create PROGRAM_ID from wallet
    getProgramIdFromWallet: (walletAddress: string): string => {
        // Derive program ID from wallet address
        // In production, this would be the actual deployed program address
        try {
            const pubkey = new PublicKey(walletAddress);
            const seed = Buffer.concat([
                Buffer.from("frost-dex-program"),
                pubkey.toBuffer().slice(0, 10), // Use first 10 bytes of wallet
            ]);
            // Create a deterministic program ID based on wallet
            const hash = require("crypto").createHash("sha256");
            hash.update(seed);
            const programBytes = hash.digest().slice(0, 32);
            return new PublicKey(programBytes).toBase58();
        } catch {
            // Fallback to default
            return import.meta.env.VITE_PROGRAM_ID || "8pwEParUTtoh5GDpxs5RmspaSHpPuHmKQaEQSCxx2KGp";
        }
    },
};

// Pinata/IPFS configuration
export const PINATA_CONFIG = {
    PINATA_API_URL: "https://api.pinata.cloud",
    GATEWAY_URL: import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud",

    // Get JWT from environment or localStorage
    getJWT: (): string => {
        return import.meta.env.VITE_PINATA_JWT || localStorage.getItem(WALLET_CONFIG.STORAGE_KEY_JWT) || "";
    },

    // Set JWT in localStorage
    setJWT: (token: string): void => {
        localStorage.setItem(WALLET_CONFIG.STORAGE_KEY_JWT, token);
    },

    // Validate JWT is set
    isConfigured: (): boolean => {
        return !!PINATA_CONFIG.getJWT();
    },
};

// Wallet state type
export interface WalletState {
    address: string;
    programId: string;
    createdAt: number;
    lastUsed: number;
}

// Save wallet to localStorage
export function saveWalletState(address: string): WalletState {
    const programId = WALLET_CONFIG.getProgramIdFromWallet(address);
    const state: WalletState = {
        address,
        programId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
    };
    localStorage.setItem(WALLET_CONFIG.STORAGE_KEY_WALLET, JSON.stringify(state));
    localStorage.setItem(WALLET_CONFIG.STORAGE_KEY_PROGRAM_ID, programId);
    return state;
}

// Load wallet from localStorage
export function loadWalletState(): WalletState | null {
    const stored = localStorage.getItem(WALLET_CONFIG.STORAGE_KEY_WALLET);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

// Clear wallet state
export function clearWalletState(): void {
    localStorage.removeItem(WALLET_CONFIG.STORAGE_KEY_WALLET);
    localStorage.removeItem(WALLET_CONFIG.STORAGE_KEY_PROGRAM_ID);
}

// Update last used timestamp
export function updateWalletUsage(address: string): void {
    const state = loadWalletState();
    if (state && state.address === address) {
        state.lastUsed = Date.now();
        localStorage.setItem(WALLET_CONFIG.STORAGE_KEY_WALLET, JSON.stringify(state));
    }
}
