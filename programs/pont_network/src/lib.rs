use itertools::izip;
use std::vec;

use anchor_lang::prelude::*;

const ANCHOR_DISCRIMINATOR: usize = 8;
const PUBKEY_SIZE: usize = 32;
const FINGERPRINT_SIZE: usize = 32;

declare_id!("3dnBfuMPHW52smosEsJwsnLGCR56DrphyUG68GqAcVxb");

#[program]
pub mod pont_network {
    use anchor_lang::solana_program::blake3::hash;

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
        external_observers_keys: Vec<[u8; 32]>,
    ) -> Result<()> {
        assert_eq!(external_observers.len(), external_observers_keys.len());

        let ship_account = &mut ctx.accounts.ship_account;
        ship_account
            .data_accounts
            .push(ctx.accounts.data_account.key());

        let data_account = &mut ctx.accounts.data_account;
        data_account.ship = *ctx.accounts.ship.key;
        data_account.fingerprints = Vec::new();

        let external_observers_account = &mut ctx.accounts.external_observers_account;
        external_observers_account.unapproved_external_observers = Vec::new();
        external_observers_account.external_observers_keys = external_observers_keys.clone();
        external_observers_account.external_observers = external_observers.clone();

        emit!(DataAccountInitialized {
            ship: *ctx.accounts.ship.key,
            data_acc_count: ship_account.data_accounts.len() as u32,
            external_observers: external_observers,
            external_observers_keys: external_observers_keys,
        });

        Ok(())
    }

    pub fn external_observer_request(ctx: Context<ExternalObserverRequest>) -> Result<()> {
        let external_observers_account = &mut ctx.accounts.external_observers_account;
        let external_observer = *ctx.accounts.external_observer.key;

        external_observers_account
            .unapproved_external_observers
            .push(external_observer);

        emit!(ExternalObserverRequested {
            data_account: ctx.accounts.data_account.key(),
            external_observer: external_observer,
        });

        Ok(())
    }

    pub fn add_external_observer(
        ctx: Context<AddExternalObserver>,
        external_observer_to_be_approved: Pubkey,
    ) -> Result<()> {
        let external_observers_account = &mut ctx.accounts.external_observers_account;

        external_observers_account
            .unapproved_external_observers
            .retain(|&x| x != external_observer_to_be_approved);
        external_observers_account
            .external_observers
            .push(external_observer_to_be_approved);

        Ok(())
    }

    pub fn add_data_fingerprint(
        ctx: Context<AddDataFingerprint>,
        ciphertext: Vec<u8>,
        tag: Vec<u8>,
        iv: Vec<u8>,
        ciphertext_timestamp: u64,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;

        let fingerprint = Fingerprint::from(hash(&ciphertext).to_bytes());

        data_account.fingerprints.push(fingerprint.clone());

        emit!(DataFingerprintAdded {
            ship: *ctx.accounts.ship.key,
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
}

pub fn ensure_sufficient_lamports(account: &AccountInfo, required_lamports: u64) -> Result<()> {
    let current_lamports = account.lamports();
    if current_lamports < required_lamports {
        return Err(ProgramError::InsufficientFunds.into());
    }
    Ok(())
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
    pub data_acc_count: u32,
    pub external_observers: Vec<Pubkey>,
    pub external_observers_keys: Vec<[u8; 32]>,
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

#[account]
pub struct ShipAccount {
    pub ship: Pubkey,
    pub ship_management: Pubkey,
    pub data_accounts: Vec<Pubkey>,
}

impl ShipAccount {
    pub fn get_size(&self) -> usize {
        let size = 8 + PUBKEY_SIZE + PUBKEY_SIZE + 4 + (self.data_accounts.len() * 32);
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
    pub external_observers: Vec<Pubkey>,
    pub external_observers_keys: Vec<[u8; 32]>,
}

impl ExternalObserversAccount {
    pub fn get_size(&self) -> usize {
        let size = 8
            + 4
            + (self.unapproved_external_observers.len() * PUBKEY_SIZE)
            + 4
            + (self.external_observers.len() * PUBKEY_SIZE)
            + 4
            + (self.external_observers_keys.len() * 32);
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
        space = 8 + PUBKEY_SIZE + PUBKEY_SIZE + 4,
        seeds = [b"ship_account", ship.key().as_ref()],
        bump
    )]
    pub ship_account: Account<'info, ShipAccount>,
    #[account(mut)]
    pub ship_management: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_observers: Vec<Pubkey>, external_observers_keys: Vec<[u8; 32]>,)]
pub struct AddDataAccount<'info> {
    #[account(
        mut,
        has_one = ship,
        realloc = {
            let new_size = ship_account.get_size() + 32;
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
            let new_size = ANCHOR_DISCRIMINATOR + 4 + 4 + external_observers.len() * PUBKEY_SIZE + 4 + external_observers_keys.len() * 32;
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
    #[account(mut, has_one = ship)]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub ship: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExternalObserverRequest<'info> {
    #[account(
        mut,
        seeds = [b"external_observers_account", data_account.key().as_ref()],
        bump,
        realloc = external_observers_account.get_size() + PUBKEY_SIZE,
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
    #[account(mut)]
    pub external_observers_account: Account<'info, ExternalObserversAccount>,
    #[account(has_one = ship_management)]
    pub ship_account: Account<'info, ShipAccount>,
    pub ship_management: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReallocateDataAccount<'info> {
    #[account(mut, has_one = ship)]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub ship: Signer<'info>,
    pub system_program: Program<'info, System>,
}
