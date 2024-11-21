mod fundraising;

use anchor_spl::token::{Mint, TokenAccount};
use itertools::izip;
use std::vec;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;
use fundraising::*;

const ANCHOR_DISCRIMINATOR: usize = 8;
const PUBKEY_SIZE: usize = 32;
const FINGERPRINT_SIZE: usize = 32;
const TX_COST: u64 = (LAMPORTS_PER_SOL as f64 * 0.01) as u64;

declare_id!("8h6Ei5DT8ygysAaygguxZFKWcgnPhd9qLFHbvjREYFcR");

#[program]
pub mod pont_network {
    use anchor_lang::solana_program::{self, blake3::hash, system_instruction};

    use super::*;

    pub fn initialize_ship(ctx: Context<InitializeShip>, ship: Pubkey) -> Result<()> {
        let ship_account = &mut ctx.accounts.ship_account;
        ship_account.ship = ship;
        ship_account.data_accounts = Vec::new();
        ship_account.ship_management = *ctx.accounts.ship_management.key;

        msg!("Ship account initialized");

        emit!(ShipInitialized {
            ship,
            ship_management: ship_account.ship_management,
        });

        Ok(())
    }

    pub fn add_data_account(
        ctx: Context<AddDataAccount>,
        external_observers: Vec<Pubkey>,
        external_observers_keys: Vec<[u8; 128]>,
        external_observers_x25519_pks: Vec<Pubkey>,
        timestamp: u64,
    ) -> Result<()> {
        assert_eq!(external_observers.len(), external_observers_keys.len());
        assert_eq!(
            external_observers.len(),
            external_observers_x25519_pks.len()
        );

        let ship_account = &mut ctx.accounts.ship_account;
        ship_account
            .data_accounts
            .push(ctx.accounts.data_account.key());
        ship_account
            .data_account_starting_timestamps
            .push(timestamp);

        let data_account = &mut ctx.accounts.data_account;
        data_account.ship = *ctx.accounts.ship.key;
        data_account.fingerprints = Vec::new();

        let external_observers_account = &mut ctx.accounts.external_observers_account;
        external_observers_account.unapproved_external_observers = Vec::new();
        external_observers_account.unapproved_external_observers_x25519_pks = Vec::new();
        external_observers_account.external_observers_master_keys = external_observers_keys.clone();
        external_observers_account.external_observers = external_observers.clone();
        external_observers_account.external_observers_x25519_pks =
            external_observers_x25519_pks.clone();

        emit!(DataAccountInitialized {
            ship: *ctx.accounts.ship.key,
            data_account: data_account.key(),
            external_observers: external_observers,
            external_observers_keys: external_observers_keys,
        });

        Ok(())
    }

    pub fn external_observer_request(
        ctx: Context<ExternalObserverRequest>,
        external_observer_x25519_pk: Pubkey,
    ) -> Result<()> {
        let external_observers_account = &mut ctx.accounts.external_observers_account;
        let external_observer = *ctx.accounts.external_observer.key;

        if !external_observers_account
            .unapproved_external_observers
            .contains(&external_observer)
        {
            external_observers_account
                .unapproved_external_observers
                .push(external_observer);

            external_observers_account
                .unapproved_external_observers_x25519_pks
                .push(external_observer_x25519_pk);

            emit!(ExternalObserverRequested {
                data_account: ctx.accounts.data_account.key(),
                external_observer: external_observer,
            });

            Ok(())
        } else {
            Err(CustomErrors::ExternalObserverAlreadyRequested.into())
        }
    }

    pub fn add_external_observer(
        ctx: Context<AddExternalObserver>,
        external_observer_to_be_approved: Pubkey,
        external_observer_encrypted_master_key: [u8; 128],
    ) -> Result<()> {
        let external_observers_account = &mut ctx.accounts.external_observers_account;

        let eo_index = external_observers_account
            .unapproved_external_observers
            .iter()
            .position(|&x| x == external_observer_to_be_approved)
            .unwrap();

        external_observers_account
            .unapproved_external_observers
            .remove(eo_index);
        let eo_x25519_pk = external_observers_account
            .unapproved_external_observers_x25519_pks
            .remove(eo_index);

        external_observers_account
            .external_observers
            .push(external_observer_to_be_approved);

        external_observers_account
            .external_observers_x25519_pks
            .push(eo_x25519_pk);

        external_observers_account
            .external_observers_master_keys
            .push(external_observer_encrypted_master_key);

        emit!(ExternalObserverAdded {
            data_account: ctx.accounts.data_account.key(),
            external_observer: external_observer_to_be_approved,
            external_observers_account: ctx.accounts.external_observers_account.key(),
            ship_account: ctx.accounts.ship_account.key(),
            ship_management: ctx.accounts.ship_management.key(),
            external_observer_encrypted_master_key,
        });

        Ok(())
    }

    pub fn add_data_fingerprint(
        ctx: Context<AddDataFingerprint>,
        ciphertext: Vec<u8>,
        tag: Vec<u8>,
        iv: Vec<u8>,
        ciphertext_timestamp: u64,
    ) -> Result<()> {
        let lamports_required = TX_COST;

        let ship = &ctx.accounts.ship;

        // Create the system transfer instruction
        let transfer_instruction = system_instruction::transfer(
            ctx.accounts.ship.key,
            &ctx.accounts.fundraising_account.key(),
            lamports_required,
        );

        ctx.accounts.fundraising_account.total_fees_collected += lamports_required;

        // Send the transfer instruction
        solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.ship.to_account_info(),
                ctx.accounts.fundraising_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let data_account = &mut ctx.accounts.data_account;
        let fingerprint = Fingerprint::from(hash(&ciphertext).to_bytes());
        data_account.fingerprints.push(fingerprint.clone());

        emit!(DataFingerprintAdded {
            ship: *ship.key,
            fingerprint,
            ciphertext,
            tag,
            iv,
            ciphertext_timestamp,
            data_account: ctx.accounts.data_account.key(),
        });

        Ok(())
    }

    pub fn add_multiple_data_fingerprints(
        ctx: Context<AddDataFingerprint>,
        ciphertexts: Vec<Vec<u8>>,
        tags: Vec<Vec<u8>>,
        ivs: Vec<Vec<u8>>,
        ciphertext_timestamps: Vec<u64>,
    ) -> Result<()> {
        assert_eq!(ciphertexts.len(), ciphertext_timestamps.len());

        let data_account = &mut ctx.accounts.data_account;

        for (ciphertext_instance, tag_instance, iv_instance, timestamp) in
            izip!(ciphertexts, tags, ivs, ciphertext_timestamps)
        {
            let fingerprint = Fingerprint::from(hash(&ciphertext_instance).to_bytes());

            data_account.fingerprints.push(fingerprint.clone());

            emit!(DataFingerprintAdded {
                ship: *ctx.accounts.ship.key,
                fingerprint,
                ciphertext: ciphertext_instance.clone(),
                tag: tag_instance,
                iv: iv_instance,
                ciphertext_timestamp: timestamp,
                data_account: data_account.key(),
            });
        }

        Ok(())
    }

    pub fn reallocate_data_account(ctx: Context<ReallocateDataAccount>) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let new_size = data_account.to_account_info().data_len() + 10240;
        data_account.to_account_info().realloc(new_size, false)?;
        Ok(())
    }

    pub fn start_fundraising(ctx: Context<StartFundraising>) -> Result<()> {
        fundraising::start_fundraising(ctx)
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        fundraising::contribute(ctx, amount)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let fundraising_account = &mut ctx.accounts.fundraising_account;
    let user = &mut ctx.accounts.user;

    let total_staked = fundraising_account.total_staked;
    let total_fees_collected = fundraising_account.total_fees_collected;

    let user_account = match fundraising_account
        .user_staking_info
        .iter_mut()
        .find(|x| x.key == *user.key)
    {
        Some(account) => account,
        None => return Ok(()),
    };

    let user_share_percentage = user_account.amount_staked as f64 / total_staked as f64;

    // Calculate the user's share of the rewards
    let fees_since_last_claim =
        total_fees_collected - user_account.total_fees_when_last_claimed;

    let user_rewards = (fees_since_last_claim as f64 * user_share_percentage) as u64;

    // Transfer the user's share of the rewards
    **fundraising_account
        .to_account_info()
        .try_borrow_mut_lamports()? -= user_rewards as u64;
    **user.try_borrow_mut_lamports()? += user_rewards as u64;

    msg!("User claimed {} lamports", user_rewards);

    Ok(())
}

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        fundraising::stake_and_claim(ctx, amount)
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        fundraising::unstake(ctx, amount)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Fingerprint([u8; 32]);

impl From<[u8; 32]> for Fingerprint {
    fn from(hash: [u8; 32]) -> Self {
        Fingerprint(hash)
    }
}

#[event]
pub struct ShipInitialized {
    pub ship: Pubkey,
    pub ship_management: Pubkey,
}

#[event]
pub struct DataAccountInitialized {
    pub ship: Pubkey,
    pub data_account: Pubkey,
    pub external_observers: Vec<Pubkey>,
    pub external_observers_keys: Vec<[u8; 128]>,
}

#[event]
pub struct DataFingerprintAdded {
    pub ship: Pubkey,
    pub fingerprint: Fingerprint,
    pub ciphertext: Vec<u8>,
    pub tag: Vec<u8>,
    pub iv: Vec<u8>,
    pub ciphertext_timestamp: u64,
    pub data_account: Pubkey,
}

#[event]
pub struct ExternalObserverRequested {
    pub data_account: Pubkey,
    pub external_observer: Pubkey,
}

#[event]
pub struct ExternalObserverAdded {
    pub data_account: Pubkey,
    pub external_observer: Pubkey,
    pub external_observers_account: Pubkey,
    pub ship_account: Pubkey,
    pub ship_management: Pubkey,
    pub external_observer_encrypted_master_key: [u8; 128],
}

#[account]
pub struct ShipAccount {
    pub ship: Pubkey,
    pub ship_management: Pubkey,
    pub data_accounts: Vec<Pubkey>,
    pub data_account_starting_timestamps: Vec<u64>,
}

impl ShipAccount {
    pub fn get_size(&self) -> usize {
        let size = 8
            + PUBKEY_SIZE
            + PUBKEY_SIZE
            + 4
            + (self.data_accounts.len() * 32)
            + 4
            + (self.data_account_starting_timestamps.len() * 8);
        msg!("Current ShipAccount size: {}", size);
        size
    }
}

#[account]
pub struct DataAccount {
    pub ship: Pubkey,
    pub fingerprints: Vec<Fingerprint>,
}

#[account]
pub struct ExternalObserversAccount {
    pub unapproved_external_observers: Vec<Pubkey>,
    pub unapproved_external_observers_x25519_pks: Vec<Pubkey>,
    pub external_observers: Vec<Pubkey>,
    pub external_observers_x25519_pks: Vec<Pubkey>,
    pub external_observers_master_keys: Vec<[u8; 128]>,
}

impl ExternalObserversAccount {
    pub fn get_size(&self) -> usize {
        let size = 8
            + 4
            + (self.unapproved_external_observers.len() * PUBKEY_SIZE)
            + 4
            + (self.unapproved_external_observers_x25519_pks.len() * PUBKEY_SIZE)
            + 4
            + (self.external_observers_x25519_pks.len() * PUBKEY_SIZE)
            + 4
            + (self.external_observers.len() * PUBKEY_SIZE)
            + 4
            + (self.external_observers_master_keys.len() * 128);
        msg!("Current ExternalObserversAccount size: {}", size);
        size
    }
}

#[derive(Accounts)]
#[instruction(ship: Pubkey)]
pub struct InitializeShip<'info> {
    #[account(
        init,
        payer = ship_management,
        space = 8 + PUBKEY_SIZE + PUBKEY_SIZE + 4 + 4,
        seeds = [b"ship_account", ship.key().as_ref()],
        bump
    )]
    pub ship_account: Account<'info, ShipAccount>,
    #[account(mut)]
    pub ship_management: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_observers: Vec<Pubkey>, external_observers_keys: Vec<[u8; 128]>, external_observers_x25519_pks: Vec<Pubkey>)]
pub struct AddDataAccount<'info> {
    #[account(
        mut,
        has_one = ship,
        realloc = {
            let new_size = ship_account.get_size() + 32 + 8;
            msg!("New ShipAccount size after reallocation: {}", new_size);
            new_size
        },
        realloc::payer = ship,
        realloc::zero = false,
    )]
    pub ship_account: Account<'info, ShipAccount>,
    #[account(
        init,
        payer = ship,
        space = ANCHOR_DISCRIMINATOR + PUBKEY_SIZE + 4 + FINGERPRINT_SIZE * 240, // 10080 minutes per week, 1440 minutes per day, 240 minutes per 4 hours
        seeds = [b"data_account", ship.key().as_ref(), ship_account.data_accounts.len().to_le_bytes().as_ref()],
        bump
    )]
    pub data_account: Account<'info, DataAccount>,
    #[account(
        init,
        payer = ship,
        space = {
            let new_size = ANCHOR_DISCRIMINATOR + 4 + 4 + 4 + external_observers_x25519_pks.len() * PUBKEY_SIZE + 4 + external_observers.len() * PUBKEY_SIZE + 4 + external_observers_keys.len() * 128;
            msg!("New ExternalObserversAccount size: {}", new_size);
            new_size
        },
        seeds = [b"external_observers_account", data_account.key().as_ref()],
        bump
    )]
    pub external_observers_account: Account<'info, ExternalObserversAccount>,
    #[account(mut)]
    pub ship: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddDataFingerprint<'info> {
    #[account(mut)]
    pub ship: Signer<'info>,
    #[account(mut, has_one = ship)]
    pub data_account: Account<'info, DataAccount>,
    /// CHECK: check account is this program
    #[account(mut, seeds = [b"fundraising"], bump)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_observer_x25519_pk: Pubkey)]
pub struct ExternalObserverRequest<'info> {
    #[account(
        mut,
        seeds = [b"external_observers_account", data_account.key().as_ref()],
        bump,
        realloc = external_observers_account.get_size() + PUBKEY_SIZE + PUBKEY_SIZE,
        realloc::payer = external_observer,
        realloc::zero = false
    )]
    pub external_observers_account: Account<'info, ExternalObserversAccount>,
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub external_observer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddExternalObserver<'info> {
    pub data_account: Account<'info, DataAccount>,
    #[account(
        mut,
        realloc = external_observers_account.get_size() + 128,
        realloc::payer = ship_management,
        realloc::zero = false
    )]
    pub external_observers_account: Account<'info, ExternalObserversAccount>,
    #[account(has_one = ship_management)]
    pub ship_account: Account<'info, ShipAccount>,
    #[account(mut)]
    pub ship_management: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReallocateDataAccount<'info> {
    #[account(mut, has_one = ship)]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub ship: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"fundraising"], bump)]
    pub fundraising_account: Account<'info, FundraisingAccount>,
    #[account(mut, associated_token::mint = token_mint, associated_token::authority = user)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum CustomErrors {
    ExternalObserverAlreadyRequested,
}
