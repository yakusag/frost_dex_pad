use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("8pwEParUTtoh5GDpxs5RmspaSHpPuHmKQaEQSCxx2KGp");

// ─── Fee constants ────────────────────────────────────────────────────────────
const PLATFORM_FEE_BPS: u64 = 1500;       // 15% platform fee on buy/sell
const INITIAL_BUY_FEE_BPS: u64 = 2000;   // 20% fee on initial buy at launch
const BASIS_POINTS: u64 = 10000;

// Advanced option fees (in lamports)
const FEE_REVOKE_MINT: u64        = 50_000_000; // 0.05 SOL
const FEE_REVOKE_FREEZE: u64      = 30_000_000; // 0.03 SOL
const FEE_IMMUTABLE_METADATA: u64 = 20_000_000; // 0.02 SOL

// Curve constants
const MAX_SUPPLY: u64       = 1_000_000_000_000;
const MIN_PURCHASE: u64     = 1000;
const MAX_SLIPPAGE_BPS: u64 = 1000; // 10%

#[program]
pub mod bonding_curve {
    use super::*;

    /// Initialize the bonding curve
    pub fn initialize(
        ctx: Context<Initialize>,
        initial_virtual_sol_reserves: u64,
        initial_virtual_token_reserves: u64,
        target_amount: u64,
    ) -> Result<()> {
        let bonding_curve = &mut ctx.accounts.bonding_curve;

        bonding_curve.authority            = ctx.accounts.authority.key();
        bonding_curve.token_mint           = ctx.accounts.token_mint.key();
        bonding_curve.fee_recipient        = ctx.accounts.fee_recipient.key();
        bonding_curve.sol_reserves         = ctx.accounts.sol_reserves.key();
        bonding_curve.virtual_sol_reserves = initial_virtual_sol_reserves;
        bonding_curve.virtual_token_reserves = initial_virtual_token_reserves;
        bonding_curve.real_sol_reserves    = 0;
        bonding_curve.real_token_reserves  = 0;
        bonding_curve.target_amount        = target_amount;
        bonding_curve.complete             = false;
        bonding_curve.initial_buy_done     = false;
        bonding_curve.bump                 = ctx.bumps.bonding_curve;

        let mint_key = ctx.accounts.token_mint.key();
        let seeds = &[b"bonding_curve", mint_key.as_ref(), &[bonding_curve.bump]];
        let signer = &[&seeds[..]];

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::SetAuthority {
                    current_authority: ctx.accounts.authority.to_account_info(),
                    account_or_mint: ctx.accounts.token_mint.to_account_info(),
                },
                signer,
            ),
            token::spl_token::instruction::AuthorityType::MintTokens,
            Some(bonding_curve.key()),
        )?;

        emit!(BondingCurveCreated {
            bonding_curve: bonding_curve.key(),
            virtual_sol_reserves: initial_virtual_sol_reserves,
            virtual_token_reserves: initial_virtual_token_reserves,
        });

        Ok(())
    }

    /// Create token with optional advanced features — fees go to fee_recipient
    pub fn create_token(
        ctx: Context<CreateToken>,
        revoke_mint: bool,
        revoke_freeze: bool,
        immutable_metadata: bool,
    ) -> Result<()> {
        let mut total_fee: u64 = 0;
        if revoke_mint        { total_fee = total_fee.checked_add(FEE_REVOKE_MINT).ok_or(BondingCurveError::Overflow)?; }
        if revoke_freeze      { total_fee = total_fee.checked_add(FEE_REVOKE_FREEZE).ok_or(BondingCurveError::Overflow)?; }
        if immutable_metadata { total_fee = total_fee.checked_add(FEE_IMMUTABLE_METADATA).ok_or(BondingCurveError::Overflow)?; }

        if total_fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to:   ctx.accounts.fee_recipient.to_account_info(),
                    },
                ),
                total_fee,
            )?;
        }

        emit!(TokenCreatedEvent {
            creator: ctx.accounts.creator.key(),
            fee_paid: total_fee,
            revoke_mint,
            revoke_freeze,
            immutable_metadata,
        });

        Ok(())
    }

    /// Initial buy at token launch — uses 20% fee
    pub fn initial_buy(
        ctx: Context<Buy>,
        sol_amount: u64,
        min_tokens_out: u64,
    ) -> Result<()> {
        require!(sol_amount >= MIN_PURCHASE, BondingCurveError::PurchaseTooSmall);

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(!bonding_curve.complete, BondingCurveError::BondingCurveComplete);
        require!(!bonding_curve.initial_buy_done, BondingCurveError::InitialBuyAlreadyDone);

        let fee = sol_amount
            .checked_mul(INITIAL_BUY_FEE_BPS).ok_or(BondingCurveError::Overflow)?
            .checked_div(BASIS_POINTS).ok_or(BondingCurveError::Overflow)?;
        let sol_after_fee = sol_amount.checked_sub(fee).ok_or(BondingCurveError::Underflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to:   ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            fee,
        )?;

        let tokens_out = calculate_buy_price(
            sol_after_fee,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        require!(tokens_out >= min_tokens_out, BondingCurveError::SlippageTooHigh);

        let new_real_token_reserves = bonding_curve.real_token_reserves
            .checked_add(tokens_out).ok_or(BondingCurveError::Overflow)?;
        require!(new_real_token_reserves <= MAX_SUPPLY, BondingCurveError::MaxSupplyExceeded);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to:   ctx.accounts.sol_reserves.to_account_info(),
                },
            ),
            sol_after_fee,
        )?;

        let mint_key = bonding_curve.token_mint;
        let seeds = &[b"bonding_curve", mint_key.as_ref(), &[bonding_curve.bump]];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint:      ctx.accounts.token_mint.to_account_info(),
                    to:        ctx.accounts.buyer_token_account.to_account_info(),
                    authority: bonding_curve.to_account_info(),
                },
                signer,
            ),
            tokens_out,
        )?;

        bonding_curve.virtual_sol_reserves   = bonding_curve.virtual_sol_reserves.checked_add(sol_after_fee).ok_or(BondingCurveError::Overflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve.virtual_token_reserves.checked_sub(tokens_out).ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_sol_reserves      = bonding_curve.real_sol_reserves.checked_add(sol_after_fee).ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_token_reserves    = new_real_token_reserves;
        bonding_curve.initial_buy_done       = true;

        emit!(TradeEvent {
            bonding_curve: bonding_curve.key(),
            user: ctx.accounts.buyer.key(),
            is_buy: true,
            sol_amount,
            token_amount: tokens_out,
            fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }

    /// Buy tokens — 15% platform fee to fee_recipient
    pub fn buy(
        ctx: Context<Buy>,
        sol_amount: u64,
        min_tokens_out: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(sol_amount >= MIN_PURCHASE, BondingCurveError::PurchaseTooSmall);
        require!(max_slippage_bps <= MAX_SLIPPAGE_BPS, BondingCurveError::SlippageTooHigh);

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(!bonding_curve.complete, BondingCurveError::BondingCurveComplete);

        let fee = sol_amount
            .checked_mul(PLATFORM_FEE_BPS).ok_or(BondingCurveError::Overflow)?
            .checked_div(BASIS_POINTS).ok_or(BondingCurveError::Overflow)?;
        let sol_after_fee = sol_amount.checked_sub(fee).ok_or(BondingCurveError::Underflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to:   ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            fee,
        )?;

        let tokens_out = calculate_buy_price(
            sol_after_fee,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        require!(tokens_out >= min_tokens_out, BondingCurveError::SlippageTooHigh);

        let new_real_token_reserves = bonding_curve.real_token_reserves
            .checked_add(tokens_out).ok_or(BondingCurveError::Overflow)?;
        require!(new_real_token_reserves <= MAX_SUPPLY, BondingCurveError::MaxSupplyExceeded);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to:   ctx.accounts.sol_reserves.to_account_info(),
                },
            ),
            sol_after_fee,
        )?;

        let mint_key = bonding_curve.token_mint;
        let seeds = &[b"bonding_curve", mint_key.as_ref(), &[bonding_curve.bump]];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint:      ctx.accounts.token_mint.to_account_info(),
                    to:        ctx.accounts.buyer_token_account.to_account_info(),
                    authority: bonding_curve.to_account_info(),
                },
                signer,
            ),
            tokens_out,
        )?;

        bonding_curve.virtual_sol_reserves   = bonding_curve.virtual_sol_reserves.checked_add(sol_after_fee).ok_or(BondingCurveError::Overflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve.virtual_token_reserves.checked_sub(tokens_out).ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_sol_reserves      = bonding_curve.real_sol_reserves.checked_add(sol_after_fee).ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_token_reserves    = new_real_token_reserves;

        if bonding_curve.real_sol_reserves >= bonding_curve.target_amount {
            bonding_curve.complete = true;
            emit!(BondingCurveComplete {
                bonding_curve: bonding_curve.key(),
                final_sol_amount: bonding_curve.real_sol_reserves,
            });
        }

        emit!(TradeEvent {
            bonding_curve: bonding_curve.key(),
            user: ctx.accounts.buyer.key(),
            is_buy: true,
            sol_amount,
            token_amount: tokens_out,
            fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }

    /// Sell tokens — 15% platform fee to fee_recipient
    pub fn sell(
        ctx: Context<Sell>,
        token_amount: u64,
        min_sol_out: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(token_amount > 0, BondingCurveError::InvalidAmount);
        require!(max_slippage_bps <= MAX_SLIPPAGE_BPS, BondingCurveError::SlippageTooHigh);

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(!bonding_curve.complete, BondingCurveError::BondingCurveComplete);

        let gross_sol = calculate_sell_price(
            token_amount,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        let fee = gross_sol
            .checked_mul(PLATFORM_FEE_BPS).ok_or(BondingCurveError::Overflow)?
            .checked_div(BASIS_POINTS).ok_or(BondingCurveError::Overflow)?;
        let sol_out = gross_sol.checked_sub(fee).ok_or(BondingCurveError::Underflow)?;

        require!(sol_out >= min_sol_out, BondingCurveError::SlippageTooHigh);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint:      ctx.accounts.token_mint.to_account_info(),
                    from:      ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_amount,
        )?;

        **ctx.accounts.sol_reserves.try_borrow_mut_lamports()?    = ctx.accounts.sol_reserves.lamports().checked_sub(gross_sol).ok_or(BondingCurveError::Underflow)?;
        **ctx.accounts.fee_recipient.try_borrow_mut_lamports()?   = ctx.accounts.fee_recipient.lamports().checked_add(fee).ok_or(BondingCurveError::Overflow)?;
        **ctx.accounts.seller.try_borrow_mut_lamports()?          = ctx.accounts.seller.lamports().checked_add(sol_out).ok_or(BondingCurveError::Overflow)?;

        bonding_curve.virtual_sol_reserves   = bonding_curve.virtual_sol_reserves.checked_sub(gross_sol).ok_or(BondingCurveError::Underflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve.virtual_token_reserves.checked_add(token_amount).ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_sol_reserves      = bonding_curve.real_sol_reserves.checked_sub(gross_sol).ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_token_reserves    = bonding_curve.real_token_reserves.checked_sub(token_amount).ok_or(BondingCurveError::Underflow)?;

        emit!(TradeEvent {
            bonding_curve: bonding_curve.key(),
            user: ctx.accounts.seller.key(),
            is_buy: false,
            sol_amount: sol_out,
            token_amount,
            fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

fn calculate_buy_price(sol_in: u64, virtual_sol: u64, virtual_tokens: u64) -> Result<u64> {
    let k        = (virtual_sol as u128).checked_mul(virtual_tokens as u128).ok_or(BondingCurveError::Overflow)?;
    let new_sol  = (virtual_sol as u128).checked_add(sol_in as u128).ok_or(BondingCurveError::Overflow)?;
    let new_tok  = k.checked_div(new_sol).ok_or(BondingCurveError::DivisionByZero)?;
    let out      = (virtual_tokens as u128).checked_sub(new_tok).ok_or(BondingCurveError::Underflow)?;
    Ok(out as u64)
}

fn calculate_sell_price(tokens_in: u64, virtual_sol: u64, virtual_tokens: u64) -> Result<u64> {
    let k        = (virtual_sol as u128).checked_mul(virtual_tokens as u128).ok_or(BondingCurveError::Overflow)?;
    let new_tok  = (virtual_tokens as u128).checked_add(tokens_in as u128).ok_or(BondingCurveError::Overflow)?;
    let new_sol  = k.checked_div(new_tok).ok_or(BondingCurveError::DivisionByZero)?;
    let out      = (virtual_sol as u128).checked_sub(new_sol).ok_or(BondingCurveError::Underflow)?;
    Ok(out as u64)
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + std::mem::size_of::<BondingCurve>(),
        seeds = [b"bonding_curve", token_mint.key().as_ref()], bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)] pub token_mint: Account<'info, Mint>,
    /// CHECK: SOL reserves PDA
    #[account(mut, seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump)]
    pub sol_reserves: SystemAccount<'info>,
    /// CHECK: Fee recipient wallet — receives platform fees
    #[account(mut)] pub fee_recipient: AccountInfo<'info>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:  Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)] pub creator: Signer<'info>,
    /// CHECK: Fee recipient wallet
    #[account(mut)] pub fee_recipient: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut, seeds = [b"bonding_curve", token_mint.key().as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)] pub token_mint: Account<'info, Mint>,
    /// CHECK: SOL reserves PDA
    #[account(mut, seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump)]
    pub sol_reserves: SystemAccount<'info>,
    /// CHECK: Fee recipient wallet
    #[account(mut)] pub fee_recipient: AccountInfo<'info>,
    #[account(mut)] pub buyer: Signer<'info>,
    #[account(init_if_needed, payer = buyer,
        associated_token::mint = token_mint, associated_token::authority = buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub system_program:          Program<'info, System>,
    pub token_program:           Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut, seeds = [b"bonding_curve", token_mint.key().as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)] pub token_mint: Account<'info, Mint>,
    /// CHECK: SOL reserves PDA
    #[account(mut, seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump)]
    pub sol_reserves: SystemAccount<'info>,
    /// CHECK: Fee recipient wallet
    #[account(mut)] pub fee_recipient: AccountInfo<'info>,
    #[account(mut)] pub seller: Signer<'info>,
    #[account(mut, associated_token::mint = token_mint, associated_token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct BondingCurve {
    pub authority:             Pubkey,
    pub token_mint:            Pubkey,
    pub sol_reserves:          Pubkey,
    pub fee_recipient:         Pubkey,
    pub virtual_sol_reserves:  u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves:     u64,
    pub real_token_reserves:   u64,
    pub target_amount:         u64,
    pub complete:              bool,
    pub initial_buy_done:      bool,
    pub bump:                  u8,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct BondingCurveCreated {
    pub bonding_curve: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
}

#[event]
pub struct BondingCurveComplete {
    pub bonding_curve: Pubkey,
    pub final_sol_amount: u64,
}

#[event]
pub struct TradeEvent {
    pub bonding_curve: Pubkey,
    pub user: Pubkey,
    pub is_buy: bool,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub fee: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
}

#[event]
pub struct TokenCreatedEvent {
    pub creator: Pubkey,
    pub fee_paid: u64,
    pub revoke_mint: bool,
    pub revoke_freeze: bool,
    pub immutable_metadata: bool,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum BondingCurveError {
    #[msg("Purchase amount too small")]         PurchaseTooSmall,
    #[msg("Maximum supply exceeded")]           MaxSupplyExceeded,
    #[msg("Slippage tolerance exceeded")]       SlippageTooHigh,
    #[msg("Bonding curve is complete")]         BondingCurveComplete,
    #[msg("Initial buy already executed")]      InitialBuyAlreadyDone,
    #[msg("Invalid amount")]                    InvalidAmount,
    #[msg("Arithmetic overflow")]               Overflow,
    #[msg("Arithmetic underflow")]              Underflow,
    #[msg("Division by zero")]                  DivisionByZero,
}
