use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("CqzUoSdSQPpcTJXhiTgAdupoaJ9yRTjbVXVfC41Aqckm");

const FEE_RECIPIENT: Pubkey = pubkey!("EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ");
const CREATION_FEE_BPS: u64 = 1450;
const TRADE_FEE_BPS: u64 = 450;
const BASIS_POINTS: u128 = 10000;
const SOL_RESERVES_SPACE: usize = 8 + 1;

const MAX_SUPPLY: u64 = 1_000_000_000_000_000_000;
const MIN_PURCHASE: u64 = 1000;
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
        require!(
            initial_virtual_sol_reserves > 0,
            BondingCurveError::InvalidAmount
        );
        require!(
            initial_virtual_token_reserves > 0,
            BondingCurveError::InvalidAmount
        );
        require!(target_amount > 0, BondingCurveError::InvalidAmount);
        require!(
            ctx.accounts.token_mint.decimals == 9,
            BondingCurveError::InvalidTokenDecimals
        );
        require!(
            ctx.accounts.token_mint.supply == 0
                && ctx.accounts.token_mint.mint_authority
                    == COption::Some(ctx.accounts.authority.key()),
            BondingCurveError::InvalidMintAuthority
        );
        require!(
            ctx.accounts.token_mint.freeze_authority.is_none(),
            BondingCurveError::FreezeAuthorityMustBeRevoked
        );

        let bonding_curve = &mut ctx.accounts.bonding_curve;

        bonding_curve.authority = ctx.accounts.authority.key();
        bonding_curve.token_mint = ctx.accounts.token_mint.key();
        bonding_curve.fee_recipient = FEE_RECIPIENT;
        bonding_curve.sol_reserves = ctx.accounts.sol_reserves.key();
        ctx.accounts.sol_reserves.bump = ctx.bumps.sol_reserves;
        bonding_curve.virtual_sol_reserves = initial_virtual_sol_reserves;
        bonding_curve.virtual_token_reserves = initial_virtual_token_reserves;
        bonding_curve.real_sol_reserves = 0;
        bonding_curve.real_token_reserves = 0;
        bonding_curve.target_amount = target_amount;
        bonding_curve.complete = false;
        bonding_curve.initial_buy_done = false;
        bonding_curve.bump = ctx.bumps.bonding_curve;

        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::SetAuthority {
                    current_authority: ctx.accounts.authority.to_account_info(),
                    account_or_mint: ctx.accounts.token_mint.to_account_info(),
                },
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

    /// The creator's mandatory first buy pays creation and trading fees; no exemption applies.
    pub fn initial_buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        require!(
            sol_amount >= MIN_PURCHASE,
            BondingCurveError::PurchaseTooSmall
        );

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(
            !bonding_curve.complete,
            BondingCurveError::BondingCurveComplete
        );
        require!(
            !bonding_curve.initial_buy_done,
            BondingCurveError::InitialBuyAlreadyDone
        );
        require!(
            ctx.accounts.buyer.key() == bonding_curve.authority,
            BondingCurveError::CreatorInitialBuyRequired
        );
        require!(
            ctx.accounts.buyer.key() != FEE_RECIPIENT,
            BondingCurveError::FeeRecipientCannotTrade
        );

        let creation_fee = calculate_fee(sol_amount, CREATION_FEE_BPS)?;
        let trading_fee = calculate_fee(sol_amount, TRADE_FEE_BPS)?;
        let fee = creation_fee
            .checked_add(trading_fee)
            .ok_or(BondingCurveError::Overflow)?;
        let sol_after_fee = sol_amount
            .checked_sub(fee)
            .ok_or(BondingCurveError::Underflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            fee,
        )?;

        let tokens_out = calculate_buy_price(
            sol_after_fee,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        require!(tokens_out > 0, BondingCurveError::InvalidAmount);
        require!(
            tokens_out >= min_tokens_out,
            BondingCurveError::SlippageTooHigh
        );

        let new_real_token_reserves = bonding_curve
            .real_token_reserves
            .checked_add(tokens_out)
            .ok_or(BondingCurveError::Overflow)?;
        require!(
            new_real_token_reserves <= MAX_SUPPLY,
            BondingCurveError::MaxSupplyExceeded
        );

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.sol_reserves.to_account_info(),
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
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: bonding_curve.to_account_info(),
                },
                signer,
            ),
            tokens_out,
        )?;

        bonding_curve.virtual_sol_reserves = bonding_curve
            .virtual_sol_reserves
            .checked_add(sol_after_fee)
            .ok_or(BondingCurveError::Overflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve
            .virtual_token_reserves
            .checked_sub(tokens_out)
            .ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_sol_reserves = bonding_curve
            .real_sol_reserves
            .checked_add(sol_after_fee)
            .ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_token_reserves = new_real_token_reserves;
        bonding_curve.initial_buy_done = true;

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
            creation_fee,
            trading_fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }

    /// Buy tokens with the configured non-exempt platform fee.
    pub fn buy(
        ctx: Context<Buy>,
        sol_amount: u64,
        min_tokens_out: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(
            sol_amount >= MIN_PURCHASE,
            BondingCurveError::PurchaseTooSmall
        );
        require!(
            max_slippage_bps <= MAX_SLIPPAGE_BPS,
            BondingCurveError::SlippageTooHigh
        );

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(
            !bonding_curve.complete,
            BondingCurveError::BondingCurveComplete
        );
        require!(
            bonding_curve.initial_buy_done,
            BondingCurveError::InitialBuyRequired
        );
        require!(
            ctx.accounts.buyer.key() != FEE_RECIPIENT,
            BondingCurveError::FeeRecipientCannotTrade
        );

        let fee = calculate_fee(sol_amount, TRADE_FEE_BPS)?;
        let sol_after_fee = sol_amount
            .checked_sub(fee)
            .ok_or(BondingCurveError::Underflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            fee,
        )?;

        let tokens_out = calculate_buy_price(
            sol_after_fee,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        require!(tokens_out > 0, BondingCurveError::InvalidAmount);
        require!(
            tokens_out >= min_tokens_out,
            BondingCurveError::SlippageTooHigh
        );

        let new_real_token_reserves = bonding_curve
            .real_token_reserves
            .checked_add(tokens_out)
            .ok_or(BondingCurveError::Overflow)?;
        require!(
            new_real_token_reserves <= MAX_SUPPLY,
            BondingCurveError::MaxSupplyExceeded
        );

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.sol_reserves.to_account_info(),
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
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: bonding_curve.to_account_info(),
                },
                signer,
            ),
            tokens_out,
        )?;

        bonding_curve.virtual_sol_reserves = bonding_curve
            .virtual_sol_reserves
            .checked_add(sol_after_fee)
            .ok_or(BondingCurveError::Overflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve
            .virtual_token_reserves
            .checked_sub(tokens_out)
            .ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_sol_reserves = bonding_curve
            .real_sol_reserves
            .checked_add(sol_after_fee)
            .ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_token_reserves = new_real_token_reserves;

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
            creation_fee: 0,
            trading_fee: fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }

    /// Sell tokens with the configured non-exempt platform fee.
    pub fn sell(
        ctx: Context<Sell>,
        token_amount: u64,
        min_sol_out: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(token_amount > 0, BondingCurveError::InvalidAmount);
        require!(
            max_slippage_bps <= MAX_SLIPPAGE_BPS,
            BondingCurveError::SlippageTooHigh
        );

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        require!(
            bonding_curve.initial_buy_done,
            BondingCurveError::InitialBuyRequired
        );
        require!(
            ctx.accounts.seller.key() != FEE_RECIPIENT,
            BondingCurveError::FeeRecipientCannotTrade
        );
        let gross_sol = calculate_sell_price(
            token_amount,
            bonding_curve.virtual_sol_reserves,
            bonding_curve.virtual_token_reserves,
        )?;

        let fee = calculate_fee(gross_sol, TRADE_FEE_BPS)?;
        let sol_out = gross_sol
            .checked_sub(fee)
            .ok_or(BondingCurveError::Underflow)?;

        require!(sol_out > 0, BondingCurveError::InvalidAmount);
        require!(sol_out >= min_sol_out, BondingCurveError::SlippageTooHigh);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_amount,
        )?;

        let reserves_after_sale = ctx
            .accounts
            .sol_reserves
            .lamports()
            .checked_sub(gross_sol)
            .ok_or(BondingCurveError::InsufficientLiquidity)?;
        require!(
            reserves_after_sale >= Rent::get()?.minimum_balance(SOL_RESERVES_SPACE),
            BondingCurveError::InsufficientLiquidity
        );
        **ctx.accounts.sol_reserves.try_borrow_mut_lamports()? = reserves_after_sale;
        **ctx.accounts.fee_recipient.try_borrow_mut_lamports()? = ctx
            .accounts
            .fee_recipient
            .lamports()
            .checked_add(fee)
            .ok_or(BondingCurveError::Overflow)?;
        **ctx.accounts.seller.try_borrow_mut_lamports()? = ctx
            .accounts
            .seller
            .lamports()
            .checked_add(sol_out)
            .ok_or(BondingCurveError::Overflow)?;

        bonding_curve.virtual_sol_reserves = bonding_curve
            .virtual_sol_reserves
            .checked_sub(gross_sol)
            .ok_or(BondingCurveError::Underflow)?;
        bonding_curve.virtual_token_reserves = bonding_curve
            .virtual_token_reserves
            .checked_add(token_amount)
            .ok_or(BondingCurveError::Overflow)?;
        bonding_curve.real_sol_reserves = bonding_curve
            .real_sol_reserves
            .checked_sub(gross_sol)
            .ok_or(BondingCurveError::Underflow)?;
        bonding_curve.real_token_reserves = bonding_curve
            .real_token_reserves
            .checked_sub(token_amount)
            .ok_or(BondingCurveError::Underflow)?;

        emit!(TradeEvent {
            bonding_curve: bonding_curve.key(),
            user: ctx.accounts.seller.key(),
            is_buy: false,
            sol_amount: sol_out,
            token_amount,
            fee,
            creation_fee: 0,
            trading_fee: fee,
            virtual_sol_reserves: bonding_curve.virtual_sol_reserves,
            virtual_token_reserves: bonding_curve.virtual_token_reserves,
        });

        Ok(())
    }
}

fn calculate_fee(amount: u64, fee_bps: u64) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or_else(|| error!(BondingCurveError::Overflow))?
        / BASIS_POINTS;
    Ok(fee as u64)
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

fn calculate_buy_price(sol_in: u64, virtual_sol: u64, virtual_tokens: u64) -> Result<u64> {
    let k = (virtual_sol as u128)
        .checked_mul(virtual_tokens as u128)
        .ok_or(BondingCurveError::Overflow)?;
    let new_sol = (virtual_sol as u128)
        .checked_add(sol_in as u128)
        .ok_or(BondingCurveError::Overflow)?;
    let new_tok = k
        .checked_div(new_sol)
        .ok_or(BondingCurveError::DivisionByZero)?;
    let out = (virtual_tokens as u128)
        .checked_sub(new_tok)
        .ok_or(BondingCurveError::Underflow)?;
    Ok(out as u64)
}

fn calculate_sell_price(tokens_in: u64, virtual_sol: u64, virtual_tokens: u64) -> Result<u64> {
    let k = (virtual_sol as u128)
        .checked_mul(virtual_tokens as u128)
        .ok_or(BondingCurveError::Overflow)?;
    let new_tok = (virtual_tokens as u128)
        .checked_add(tokens_in as u128)
        .ok_or(BondingCurveError::Overflow)?;
    let new_sol = k
        .checked_div(new_tok)
        .ok_or(BondingCurveError::DivisionByZero)?;
    let out = (virtual_sol as u128)
        .checked_sub(new_sol)
        .ok_or(BondingCurveError::Underflow)?;
    Ok(out as u64)
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + std::mem::size_of::<BondingCurve>(),
        seeds = [b"bonding_curve", token_mint.key().as_ref()], bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    #[account(init, payer = authority, space = SOL_RESERVES_SPACE,
        seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump)]
    pub sol_reserves: Account<'info, SolReserves>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut, has_one = token_mint, has_one = sol_reserves,
        seeds = [b"bonding_curve", token_mint.key().as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump = sol_reserves.bump)]
    pub sol_reserves: Account<'info, SolReserves>,
    /// CHECK: Fixed platform fee recipient.
    #[account(mut, address = FEE_RECIPIENT)]
    pub fee_recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(init_if_needed, payer = buyer,
        associated_token::mint = token_mint, associated_token::authority = buyer)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut, has_one = token_mint, has_one = sol_reserves,
        seeds = [b"bonding_curve", token_mint.key().as_ref()], bump = bonding_curve.bump)]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"sol_reserves", bonding_curve.key().as_ref()], bump = sol_reserves.bump)]
    pub sol_reserves: Account<'info, SolReserves>,
    /// CHECK: Fixed platform fee recipient.
    #[account(mut, address = FEE_RECIPIENT)]
    pub fee_recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut, associated_token::mint = token_mint, associated_token::authority = seller)]
    pub seller_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct SolReserves {
    pub bump: u8,
}

#[account]
pub struct BondingCurve {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub sol_reserves: Pubkey,
    pub fee_recipient: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub target_amount: u64,
    pub complete: bool,
    pub initial_buy_done: bool,
    pub bump: u8,
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
    pub creation_fee: u64,
    pub trading_fee: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum BondingCurveError {
    #[msg("Purchase amount too small")]
    PurchaseTooSmall,
    #[msg("Maximum supply exceeded")]
    MaxSupplyExceeded,
    #[msg("Slippage tolerance exceeded")]
    SlippageTooHigh,
    #[msg("Bonding curve is complete")]
    BondingCurveComplete,
    #[msg("Initial buy already executed")]
    InitialBuyAlreadyDone,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Mint authority must be the creator and mint supply must be zero")]
    InvalidMintAuthority,
    #[msg("The creator must make the initial buy")]
    CreatorInitialBuyRequired,
    #[msg("The mint freeze authority must be revoked before bonding curve initialization")]
    FreezeAuthorityMustBeRevoked,
    #[msg("Token mint must use 9 decimals")]
    InvalidTokenDecimals,
    #[msg("The creator's initial buy must happen before public trading")]
    InitialBuyRequired,
    #[msg("The fee recipient cannot trade through the bonding curve")]
    FeeRecipientCannotTrade,
    #[msg("Bonding curve does not have enough SOL liquidity")]
    InsufficientLiquidity,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creator_initial_buy_pays_both_fees_without_exemption() {
        let amount = 1_000_000_000;
        let creation_fee = calculate_fee(amount, CREATION_FEE_BPS).unwrap();
        let trading_fee = calculate_fee(amount, TRADE_FEE_BPS).unwrap();

        assert_eq!(creation_fee, 145_000_000);
        assert_eq!(trading_fee, 45_000_000);
        assert_eq!(creation_fee + trading_fee, 190_000_000);
    }

    #[test]
    fn every_later_buy_and_sell_use_four_point_five_percent() {
        let amount = 2_000_000_000;

        assert_eq!(calculate_fee(amount, TRADE_FEE_BPS).unwrap(), 90_000_000);
    }
}
