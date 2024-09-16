import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PontNetwork } from "../target/types/pont_network";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { expect } from "chai";
import { blake3 } from 'hash-wasm'
import crypto from 'crypto';
import * as ecies25519 from 'ecies-25519';
import * as encUtils from 'enc-utils';
import { x25519 } from '@noble/curves/ed25519'

describe("pont_network", () => {
	const ship1 = anchor.web3.Keypair.generate();

	// Configure the client to use the local cluster.
	const conn = new Connection("http://127.0.0.1:8899", { commitment: "confirmed" });
	const provider = new AnchorProvider(conn, new Wallet(ship1), { preflightCommitment: "confirmed", commitment: "confirmed" });
	anchor.setProvider(provider);

	console.log("Provider: ", anchor.getProvider());
	// cosnt program = new Program
	const program = anchor.workspace.PontNetwork as Program<PontNetwork>;
	
	const ship2 = anchor.web3.Keypair.generate();
	const ship3 = anchor.web3.Keypair.generate();
	const ship4 = anchor.web3.Keypair.generate();

	const shipManagement = anchor.web3.Keypair.generate();
	// external observers
	const eo1 = anchor.web3.Keypair.generate();
	const eo2 = anchor.web3.Keypair.generate();
	const eos = [eo1.publicKey, eo2.publicKey];

	const masterKey = new Uint8Array(32);
	crypto.getRandomValues(masterKey);
	const keyBytes = new Uint8Array(masterKey.buffer);

	const eo1_x25519pk = x25519.getPublicKey(eo1.secretKey.slice(0, 32));
	const eo2_x25519pk = x25519.getPublicKey(eo2.secretKey.slice(0, 32));

	async function airdropLamports(ship: PublicKey, amount: number) {
		const signature = await program.provider.connection.requestAirdrop(ship, amount);

		const latestBlockHash = await program.provider.connection.getLatestBlockhash();

		await program.provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: signature,
		})
	}

	it("Initializes a ShipAccounts", async () => {
		const [shipAccount1, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount2, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship2.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount3, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship3.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount4, bump4] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship4.publicKey.toBuffer()],
			program.programId
		);

		// Airdrop lamports to the ship account
		await airdropLamports(ship1.publicKey, 1000 * LAMPORTS_PER_SOL); // Airdrop 1000 SOL
		await airdropLamports(ship2.publicKey, 1000 * LAMPORTS_PER_SOL);
		await airdropLamports(ship3.publicKey, 1000 * LAMPORTS_PER_SOL);
		await airdropLamports(ship4.publicKey, 1000 * LAMPORTS_PER_SOL);
		await airdropLamports(shipManagement.publicKey, 1000 * LAMPORTS_PER_SOL);

		const tx1 = await program.methods
			.initializeShip(ship1.publicKey)
			.accountsStrict({
				shipAccount: shipAccount1,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();

		const tx2 = await program.methods
			.initializeShip(ship2.publicKey)
			.accountsStrict({
				shipAccount: shipAccount2,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();


		const tx3 = await program.methods
			.initializeShip(ship3.publicKey)
			.accountsStrict({
				shipAccount: shipAccount3,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();


		const tx4 = await program.methods
			.initializeShip(ship4.publicKey)
			.accountsStrict({
				shipAccount: shipAccount4,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();
	});

	it("Adds a Data Account", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);

		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount1, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount1, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount1.toBuffer()],
			program.programId
		);

		// const externalObserversKeys = [new Uint8Array(32), new Uint8Array(32)].map(key => Array.from(key)); // Example keys

		const encryptedExternalObserversKeys = [
			await ecies25519.encrypt(keyBytes, eo1_x25519pk),
			await ecies25519.encrypt(keyBytes, eo2_x25519pk)
		];

		console.log("Encrypted External Observers Keys: ", encryptedExternalObserversKeys);

		const tx1 = await program.methods
			// .addDataAccount(eos, encryptedExternalObserversKeys.map(key => Array.from(key)))
			.addDataAccount([], [], [])
			.accountsStrict({
				shipAccount: shipAccountAddress,
				ship: ship1.publicKey,
				systemProgram: SystemProgram.programId,
				dataAccount: dataAccount1,
				externalObserversAccount: externalObserversAccount1,
			})
			.signers([ship1])
			.rpc();

			const [dataAccount2, bump4] = PublicKey.findProgramAddressSync(
				[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length + 1, "le").toArrayLike(Buffer, "le", 8)],
				program.programId
			);
	
			const [externalObserversAccount2, bump5] = PublicKey.findProgramAddressSync(
				[Buffer.from("external_observers_account"), dataAccount2.toBuffer()],
				program.programId
			);
		
		const tx2 = await program.methods
			// .addDataAccount(eos, encryptedExternalObserversKeys.map(key => Array.from(key)))
			.addDataAccount([], [], [])
			.accountsStrict({
				shipAccount: shipAccountAddress,
				ship: ship1.publicKey,
				systemProgram: SystemProgram.programId,
				dataAccount: dataAccount2,
				externalObserversAccount: externalObserversAccount2,
			})
			.signers([ship1])
			.rpc();
	});

	const eo3 = anchor.web3.Keypair.generate();
	const eo3_x25519pk = x25519.getPublicKey(eo3.secretKey.slice(0, 32));

	it("Requests to be an External Observer", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);

		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount.toBuffer()],
			program.programId
		);

		// Fund the external observer account
		const airdropSignature = await program.provider.connection.requestAirdrop(
			eo3.publicKey,
			anchor.web3.LAMPORTS_PER_SOL
		);

		const latestBlockHash = await program.provider.connection.getLatestBlockhash();

		await program.provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: airdropSignature,
		})

		const tx = await program.methods
			.externalObserverRequest(new PublicKey(eo3_x25519pk))
			.accountsStrict({
				dataAccount,
				externalObserversAccount,
				externalObserver: eo3.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([eo3])
			.rpc();

		console.log("External Observer requested with transaction signature", tx);

		const account = await program.account.externalObserversAccount.fetch(externalObserversAccount);

		// Convert PublicKey objects to strings for comparison
		const unapprovedExternalObservers = account.unapprovedExternalObservers.map((pk: PublicKey) => pk.toString());
		const externalObserverPublicKey = eo3.publicKey.toString();

		expect(unapprovedExternalObservers).to.include(externalObserverPublicKey);
	});

	it("Approves an External Observer", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount.toBuffer()],
			program.programId
		);

		const accountPreTx = await program.account.externalObserversAccount.fetch(externalObserversAccount);
		const externalObserverIndex = accountPreTx.unapprovedExternalObservers.findIndex((pk: PublicKey) => pk.equals(eo3.publicKey));
		const eo_x25519_pk = accountPreTx.externalObserversX25519Pks[externalObserverIndex];

		const encryptedExternalObserverKey = await ecies25519.encrypt(keyBytes, eo_x25519_pk.toBytes())

		// Approve the external observer
		const tx = await program.methods
			.addExternalObserver(eo3.publicKey, Array.from(encryptedExternalObserverKey))
			.accountsStrict({
				externalObserversAccount,
				dataAccount,
				shipAccount: shipAccountAddress,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			}).
			signers([shipManagement])
			.rpc();

		console.log("External Observer approved with transaction signature", tx);

		const account = await program.account.externalObserversAccount.fetch(externalObserversAccount);

		// Convert PublicKey objects to strings for comparison
		const unapprovedExternalObservers = account.unapprovedExternalObservers.map((pk: PublicKey) => pk.toString());
		const externalObservers = account.externalObservers.map((pk: PublicKey) => pk.toString());
		const externalObserverPublicKey = eo3.publicKey.toString();
		const externalObserversEncryptedKeys = account.externalObserversMasterKeys.map((key: number[]) => Uint8Array.from(key));

		expect(unapprovedExternalObservers).to.not.include(externalObserverPublicKey);
		expect(externalObservers).to.include(externalObserverPublicKey);

		// Decrypt the external observer key
		const decryptedExternalObserverKey = await ecies25519.decrypt(externalObserversEncryptedKeys[0], eo3.secretKey.slice(0, 32));
		const decryptedExternalObserverKeyBuffer = Buffer.from(decryptedExternalObserverKey);
		expect(decryptedExternalObserverKeyBuffer).to.deep.equal(keyBytes);
	});

	it("Adds a Data Fingerprint", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const dataMock = { data1: "test data1", data2: "test data2", data3: "test data3", data4: "test data4", data5: "test data5" };
		const data = Buffer.from("test data");
		const iv = new Uint32Array(3);
		crypto.getRandomValues(iv);

		const encryptedData = encrypt(data, masterKey, iv);
		const ciphertext = encryptedData.ciphertext;
		const tag = encryptedData.tag;
		console.log("Encrypted Data: ", encryptedData);

		const serializedEncryptedData = serializeEncryptedData(encryptedData);
		const ciphertextBuffer = serializedEncryptedData.ciphertext;
		const tagBuffer = serializedEncryptedData.tag;
		const ivBuffer = serializedEncryptedData.iv;
		console.log("\nSerialized Encrypted Data: ", serializedEncryptedData);

		const dataFingerprint = await blake3(data);
		const encryptedDataFingerprint = await blake3(ciphertextBuffer);
		const dataTimestamp = Date.now();

		const tx = await program.methods
			.addDataFingerprint(ciphertextBuffer, tagBuffer, ivBuffer, new anchor.BN(dataTimestamp))
			.accountsStrict({
				dataAccount,
				ship: ship1.publicKey,
			})
			.signers([ship1])
			.rpc();

		console.log("Data Fingerprint added with transaction signature", tx);

		const txDetails = await program.provider.connection.getTransaction(tx, {
			maxSupportedTransactionVersion: 0,
			commitment: "confirmed",
		});

		console.log("Transaction Details: ", txDetails);

		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(1);

		// Convert byte array (number[]) to Buffer
		const fingerprintBuffer = Buffer.from(account.fingerprints[0][0]);

		// Convert Buffer to hex string
		const fingerprintHex = fingerprintBuffer.toString('hex');
		console.log("Data Fingerprint: ", fingerprintHex);

		expect(fingerprintHex).to.equal(encryptedDataFingerprint);
	});

	it("Adds Multiple Data Fingerprints", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const data = [Buffer.from("test data 1"), Buffer.from("test data 2"), Buffer.from("test data 3")];

		const ivs = [new Uint32Array(3), new Uint32Array(3), new Uint32Array(3)];
		crypto.getRandomValues(ivs[0]);
		crypto.getRandomValues(ivs[1]);
		crypto.getRandomValues(ivs[2]);

		const encryptedData = [encrypt(data[0], masterKey, ivs[0]), encrypt(data[1], masterKey, ivs[1]), encrypt(data[2], masterKey, ivs[2])];
		const ciphertexts = [encryptedData[0].ciphertext, encryptedData[1].ciphertext, encryptedData[2].ciphertext];
		const tags = [encryptedData[0].tag, encryptedData[1].tag, encryptedData[2].tag];
		console.log("Encrypted Data: ", encryptedData);

		const serializedEncryptedData = [serializeEncryptedData(encryptedData[0]), serializeEncryptedData(encryptedData[1]), serializeEncryptedData(encryptedData[2])];
		const ciphertextBuffers = [serializedEncryptedData[0].ciphertext, serializedEncryptedData[1].ciphertext, serializedEncryptedData[2].ciphertext];
		const tagBuffers = [serializedEncryptedData[0].tag, serializedEncryptedData[1].tag, serializedEncryptedData[2].tag];
		const ivBuffers = [serializedEncryptedData[0].iv, serializedEncryptedData[1].iv, serializedEncryptedData[2].iv];
		console.log("\nSerialized Encrypted Data: ", serializedEncryptedData);

		// const dataFingerprints = await blake3(data);
		const encryptedDataFingerprint = [await blake3(ciphertextBuffers[0]), await blake3(ciphertextBuffers[1]), await blake3(ciphertextBuffers[2])];

		const dataTimestamps = [Date.now(), Date.now() + 1000, Date.now() + 2000];

		const tx = await program.methods
			.addMultipleDataFingerprints(ciphertextBuffers, tagBuffers, ivBuffers, dataTimestamps.map(ts => new anchor.BN(ts)))
			.accountsStrict({
				dataAccount,
				ship: ship1.publicKey,
			})
			.signers([ship1])
			.rpc();

		console.log("Data Fingerprint added with transaction signature", tx);

		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(4);
		expect(Buffer.from(account.fingerprints[1][0]).toString('hex')).to.equal(encryptedDataFingerprint[0]);
		expect(Buffer.from(account.fingerprints[2][0]).toString('hex')).to.equal(encryptedDataFingerprint[1]);
		expect(Buffer.from(account.fingerprints[3][0]).toString('hex')).to.equal(encryptedDataFingerprint[2]);
	});
});

// Encrypt data
const encrypt = (plaintext, key, iv) => {
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
	ciphertext += cipher.final('hex');
	const tag = cipher.getAuthTag().toString('hex'); // Get the authentication tag
	return {
		ciphertext,
		tag,
		iv
		// iv: iv.toString('hex')
	};
};

// Decrypt data
const decrypt = (ciphertext, tag, iv, key) => {
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
	decipher.setAuthTag(Buffer.from(tag, 'hex')); // Set the authentication tag
	let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
};

function serializeEncryptedData(encryptedData: { ciphertext: string; tag: string; iv: Uint32Array }): {
	ciphertext: Buffer,
	tag: Buffer,
	iv: Buffer
} {
	const ciphertextBytes = Buffer.from(encryptedData.ciphertext, 'hex');
	const tagBytes = Buffer.from(encryptedData.tag, 'hex');
	const ivBytes = encryptedData.iv.buffer;

	// const totalLength = ciphertextBytes.length + tagBytes.length + ivBytes.length;
	// const serializedData = new Uint8Array(totalLength);

	// serializedData.set(ciphertextBytes, 0);
	// serializedData.set(tagBytes, ciphertextBytes.length);
	// serializedData.set(ivBytes, ciphertextBytes.length + tagBytes.length);

	// return serializedData;
	return {
		ciphertext: ciphertextBytes,
		tag: tagBytes,
		iv: Buffer.from(ivBytes)
	}
}