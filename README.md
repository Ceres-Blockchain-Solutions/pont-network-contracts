# Pont Network Contracts

This repository contains code for Pont Network Program on Solana blockchain. Program enables owners of ship management and observer stations to track data emitting from ships sensors, check their integrity and control access to that data.

```bash
git clone https://github.com/Ceres-Blockchain-Solutions/pont-network-contracts.git
cd pont-network-contracts
anchor test
```

## Core instructions

```rust
pub fn initialize_ship(ctx: Context<InitializeShip>, ship: Pubkey)
```

Ship management needs to initialize ship once.

---

```rust
pub fn add_data_account(
	ctx: Context<AddDataAccount>,
	external_observers: Vec<Pubkey>,
	external_observers_keys: Vec<[u8; 128]>,
	external_observers_x25519_pks: Vec<Pubkey>,
	timestamp: u64,
	)
```

Ship initializes new sailing.

---

```rust
pub fn external_observer_request(
	ctx: Context<ExternalObserverRequest>,
	external_observer_x25519_pk: Pubkey,
	)
```

Observer stations can request access to data.

---

```rust
pub fn add_external_observer(
	ctx: Context<AddExternalObserver>,
	external_observer_to_be_approved: Pubkey,
	external_observer_encrypted_master_key: [u8; 128],
	)
```

Ship management can approve access to data.

---

```rust
pub fn add_data_fingerprint(
	ctx: Context<AddDataFingerprint>,
	ciphertext: Vec<u8>,
	tag: Vec<u8>,
	iv: Vec<u8>,
	ciphertext_timestamp: u64,
	)
```

Ship can submit encrypted sensor data to Solana blockchain.
