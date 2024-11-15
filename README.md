# Pont Network Contracts

This repository contains the code for the Pont Network Program on the Solana blockchain. The program enables ship management and observer stations to track data emitted from ship sensors, verify its integrity, and control access to that data.

```bash
git clone https://github.com/Ceres-Blockchain-Solutions/pont-network-contracts.git
cd pont-network-contracts
anchor test
```

## Core instructions

1. **Initialize ship**

	Ship management must initialize a ship once.
	```rust
	pub fn initialize_ship(ctx: Context<InitializeShip>, ship: Pubkey)
	```
	
	<br/>

2. **Add Data Account**
   
 	 The ship initializes a new sailing.
	```rust
	pub fn add_data_account(
		ctx: Context<AddDataAccount>,
		external_observers: Vec<Pubkey>,
		external_observers_keys: Vec<[u8; 128]>,
		external_observers_x25519_pks: Vec<Pubkey>,
		timestamp: u64)
	```
	<br/>
 
3. **The ship management initializes a new sailing.**
   
   	Observer stations can request access to data.
	```rust
	pub fn external_observer_request(
		ctx: Context<ExternalObserverRequest>,
		external_observer_x25519_pk: Pubkey)
	```

	
	<br/>

4. **Add External Observer**
   
   	Ship management can approve access to the data.
	```rust
	pub fn add_external_observer(
		ctx: Context<AddExternalObserver>,
		external_observer_to_be_approved: Pubkey,
		external_observer_encrypted_master_key: [u8; 128])
	```
	
	
	<br/>

5. **Add Data Fingeprint**
   
	The ship can submit encrypted sensor data to the Solana blockchain.
	```rust
	pub fn add_data_fingerprint(
		ctx: Context<AddDataFingerprint>,
		ciphertext: Vec<u8>,
		tag: Vec<u8>,
		iv: Vec<u8>,
		ciphertext_timestamp: u64)
	```
	
	
