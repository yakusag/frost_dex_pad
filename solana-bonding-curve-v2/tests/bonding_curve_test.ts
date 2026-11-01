import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BondingCurve } from "../target/types/bonding_curve";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("bonding-curve-v2 fees", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BondingCurve as Program<BondingCurve>;
  const feeRecipient = new PublicKey("EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ");
  const creator = provider.wallet.publicKey;
  const targetAmount = 85 * LAMPORTS_PER_SOL;
  let tokenMint: PublicKey;
  let bondingCurve: PublicKey;
  let solReserves: PublicKey;
  let creatorTokenAccount: PublicKey;

  it("charges 14.5% plus 4.5% on the creator's first buy, then 4.5% on buys and sells", async () => {
    tokenMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      creator,
      null,
      9,
    );
    [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), tokenMint.toBuffer()],
      program.programId,
    );
    [solReserves] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_reserves"), bondingCurve.toBuffer()],
      program.programId,
    );
    creatorTokenAccount = getAssociatedTokenAddressSync(tokenMint, creator);

    await program.methods
      .initialize(
        new anchor.BN(30 * LAMPORTS_PER_SOL),
        new anchor.BN(1_073_000_000_000_000),
        new anchor.BN(targetAmount),
      )
      .accounts({
        bondingCurve,
        tokenMint,
        solReserves,
        authority: creator,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    let feeBalance = BigInt(await provider.connection.getBalance(feeRecipient));
    await program.methods
      .initialBuy(new anchor.BN(LAMPORTS_PER_SOL), new anchor.BN(1))
      .accounts({
        bondingCurve,
        tokenMint,
        solReserves,
        feeRecipient,
        buyer: creator,
        buyerTokenAccount: creatorTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    expect(BigInt(await provider.connection.getBalance(feeRecipient)) - feeBalance)
      .to.equal(190_000_000n);

    const buyer = Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(airdrop, "confirmed");
    const buyerTokenAccount = getAssociatedTokenAddressSync(tokenMint, buyer.publicKey);

    feeBalance = BigInt(await provider.connection.getBalance(feeRecipient));
    await program.methods
      .buy(new anchor.BN(100_000_000), new anchor.BN(1), new anchor.BN(1000))
      .accounts({
        bondingCurve,
        tokenMint,
        solReserves,
        feeRecipient,
        buyer: buyer.publicKey,
        buyerTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    expect(BigInt(await provider.connection.getBalance(feeRecipient)) - feeBalance)
      .to.equal(4_500_000n);

    const account = await getAccount(provider.connection, buyerTokenAccount);
    const tokenAmount = account.amount / 10n;
    const curveBefore = await program.account.bondingCurve.fetch(bondingCurve);
    const virtualSol = BigInt(curveBefore.virtualSolReserves.toString());
    const virtualTokens = BigInt(curveBefore.virtualTokenReserves.toString());
    const grossSol = virtualSol - (virtualSol * virtualTokens) / (virtualTokens + tokenAmount);
    const expectedSellFee = (grossSol * 450n) / 10_000n;

    feeBalance = BigInt(await provider.connection.getBalance(feeRecipient));
    await program.methods
      .sell(new anchor.BN(tokenAmount.toString()), new anchor.BN(1), new anchor.BN(1000))
      .accounts({
        bondingCurve,
        tokenMint,
        solReserves,
        feeRecipient,
        seller: buyer.publicKey,
        sellerTokenAccount: buyerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
    expect(BigInt(await provider.connection.getBalance(feeRecipient)) - feeBalance)
      .to.equal(expectedSellFee);
  });
});
