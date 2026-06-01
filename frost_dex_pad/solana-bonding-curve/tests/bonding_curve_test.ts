import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BondingCurve } from "../target/types/bonding_curve";
import { 
  PublicKey, 
  SystemProgram, 
  Keypair,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getAccount
} from "@solana/spl-token";
import { expect } from "chai";
import * as fs from "fs";

describe("bonding-curve", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  // Use workspace if possible, fallback to direct loading
  let program: Program<BondingCurve>;
  try {
    program = anchor.workspace.BondingCurve as Program<BondingCurve>;
  } catch (error) {
    // Fallback: load directly with specific program ID
    const programId = new PublicKey("8pwEParUTtoh5GDpxs5RmspaSHpPuHmKQaEQSCxx2KGp");
    const idl = JSON.parse(require('fs').readFileSync('./target/idl/bonding_curve.json', 'utf8'));
    program = new Program(idl, programId, provider) as Program<BondingCurve>;
  }

  let tokenMint: PublicKey;
  let bondingCurve: PublicKey;
  let solReserves: PublicKey;
  let authority = provider.wallet.publicKey;

  // Test constants matching pump.fun mechanics
  const INITIAL_VIRTUAL_SOL_RESERVES = 30 * LAMPORTS_PER_SOL; // 30 SOL
  const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000; // ~1 billion tokens
  const TARGET_AMOUNT = 85 * LAMPORTS_PER_SOL; // 85 SOL target

  before(async () => {
    console.log("Setting up test environment...");
    
    // Create token mint with the authority as the initial mint authority
    // This will be transferred to the bonding curve during initialization
    tokenMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      authority, // Set authority as initial mint authority
      null,
      9 // 9 decimals
    );
    console.log("Token mint created:", tokenMint.toString());

    // Derive PDA accounts
    [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), tokenMint.toBuffer()],
      program.programId
    );

    [solReserves] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_reserves"), bondingCurve.toBuffer()],
      program.programId
    );

    console.log("Bonding curve PDA:", bondingCurve.toString());
    console.log("SOL reserves PDA:", solReserves.toString());
  });

  it("Initializes the bonding curve", async () => {
    console.log("Initializing bonding curve...");
    
    await program.methods
      .initialize(
        new anchor.BN(INITIAL_VIRTUAL_SOL_RESERVES),
        new anchor.BN(INITIAL_VIRTUAL_TOKEN_RESERVES),
        new anchor.BN(TARGET_AMOUNT)
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        authority: authority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
    
    expect(bondingCurveAccount.virtualSolReserves.toString()).to.equal(
      INITIAL_VIRTUAL_SOL_RESERVES.toString()
    );
    expect(bondingCurveAccount.virtualTokenReserves.toString()).to.equal(
      INITIAL_VIRTUAL_TOKEN_RESERVES.toString()
    );
    expect(bondingCurveAccount.targetAmount.toString()).to.equal(
      TARGET_AMOUNT.toString()
    );
    expect(bondingCurveAccount.complete).to.be.false;

    console.log("✅ Bonding curve initialized successfully");
    console.log("Virtual SOL reserves:", bondingCurveAccount.virtualSolReserves.toString());
    console.log("Virtual token reserves:", bondingCurveAccount.virtualTokenReserves.toString());
  });

  it("Buys tokens with exponential pricing", async () => {
    console.log("Testing token purchase...");
    
    const buyerKeypair = Keypair.generate();
    
    // Airdrop SOL to buyer
    const signature = await provider.connection.requestAirdrop(
      buyerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    const buyerTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      buyerKeypair.publicKey
    );

    const solAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
    const minTokensOut = 1; // Minimum 1 token (for slippage protection)

    // Get initial state
    const initialState = await program.account.bondingCurve.fetch(bondingCurve);
    console.log("Initial virtual SOL reserves:", initialState.virtualSolReserves.toString());
    console.log("Initial virtual token reserves:", initialState.virtualTokenReserves.toString());

    await program.methods
      .buy(
        new anchor.BN(solAmount),
        new anchor.BN(minTokensOut),
        new anchor.BN(1000) // 10% max slippage
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        buyer: buyerKeypair.publicKey,
        buyerTokenAccount: buyerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();

    // Check buyer's token balance
    const tokenAccountInfo = await getAccount(provider.connection, buyerTokenAccount);
    console.log("Buyer token balance:", tokenAccountInfo.amount.toString());

    // Check updated bonding curve state
    const updatedState = await program.account.bondingCurve.fetch(bondingCurve);
    console.log("Updated virtual SOL reserves:", updatedState.virtualSolReserves.toString());
    console.log("Updated virtual token reserves:", updatedState.virtualTokenReserves.toString());
    console.log("Real SOL reserves:", updatedState.realSolReserves.toString());

    expect(Number(tokenAccountInfo.amount)).to.be.greaterThan(0);
    expect(updatedState.realSolReserves.toString()).to.equal(solAmount.toString());
    
    console.log("✅ Token purchase successful");
  });

  it("Calculates increasing prices for subsequent purchases", async () => {
    console.log("Testing price progression...");
    
    const buyerKeypair = Keypair.generate();
    
    // Airdrop SOL to buyer
    const signature = await provider.connection.requestAirdrop(
      buyerKeypair.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    const buyerTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      buyerKeypair.publicKey
    );

    const solAmount = 0.1 * LAMPORTS_PER_SOL;
    
    // First purchase
    const initialState = await program.account.bondingCurve.fetch(bondingCurve);
    
    await program.methods
      .buy(
        new anchor.BN(solAmount),
        new anchor.BN(1),
        new anchor.BN(1000)
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        buyer: buyerKeypair.publicKey,
        buyerTokenAccount: buyerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();

    const firstPurchaseTokens = await getAccount(provider.connection, buyerTokenAccount);
    
    // Second purchase (should get fewer tokens for same SOL amount)
    await program.methods
      .buy(
        new anchor.BN(solAmount),
        new anchor.BN(1),
        new anchor.BN(1000)
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        buyer: buyerKeypair.publicKey,
        buyerTokenAccount: buyerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();

    const secondPurchaseTokens = await getAccount(provider.connection, buyerTokenAccount);
    const tokensFromSecondPurchase = Number(secondPurchaseTokens.amount) - Number(firstPurchaseTokens.amount);
    
    console.log("First purchase tokens:", firstPurchaseTokens.amount.toString());
    console.log("Tokens from second purchase:", tokensFromSecondPurchase);
    
    // Price should be higher (fewer tokens for same SOL)
    expect(tokensFromSecondPurchase).to.be.lessThan(Number(firstPurchaseTokens.amount));
    
    console.log("✅ Price progression working correctly");
  });

  it("Handles token selling", async () => {
    console.log("Testing token selling...");
    
    const sellerKeypair = Keypair.generate();
    
    // Airdrop SOL to seller
    const signature = await provider.connection.requestAirdrop(
      sellerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    const sellerTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      sellerKeypair.publicKey
    );

    // Buy some tokens first
    const buyAmount = 0.1 * LAMPORTS_PER_SOL;
    await program.methods
      .buy(
        new anchor.BN(buyAmount),
        new anchor.BN(1),
        new anchor.BN(1000)
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        buyer: sellerKeypair.publicKey,
        buyerTokenAccount: sellerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([sellerKeypair])
      .rpc();

    const tokenBalance = await getAccount(provider.connection, sellerTokenAccount);
    const tokensToSell = Number(tokenBalance.amount) / 2; // Sell half

    const initialSolBalance = await provider.connection.getBalance(sellerKeypair.publicKey);

    // Sell tokens
    await program.methods
      .sell(
        new anchor.BN(tokensToSell),
        new anchor.BN(1), // Min SOL out
        new anchor.BN(1000) // Max slippage
      )
      .accounts({
        bondingCurve: bondingCurve,
        tokenMint: tokenMint,
        solReserves: solReserves,
        seller: sellerKeypair.publicKey,
        sellerTokenAccount: sellerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([sellerKeypair])
      .rpc();

    const finalSolBalance = await provider.connection.getBalance(sellerKeypair.publicKey);
    const finalTokenBalance = await getAccount(provider.connection, sellerTokenAccount);

    console.log("SOL received:", (finalSolBalance - initialSolBalance) / LAMPORTS_PER_SOL);
    console.log("Remaining tokens:", finalTokenBalance.amount.toString());

    expect(finalSolBalance).to.be.greaterThan(initialSolBalance);
    expect(Number(finalTokenBalance.amount)).to.be.lessThan(Number(tokenBalance.amount));
    
    console.log("✅ Token selling successful");
  });

  it("Enforces slippage protection", async () => {
    console.log("Testing slippage protection...");
    
    const buyerKeypair = Keypair.generate();
    
    // Airdrop SOL to buyer
    const signature = await provider.connection.requestAirdrop(
      buyerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    const buyerTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      buyerKeypair.publicKey
    );

    const solAmount = 0.1 * LAMPORTS_PER_SOL;
    const unrealisticMinTokens = 999_999_999_999; // Unrealistically high expectation

    try {
      await program.methods
        .buy(
          new anchor.BN(solAmount),
          new anchor.BN(unrealisticMinTokens),
          new anchor.BN(1000)
        )
        .accounts({
          bondingCurve: bondingCurve,
          tokenMint: tokenMint,
          solReserves: solReserves,
          buyer: buyerKeypair.publicKey,
          buyerTokenAccount: buyerTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyerKeypair])
        .rpc();
      
      expect.fail("Should have failed due to slippage protection");
    } catch (error) {
      expect(error.toString()).to.include("SlippageTooHigh");
      console.log("✅ Slippage protection working correctly");
    }
  });
}); 