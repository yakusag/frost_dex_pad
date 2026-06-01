import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

const PROGRAM_ID = import.meta.env.VITE_PROGRAM_ID || "8pwEParUTtoh5GDpxs5RmspaSHpPuHmKQaEQSCxx2KGp";
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export const PLATFORM_FEE_BPS = 1500;
export const INITIAL_BUY_FEE_BPS = 2000;
export const BASIS_POINTS = 10000;

export const ADVANCED_FEES_SOL: Record<string, number> = {
  revoke_mint: 0.05,
  revoke_freeze: 0.03,
  immutable_metadata: 0.02,
};

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

export function getProgramId(): PublicKey {
  return new PublicKey(PROGRAM_ID);
}

export async function getBondingCurvePDA(mint: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    getProgramId()
  );
}

export async function getSolReservesPDA(bondingCurve: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_reserves"), bondingCurve.toBuffer()],
    getProgramId()
  );
}

export function calcBuyQuote(
  virtualSolReserves: number,
  virtualTokenReserves: number,
  solIn: number,
  feeBps: number = PLATFORM_FEE_BPS
): { tokensOut: number; fee: number; price: number } {
  const fee = (solIn * feeBps) / BASIS_POINTS;
  const solAfterFee = solIn - fee;
  const k = virtualSolReserves * virtualTokenReserves;
  const newSol = virtualSolReserves + solAfterFee;
  const newTokens = k / newSol;
  const tokensOut = Math.max(0, virtualTokenReserves - newTokens);
  const price = tokensOut > 0 ? solIn / tokensOut : 0;
  return { tokensOut, fee, price };
}

export function calcSellQuote(
  virtualSolReserves: number,
  virtualTokenReserves: number,
  tokensIn: number,
  feeBps: number = PLATFORM_FEE_BPS
): { solOut: number; fee: number } {
  const k = virtualSolReserves * virtualTokenReserves;
  const newTokens = virtualTokenReserves + tokensIn;
  const newSol = k / newTokens;
  const grossSol = Math.max(0, virtualSolReserves - newSol);
  const fee = (grossSol * feeBps) / BASIS_POINTS;
  const solOut = Math.max(0, grossSol - fee);
  return { solOut, fee };
}

export function getTokenPrice(virtualSol: number, virtualTokens: number): number {
  return virtualSol / virtualTokens;
}

export function getMarketCap(virtualSol: number, virtualTokens: number, totalSupply = 1_000_000_000): number {
  return getTokenPrice(virtualSol, virtualTokens) * totalSupply;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(walletAddress);
    const lamports = await conn.getBalance(pubkey);
    return lamportsToSol(lamports);
  } catch {
    return 0;
  }
}

export function calcAdvancedOptionsFee(options: Record<string, boolean>): number {
  return Object.entries(options)
    .filter(([, enabled]) => enabled)
    .reduce((sum, [key]) => sum + (ADVANCED_FEES_SOL[key] ?? 0), 0);
}
