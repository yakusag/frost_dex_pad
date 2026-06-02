// ─────────────────────────────────────────────────────────────────────────────
// Real on-chain bonding-curve integration.
//
// This module talks to the deployed Anchor program in
// `solana-bonding-curve/programs/bonding-curve/src/lib.rs`. It creates a real
// SPL mint, initializes the on-chain bonding curve account and routes
// initial-buy / buy / sell through the program (fees go to the platform wallet
// on-chain).
//
// It only activates when `VITE_PROGRAM_ID` is set to a valid, deployed program
// id. When unset the create-token page falls back to the local simulation so the
// template keeps working without a deployment.
// ─────────────────────────────────────────────────────────────────────────────
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { getActiveProvider } from "./solanaWallet";

// ─── Config (mirrors lib.rs + create-token page) ──────────────────────────────
const PLATFORM_FEE_WALLET = "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ";
const PLATFORM_FEE_BPS = 1500n; // 15% buy/sell
const INITIAL_BUY_FEE_BPS = 2000n; // 20% initial buy
const BASIS_POINTS = 10000n;
const SLIPPAGE_BPS = 1000n; // 10% max slippage protection

const DECIMALS = 9;
const VIRTUAL_SOL_LAMPORTS = 30n * BigInt(LAMPORTS_PER_SOL); // 30 SOL
const VIRTUAL_TOKENS_BASE = 1_073_000_000_000_000n; // ~ pump.fun default
const TARGET_LAMPORTS = 85n * BigInt(LAMPORTS_PER_SOL); // graduation target

const ENV = (import.meta as any).env ?? {};
const NOWNODES_RPC = "https://sol.nownodes.io/050b7243-6502-4f3c-8de3-4438f7ddf8a0";
const SOLANA_RPC: string = ENV.VITE_SOLANA_RPC || NOWNODES_RPC;
const PROGRAM_ID: string = ENV.VITE_PROGRAM_ID || "";

// ─── Hand-written IDL (Anchor 0.30+ format) ───────────────────────────────────
// Discriminators are sha256("global:<ix>")[..8] / sha256("account:<Acct>")[..8].
const IDL: Idl = {
  address: PROGRAM_ID || "11111111111111111111111111111111",
  metadata: { name: "bonding_curve", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        { name: "bonding_curve", writable: true },
        { name: "token_mint", writable: true },
        { name: "sol_reserves", writable: true },
        { name: "fee_recipient", writable: true },
        { name: "authority", writable: true, signer: true },
        { name: "system_program" },
        { name: "token_program" },
        { name: "rent" },
      ],
      args: [
        { name: "initial_virtual_sol_reserves", type: "u64" },
        { name: "initial_virtual_token_reserves", type: "u64" },
        { name: "target_amount", type: "u64" },
      ],
    },
    {
      name: "create_token",
      discriminator: [84, 52, 204, 228, 24, 140, 234, 75],
      accounts: [
        { name: "creator", writable: true, signer: true },
        { name: "fee_recipient", writable: true },
        { name: "system_program" },
      ],
      args: [
        { name: "revoke_mint", type: "bool" },
        { name: "revoke_freeze", type: "bool" },
        { name: "immutable_metadata", type: "bool" },
      ],
    },
    {
      name: "initial_buy",
      discriminator: [41, 187, 188, 156, 7, 2, 121, 37],
      accounts: [
        { name: "bonding_curve", writable: true },
        { name: "token_mint", writable: true },
        { name: "sol_reserves", writable: true },
        { name: "fee_recipient", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "buyer_token_account", writable: true },
        { name: "system_program" },
        { name: "token_program" },
        { name: "associated_token_program" },
      ],
      args: [
        { name: "sol_amount", type: "u64" },
        { name: "min_tokens_out", type: "u64" },
      ],
    },
    {
      name: "buy",
      discriminator: [102, 6, 61, 18, 1, 218, 235, 234],
      accounts: [
        { name: "bonding_curve", writable: true },
        { name: "token_mint", writable: true },
        { name: "sol_reserves", writable: true },
        { name: "fee_recipient", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "buyer_token_account", writable: true },
        { name: "system_program" },
        { name: "token_program" },
        { name: "associated_token_program" },
      ],
      args: [
        { name: "sol_amount", type: "u64" },
        { name: "min_tokens_out", type: "u64" },
        { name: "max_slippage_bps", type: "u64" },
      ],
    },
    {
      name: "sell",
      discriminator: [51, 230, 133, 164, 1, 127, 131, 173],
      accounts: [
        { name: "bonding_curve", writable: true },
        { name: "token_mint", writable: true },
        { name: "sol_reserves", writable: true },
        { name: "fee_recipient", writable: true },
        { name: "seller", writable: true, signer: true },
        { name: "seller_token_account", writable: true },
        { name: "token_program" },
        { name: "system_program" },
      ],
      args: [
        { name: "token_amount", type: "u64" },
        { name: "min_sol_out", type: "u64" },
        { name: "max_slippage_bps", type: "u64" },
      ],
    },
  ],
  accounts: [
    { name: "BondingCurve", discriminator: [23, 183, 248, 55, 96, 216, 172, 96] },
  ],
  types: [
    {
      name: "BondingCurve",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "token_mint", type: "pubkey" },
          { name: "sol_reserves", type: "pubkey" },
          { name: "fee_recipient", type: "pubkey" },
          { name: "virtual_sol_reserves", type: "u64" },
          { name: "virtual_token_reserves", type: "u64" },
          { name: "real_sol_reserves", type: "u64" },
          { name: "real_token_reserves", type: "u64" },
          { name: "target_amount", type: "u64" },
          { name: "complete", type: "bool" },
          { name: "initial_buy_done", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  events: [],
  errors: [],
} as unknown as Idl;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function isProgramConfigured(): boolean {
  try {
    return !!PROGRAM_ID && !!new PublicKey(PROGRAM_ID);
  } catch {
    return false;
  }
}

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC, "confirmed");
}

function getProgram(walletAddress: string): { program: Program; connection: Connection } {
  const wallet_ = getActiveProvider();
  if (!wallet_) throw new Error("No wallet connected");
  if (!isProgramConfigured()) throw new Error("On-chain program not configured (VITE_PROGRAM_ID)");

  const connection = getConnection();
  const wallet = {
    publicKey: new PublicKey(walletAddress),
    signTransaction: (tx: Transaction) => wallet_.signTransaction(tx),
    signAllTransactions: (txs: Transaction[]) => wallet_.signAllTransactions(txs),
  };
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program({ ...(IDL as any), address: PROGRAM_ID } as Idl, provider);
  return { program, connection };
}

function bondingCurvePDA(mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("bonding_curve"), mint.toBuffer()], programId)[0];
}
function solReservesPDA(bondingCurve: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("sol_reserves"), bondingCurve.toBuffer()], programId)[0];
}

// ─── On-chain curve math (BigInt, mirrors lib.rs exactly) ─────────────────────
function buyTokensOut(solIn: bigint, vSol: bigint, vTok: bigint, feeBps: bigint): bigint {
  const fee = (solIn * feeBps) / BASIS_POINTS;
  const solAfterFee = solIn - fee;
  const k = vSol * vTok;
  const newSol = vSol + solAfterFee;
  const newTok = k / newSol;
  return vTok - newTok;
}
function sellSolOut(tokensIn: bigint, vSol: bigint, vTok: bigint): { gross: bigint; net: bigint } {
  const k = vSol * vTok;
  const newTok = vTok + tokensIn;
  const newSol = k / newTok;
  const gross = vSol - newSol;
  const fee = (gross * PLATFORM_FEE_BPS) / BASIS_POINTS;
  return { gross, net: gross - fee };
}

export interface CurveState {
  virtualSol: number; // human SOL
  virtualTokens: number; // human tokens
  realSol: number;
  complete: boolean;
  initialBuyDone: boolean;
}

export async function fetchCurveState(mintAddress: string, walletAddress?: string): Promise<CurveState | null> {
  try {
    const connection = getConnection();
    const programId = new PublicKey(PROGRAM_ID);
    const mint = new PublicKey(mintAddress);
    const curvePda = bondingCurvePDA(mint, programId);
    // Build a read-only program (no wallet needed for fetch)
    const provider = new AnchorProvider(connection, {
      publicKey: walletAddress ? new PublicKey(walletAddress) : PublicKey.default,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    } as any, { commitment: "confirmed" });
    const program = new Program({ ...(IDL as any), address: PROGRAM_ID } as Idl, provider);
    const acc: any = await (program.account as any).bondingCurve.fetch(curvePda);
    return {
      virtualSol: Number(acc.virtualSolReserves) / LAMPORTS_PER_SOL,
      virtualTokens: Number(acc.virtualTokenReserves) / 10 ** DECIMALS,
      realSol: Number(acc.realSolReserves) / LAMPORTS_PER_SOL,
      complete: acc.complete,
      initialBuyDone: acc.initialBuyDone,
    };
  } catch {
    return null;
  }
}

// ─── Metaplex Token Metadata (so name + logo show in Phantom / Solscan) ───────
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

function metadataPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
}

function borshString(s: string): Buffer {
  const data = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length, 0);
  return Buffer.concat([len, data]);
}

// Token Metadata enforces *byte* limits, not character counts. Truncate on
// UTF-8 byte length at code-point boundaries so multibyte names (Arabic, CJK,
// emoji) can never overflow and make CreateMetadataAccountV3 fail on-chain.
function truncateUtf8(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, "utf8") > maxBytes) break;
    out += ch;
  }
  return out;
}

// Hand-built CreateMetadataAccountV3 instruction (avoids pulling the whole
// mpl-token-metadata package). Token Metadata enforces name ≤ 32, symbol ≤ 10,
// uri ≤ 200 bytes — we truncate (byte-safe) to stay within those limits.
function createMetadataV3Ix(args: {
  mint: PublicKey;
  authority: PublicKey; // mint authority + payer + update authority (the creator)
  name: string;
  symbol: string;
  uri: string;
  isMutable: boolean;
}): TransactionInstruction {
  const sellerFee = Buffer.alloc(2);
  sellerFee.writeUInt16LE(0, 0);
  const data = Buffer.concat([
    Buffer.from([33]), // CreateMetadataAccountV3 discriminator
    borshString(truncateUtf8(args.name, 32)),
    borshString(truncateUtf8(args.symbol, 10)),
    borshString(truncateUtf8(args.uri, 200)),
    sellerFee,
    Buffer.from([0]), // creators: None
    Buffer.from([0]), // collection: None
    Buffer.from([0]), // uses: None
    Buffer.from([args.isMutable ? 1 : 0]),
    Buffer.from([0]), // collectionDetails: None
  ]);
  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPDA(args.mint), isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.authority, isSigner: true, isWritable: false }, // mint authority
      { pubkey: args.authority, isSigner: true, isWritable: true }, // payer
      { pubkey: args.authority, isSigner: false, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export interface CreateTokenOnChainParams {
  walletAddress: string;
  revokeMint?: boolean;
  revokeFreeze?: boolean;
  immutableMetadata?: boolean;
  initialBuySol?: number; // 0 = no initial buy
  // Metaplex on-chain metadata (name + symbol show in wallets/explorers; uri
  // points at the pinned JSON that carries the image). Optional so the template
  // still works if a caller omits them.
  mintKeypair?: Keypair;
  name?: string;
  symbol?: string;
  metadataUri?: string;
}
// Pre-generate the mint so the caller can pin the metadata JSON (with the mint
// in its registry keyvalues) *before* the create transaction references its URI.
export function newMint(): { keypair: Keypair; address: string } {
  const keypair = Keypair.generate();
  return { keypair, address: keypair.publicKey.toBase58() };
}

export interface CreateTokenOnChainResult {
  mint: string;
  initSignature: string;
  initialBuySignature?: string;
}

export async function createTokenOnChain(
  params: CreateTokenOnChainParams,
  onStatus: (s: string) => void,
): Promise<CreateTokenOnChainResult> {
  const { program, connection } = getProgram(params.walletAddress);
  const programId = new PublicKey(PROGRAM_ID);
  const authority = new PublicKey(params.walletAddress);
  const feeRecipient = new PublicKey(PLATFORM_FEE_WALLET);

  const mintKeypair = params.mintKeypair ?? Keypair.generate();
  const mint = mintKeypair.publicKey;
  const curvePda = bondingCurvePDA(mint, programId);
  const reservesPda = solReservesPDA(curvePda, programId);

  onStatus("Creating SPL mint…");
  const rent = await getMinimumBalanceForRentExemptMint(connection as any);
  const createMintIx = SystemProgram.createAccount({
    fromPubkey: authority,
    newAccountPubkey: mint,
    space: MINT_SIZE,
    lamports: rent,
    programId: TOKEN_PROGRAM_ID,
  });
  const initMintIx = createInitializeMint2Instruction(mint, DECIMALS, authority, authority, TOKEN_PROGRAM_ID);

  // Attach Metaplex metadata so the token shows its name + logo in Phantom and
  // Solscan (built right after the mint is initialized, before the curve init).
  const preIxs = [createMintIx, initMintIx];
  if (params.name && params.symbol) {
    onStatus("Attaching token metadata (name + logo)…");
    preIxs.push(
      createMetadataV3Ix({
        mint,
        authority,
        name: params.name,
        symbol: params.symbol,
        uri: params.metadataUri || "",
        isMutable: !params.immutableMetadata,
      }),
    );
  }

  const hasAdvanced = !!(params.revokeMint || params.revokeFreeze || params.immutableMetadata);

  onStatus("Initializing bonding curve on-chain…");
  const builder = program.methods
    .initialize(new BN(VIRTUAL_SOL_LAMPORTS.toString()), new BN(VIRTUAL_TOKENS_BASE.toString()), new BN(TARGET_LAMPORTS.toString()))
    .accountsPartial({
      bondingCurve: curvePda,
      tokenMint: mint,
      solReserves: reservesPda,
      feeRecipient,
      authority,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .preInstructions(preIxs)
    .signers([mintKeypair]);

  if (hasAdvanced) {
    const createTokenIx = await program.methods
      .createToken(!!params.revokeMint, !!params.revokeFreeze, !!params.immutableMetadata)
      .accountsPartial({ creator: authority, feeRecipient, systemProgram: SystemProgram.programId })
      .instruction();
    builder.postInstructions([createTokenIx]);
  }

  onStatus("Waiting for wallet approval…");
  const initSignature: string = await builder.rpc();

  const result: CreateTokenOnChainResult = { mint: mint.toBase58(), initSignature };

  if (params.initialBuySol && params.initialBuySol > 0) {
    onStatus("Sending initial buy…");
    const solLamports = BigInt(Math.round(params.initialBuySol * LAMPORTS_PER_SOL));
    const expectedOut = buyTokensOut(solLamports, VIRTUAL_SOL_LAMPORTS, VIRTUAL_TOKENS_BASE, INITIAL_BUY_FEE_BPS);
    const minOut = (expectedOut * (BASIS_POINTS - SLIPPAGE_BPS)) / BASIS_POINTS;
    const buyerAta = getAssociatedTokenAddressSync(mint, authority);

    result.initialBuySignature = await program.methods
      .initialBuy(new BN(solLamports.toString()), new BN(minOut.toString()))
      .accountsPartial({
        bondingCurve: curvePda,
        tokenMint: mint,
        solReserves: reservesPda,
        feeRecipient,
        buyer: authority,
        buyerTokenAccount: buyerAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  return result;
}

// ─── Buy ──────────────────────────────────────────────────────────────────────
export async function buyOnChain(
  mintAddress: string,
  solAmount: number,
  walletAddress: string,
  onStatus: (s: string) => void,
): Promise<string> {
  const { program } = getProgram(walletAddress);
  const programId = new PublicKey(PROGRAM_ID);
  const mint = new PublicKey(mintAddress);
  const buyer = new PublicKey(walletAddress);
  const curvePda = bondingCurvePDA(mint, programId);
  const reservesPda = solReservesPDA(curvePda, programId);
  const feeRecipient = new PublicKey(PLATFORM_FEE_WALLET);

  onStatus("Fetching curve state…");
  const acc: any = await (program.account as any).bondingCurve.fetch(curvePda);
  const vSol = BigInt(acc.virtualSolReserves.toString());
  const vTok = BigInt(acc.virtualTokenReserves.toString());

  const solLamports = BigInt(Math.round(solAmount * LAMPORTS_PER_SOL));
  const expectedOut = buyTokensOut(solLamports, vSol, vTok, PLATFORM_FEE_BPS);
  const minOut = (expectedOut * (BASIS_POINTS - SLIPPAGE_BPS)) / BASIS_POINTS;
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer);

  onStatus("Waiting for wallet approval…");
  return program.methods
    .buy(new BN(solLamports.toString()), new BN(minOut.toString()), new BN(SLIPPAGE_BPS.toString()))
    .accountsPartial({
      bondingCurve: curvePda,
      tokenMint: mint,
      solReserves: reservesPda,
      feeRecipient,
      buyer,
      buyerTokenAccount: buyerAta,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
}

// ─── Sell ─────────────────────────────────────────────────────────────────────
export async function sellOnChain(
  mintAddress: string,
  tokenAmount: number,
  walletAddress: string,
  onStatus: (s: string) => void,
): Promise<string> {
  const { program } = getProgram(walletAddress);
  const programId = new PublicKey(PROGRAM_ID);
  const mint = new PublicKey(mintAddress);
  const seller = new PublicKey(walletAddress);
  const curvePda = bondingCurvePDA(mint, programId);
  const reservesPda = solReservesPDA(curvePda, programId);
  const feeRecipient = new PublicKey(PLATFORM_FEE_WALLET);

  onStatus("Fetching curve state…");
  const acc: any = await (program.account as any).bondingCurve.fetch(curvePda);
  const vSol = BigInt(acc.virtualSolReserves.toString());
  const vTok = BigInt(acc.virtualTokenReserves.toString());

  const tokensBase = BigInt(Math.round(tokenAmount * 10 ** DECIMALS));
  const { net } = sellSolOut(tokensBase, vSol, vTok);
  const minSolOut = (net * (BASIS_POINTS - SLIPPAGE_BPS)) / BASIS_POINTS;
  const sellerAta = getAssociatedTokenAddressSync(mint, seller);

  onStatus("Waiting for wallet approval…");
  return program.methods
    .sell(new BN(tokensBase.toString()), new BN(minSolOut.toString()), new BN(SLIPPAGE_BPS.toString()))
    .accountsPartial({
      bondingCurve: curvePda,
      tokenMint: mint,
      solReserves: reservesPda,
      feeRecipient,
      seller,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
