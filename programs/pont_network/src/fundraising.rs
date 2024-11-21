use anchor_lang::{
    prelude::*,
    solana_program::{self, instruction::Instruction, program::{invoke, invoke_signed}, system_instruction},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3,
        Metadata,
    },
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer},
};

use crate::{__private::__global::claim_rewards, id, instruction};

#[account]
pub struct FundraisingAccount {
    pub start_time: i64,
    pub end_time: i64,
    pub total_funds_raised: u64,
    pub token_mint: Pubkey,
    pub total_fees_collected: u64,
    pub total_staked: u64,
    pub user_staking_info: Vec<UserAccount>,
}

#[account]
pub struct UserAccount {
    pub key: Pubkey,
    pub amount_staked: u64,
    // Total fees collected by protocol when user last claimed
    pub total_fees_when_last_claimed: u64,
    // last claim slot
    pub last_claimed_fees_slot: u64,
    // pub total_fees_claimed: u64,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut, seeds = [b"fundraising"], bump)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    pub recipient: SystemAccount<'info>,

    #[account(mut, seeds = [b"mint"], bump)]
    pub mint_account: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = sender,
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint_account,
        associated_token::authority = recipient,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,
    #[account(mut, seeds = [b"fundraising"], bump)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    #[account(mut)]
    pub mint_account: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = fundraising_account,
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = recipient,
        associated_token::mint = mint_account,
        associated_token::authority = recipient,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartFundraising<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init, seeds = [b"fundraising"], bump, payer = user, space = 8 + 8 + 8 + 8 + 32 + 1000)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    #[account(
        init,
        seeds = [b"mint"],
        bump,
        payer = user,
        mint::decimals = 9,
        mint::authority = mint_account.key(),
        mint::freeze_authority = mint_account.key(),

    )]
    pub mint_account: Account<'info, Mint>,
    /// CHECK: Validate address by deriving pda
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), mint_account.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"fundraising"], bump)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub associated_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub token_mint: Account<'info, Mint>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn start_fundraising(ctx: Context<StartFundraising>) -> Result<()> {
    let fundraising_account = &mut ctx.accounts.fundraising_account;
    let clock = Clock::get()?;
    fundraising_account.start_time = clock.unix_timestamp;
    fundraising_account.end_time = clock.unix_timestamp + 7 * 24 * 60 * 60; // 7 days
    fundraising_account.total_funds_raised = 0;
    fundraising_account.token_mint = ctx.accounts.mint_account.key();
    fundraising_account.total_fees_collected = 0;
    fundraising_account.user_staking_info = vec![];

    msg!("Fundraising started");

    msg!("Creating metadata account...");
    msg!(
        "Metadata account address: {}",
        &ctx.accounts.metadata_account.key()
    );

    let signer_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];

    // Cross Program Invocation (CPI)
    // Invoking the create_metadata_account_v3 instruction on the token metadata program
    create_metadata_accounts_v3(
        CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                mint_authority: ctx.accounts.mint_account.to_account_info(),
                update_authority: ctx.accounts.user.to_account_info(),
                payer: ctx.accounts.user.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        DataV2 {
            name: "Pont Network Shares".to_string(),
            symbol: "PNTSH".to_string(),
            uri: "https://example.com".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        false, // Is mutable
        true,  // Update authority is signer
        None,  // Collection details
    )?;

    msg!("Token mint created successfully.");

    Ok(())
}

pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
    let fundraising_account = &mut ctx.accounts.fundraising_account;
    let clock = Clock::get()?;
    if clock.unix_timestamp > fundraising_account.end_time {
        return err!(FundraisingErrors::FundraisingPeriodEnded); // Fundraising period has ended
    }

    let user = &mut ctx.accounts.user;

    // Create the system transfer instruction
    let transfer_instruction =
        system_instruction::transfer(user.key, &fundraising_account.key(), amount);

    // Send the transfer instruction
    solana_program::program::invoke(
        &transfer_instruction,
        &[
            fundraising_account.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    fundraising_account.total_funds_raised += amount;

    // Mint PONT SHARES tokens to the user
    msg!("Minting token to associated token account...");
    msg!("Mint: {}", &ctx.accounts.token_mint.key());
    msg!(
        "Token Address: {}",
        &ctx.accounts.associated_token_account.key()
    );

    // PDA signer seeds
    let signer_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.token_mint]]];

    // Invoke the mint_to instruction on the token program
    mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.associated_token_account.to_account_info(),
                authority: ctx.accounts.token_mint.to_account_info(), // PDA mint authority, required as signer
            },
        )
        .with_signer(signer_seeds), // using PDA to sign
        amount, // Mint tokens, adjust for decimals
    )?;

    msg!("User contributed {} lamports", amount);
    msg!(
        "Minted {} tokens to user {}",
        amount,
        ctx.accounts.user.key()
    );

    Ok(())
}

pub fn stake_and_claim(ctx: Context<Stake>, amount: u64) -> Result<()> {
    // let claim_rewards_ix = Instruction {
    //     program_id: id(),
    //     accounts: vec![
    //         AccountMeta::new(*ctx.accounts.sender.key, true),
    //         AccountMeta::new(ctx.accounts.fundraising_account.key(), false),
    //         AccountMeta::new(ctx.accounts.sender_token_account.key(), false),
    //         AccountMeta::new(ctx.accounts.mint_account.key(), false),
    //         AccountMeta::new_readonly(ctx.accounts.system_program.key.key(), false),
    //     ],
    //     data: instruction::ClaimRewards.try_to_vec().unwrap(),
    // };

    // invoke(
    //     &claim_rewards_ix,
    //     &[
    //         ctx.accounts.sender.to_account_info(),
    //         ctx.accounts.fundraising_account.to_account_info(),
    //         ctx.accounts.sender_token_account.to_account_info(),
    //         ctx.accounts.mint_account.to_account_info(),
    //         ctx.accounts.system_program.to_account_info(),
    //     ],
    // )?;

    let fundraising_account = &mut ctx.accounts.fundraising_account;
    let slot = Clock::get()?.slot;

    // Invoke the transfer instruction on the token program
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        amount, // Transfer amount, adjust for decimals
    )?;

    // Check if user already exists in the list of users staking
    let sender_key = *ctx.accounts.sender.key;
    let total_fees_collected = fundraising_account.total_fees_collected;
    if let Some(user_account) = fundraising_account
        .user_staking_info
        .iter_mut()
        .find(|user| user.key == sender_key)
    {
        // Update existing user account
        user_account.amount_staked += amount;
        user_account.total_fees_when_last_claimed = total_fees_collected;
        user_account.last_claimed_fees_slot = slot;
    } else {
        // Add new user account
        fundraising_account.user_staking_info.push(UserAccount {
            key: sender_key,
            amount_staked: amount,
            total_fees_when_last_claimed: total_fees_collected,
            last_claimed_fees_slot: slot,
        });
    }

    fundraising_account.total_staked += amount;

    msg!("User staked {} tokens", amount);

    Ok(())
}

pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    let fundraising_account = &mut ctx.accounts.fundraising_account;
    // let slot = Clock::get()?.slot;

    let signer_seeds: &[&[&[u8]]] = &[&[b"fundraising", &[ctx.bumps.fundraising_account]]];

    // Invoke the transfer instruction on the token program
    transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: fundraising_account.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
        amount, // Transfer amount, adjust for decimals
    )?;

    // Check if user already exists in the list of users staking
    let sender_key = *ctx.accounts.recipient.key;
    if let Some(user_account) = fundraising_account
        .user_staking_info
        .iter_mut()
        .find(|user| user.key == sender_key)
    {
        // Update existing user account
        user_account.amount_staked -= amount;
        // TODO
    }

    fundraising_account.total_staked -= amount;

    msg!("User unstaked {} tokens", amount);

    Ok(())
}

#[error_code]
pub enum FundraisingErrors {
    FundraisingPeriodEnded,
}
