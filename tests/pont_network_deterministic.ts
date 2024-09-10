import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PontNetwork } from "../target/types/pont_network";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { blake3 } from 'hash-wasm'
import crypto from 'crypto';
import * as ecies25519 from 'ecies-25519';
import * as encUtils from 'enc-utils';
import { x25519 } from '@noble/curves/ed25519'

describe("pont_network_deterministic", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.AnchorProvider.env();
    const program = anchor.workspace.PontNetwork as Program<PontNetwork>;

    // Use fixed keypairs for deterministic tests
    const ship = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(1));
    const shipManagement = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(2));
    // external observers
    const eo1 = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(3));
    const eo2 = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(4));
    const eos = [eo1.publicKey, eo2.publicKey];

    // Use fixed master key for deterministic tests
    const masterKey = new Uint32Array(8).fill(5);
    const keyBytes = new Uint8Array(masterKey.buffer);

    const eo1_x25519pk = x25519.getPublicKey(eo1.secretKey.slice(0, 32));
    const eo2_x25519pk = x25519.getPublicKey(eo2.secretKey.slice(0, 32));

    async function airdropLamports(ship: PublicKey, amount: number) {
        const signature = await provider.connection.requestAirdrop(ship, amount);

		const latestBlockHash = await provider.connection.getLatestBlockhash();

		await provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: signature,
		})
    }

    it("Initializes a ShipAccount deterministically", async () => {
		const [shipAccount, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);

		// Airdrop lamports to the ship account
		await airdropLamports(ship.publicKey, 1000 * LAMPORTS_PER_SOL); // Airdrop 1000 SOL
		await airdropLamports(shipManagement.publicKey, 1000 * LAMPORTS_PER_SOL);

		const tx = await program.methods
			.initializeShip(ship.publicKey)
			.accountsStrict({
				shipAccount,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();

		console.log("ShipAccount initialized with transaction signature", tx);
	});

    it("Adds a Data Account deterministically", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);

		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount.toBuffer()],
			program.programId
		);

		// const externalObserversKeys = [new Uint8Array(32), new Uint8Array(32)].map(key => Array.from(key)); // Example keys

		const encryptedExternalObserversKeys = [
		  await ecies25519.encrypt(keyBytes, eo1_x25519pk),
		  await ecies25519.encrypt(keyBytes, eo2_x25519pk)
		];

		console.log("Encrypted External Observers Keys: ", encryptedExternalObserversKeys);

		const tx = await program.methods
			// .addDataAccount(eos, encryptedExternalObserversKeys.map(key => Array.from(key)))
			.addDataAccount([], [], [])
			.accountsStrict({
				shipAccount: shipAccountAddress,
				ship: ship.publicKey,
				systemProgram: SystemProgram.programId,
				dataAccount,
				externalObserversAccount,
			})
			.signers([ship])
			.rpc();

		console.log("Data Account added with transaction signature", tx);
	});

    const eo3 = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(6));
	const eo3_x25519pk = x25519.getPublicKey(eo3.secretKey.slice(0, 32));

	it("Requests to be an External Observer deterministically", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);

		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount.toBuffer()],
			program.programId
		);

		// Fund the external observer account
		const airdropSignature = await provider.connection.requestAirdrop(
			eo3.publicKey,
			anchor.web3.LAMPORTS_PER_SOL
		);

		const latestBlockHash = await provider.connection.getLatestBlockhash();

		await provider.connection.confirmTransaction({
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

    it("Approves an External Observer deterministically", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const [externalObserversAccount, bump3] = PublicKey.findProgramAddressSync(
			[Buffer.from("external_observers_account"), dataAccount.toBuffer()],
			program.programId
		);

		const accountPreTx = await program.account.externalObserversAccount.fetch(externalObserversAccount);
		console.log("Account Pre Tx: ", accountPreTx);
		const externalObserverIndex = accountPreTx.unapprovedExternalObservers.findIndex((pk: PublicKey) => pk.equals(eo3.publicKey));
		const eo_x25519_pk = accountPreTx.externalObserversX25519Pks[externalObserverIndex];

		const encryptedExternalObserverKey = await ecies25519.encrypt(keyBytes, eo_x25519_pk.toBytes())

		// Approve the external observer
		const tx = await program.methods
			.addExternalObserver(eo3.publicKey,  Array.from(encryptedExternalObserverKey))
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

		console.log("Fetching externalObserversAccount: ", externalObserversAccount);
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

	it("Adds Fingerprint data every 2 seconds for 16 seconds", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);
	
		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);
	
		const addFingerprint = async (data: Buffer, iv: Uint32Array) => {
			const encryptedData = encrypt(data, masterKey, iv);
			const serializedEncryptedData = serializeEncryptedData(encryptedData);
			const ciphertextBuffer = serializedEncryptedData.ciphertext;
			const tagBuffer = serializedEncryptedData.tag;
			const ivBuffer = serializedEncryptedData.iv;
			const dataTimestamp = Date.now();
	
			const tx = await program.methods
				.addDataFingerprint(ciphertextBuffer, tagBuffer, ivBuffer, new anchor.BN(dataTimestamp))
				.accountsStrict({
					dataAccount,
					ship: ship.publicKey,
				})
				.signers([ship])
				.rpc();
	
			console.log("Data Fingerprint added with transaction signature", tx);
		};
	
		// Define the object representing values from Ship sensors
		const sensorData = {
			temperature: 22.5,
			humidity: 60,
			pressure: 1013,
			latitude: 37.7749,
			longitude: -122.4194,
			timestamp: Date.now()
		};

		const data = Buffer.from(JSON.stringify(sensorData));
		const ivs = [
			new Uint32Array(3).fill(100),
			new Uint32Array(3).fill(101),
			new Uint32Array(3).fill(102),
			new Uint32Array(3).fill(103),
			new Uint32Array(3).fill(104),
			new Uint32Array(3).fill(105),
			new Uint32Array(3).fill(106),
			new Uint32Array(3).fill(107)
		];
	
		for (let i = 0; i < 8; i++) {
			await addFingerprint(data, ivs[i]);
			await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds
		}
	
		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(8);
	
		for (let i = 0; i < 8; i++) {
			const fingerprintBuffer = Buffer.from(account.fingerprints[i][0]);
			const fingerprintHex = fingerprintBuffer.toString('hex');
			console.log(`Data Fingerprint ${i + 1}: `, fingerprintHex);
		}
	});

	it("Adds Fingerprint data in batches every 2 seconds for 16 seconds", async () => {
		await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds

		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);
	
		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);
	
		const addFingerprints = async (data: Buffer[], ivs: Uint32Array[]) => {
			const ciphertextBuffers: Buffer[] = [];
			const tagBuffers: Buffer[] = [];
			const ivBuffers: Buffer[] = [];
			const dataTimestamps: anchor.BN[] = [];

			for (let i = 0; i < data.length; i++) {
				const encryptedData = encrypt(data[i], masterKey, ivs[i]);
				const serializedEncryptedData = serializeEncryptedData(encryptedData);
				ciphertextBuffers.push(serializedEncryptedData.ciphertext);
				tagBuffers.push(serializedEncryptedData.tag);
				ivBuffers.push(serializedEncryptedData.iv);
				dataTimestamps.push(new anchor.BN(Date.now()));
			}
	
			const tx = await program.methods
				.addMultipleDataFingerprints(ciphertextBuffers, tagBuffers, ivBuffers, dataTimestamps)
				.accountsStrict({
					dataAccount,
					ship: ship.publicKey,
				})
				.signers([ship])
				.rpc();
	
			console.log("Data Multiple Fingerprints added with transaction signature", tx);
		};
	
		// Define the object representing values from Ship sensors
		const sensorData = {
			temperature: 22.5,
			humidity: 60,
			pressure: 1013,
			latitude: 37.7749,
			longitude: -122.4194,
			timestamp: Date.now()
		};

		const data = [Buffer.from(JSON.stringify(sensorData)), Buffer.from(JSON.stringify(sensorData)), Buffer.from(JSON.stringify(sensorData))];
		const ivs = [];
		for (let i = 108; i < 108 + 24; i++) {
			ivs.push(new Uint32Array(3).fill(i));
		}

		const groupedIvs = [];
		for (let i = 0; i < ivs.length; i += 3) {
			groupedIvs.push(ivs.slice(i, i + 3));
		}
	
		for (let i = 0; i < 8; i++) {
			await addFingerprints(data, groupedIvs[i]);
			await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds
		}
	
		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(8);
	
		for (let i = 0; i < 8; i++) {
			const fingerprintBuffer = Buffer.from(account.fingerprints[i][0]);
			const fingerprintHex = fingerprintBuffer.toString('hex');
			console.log(`Data Fingerprint ${i + 1}: `, fingerprintHex);
		}
	});

    it("Adds a Data Fingerprint deterministically", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

        console.log("DataAccount:", dataAccount);

		const dataMock = { data1: "test data1", data2: "test data2", data3: "test data3", data4: "test data4", data5: "test data5" };
		const data = Buffer.from("test data");
		const iv = new Uint32Array(3).fill(0);

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
		// console.log("Data Fingerprint: ", dataFingerprint);
		// const uint8Array = Uint8Array.from(Buffer.from(dataFingerprint, "hex"));
		// const numberArray = Array.from(uint8Array);
		const dataTimestamp = Date.now();

		const tx = await program.methods
			.addDataFingerprint(ciphertextBuffer, tagBuffer, ivBuffer, new anchor.BN(dataTimestamp))
			.accountsStrict({
				dataAccount,
				ship: ship.publicKey,
			})
			.signers([ship])
			.rpc();

		console.log("Data Fingerprint added with transaction signature", tx);

		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(1);

		// Convert byte array (number[]) to Buffer
		const fingerprintBuffer = Buffer.from(account.fingerprints[0][0]);

		// Convert Buffer to hex string
		const fingerprintHex = fingerprintBuffer.toString('hex');
		console.log("Data Fingerprint: ", fingerprintHex);

		expect(fingerprintHex).to.equal(encryptedDataFingerprint);
	});

    it("Adds Multiple Data Fingerprints deterministically", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

		const data = [Buffer.from("test data 1"), Buffer.from("test data 2"), Buffer.from("test data 3")];
		
		const ivs = [new Uint32Array(3).fill(1), new Uint32Array(3).fill(2), new Uint32Array(3).fill(3)];

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

		// const dataFingerprintsPromises = data.map(async (d) => await blake3(d));
		// const dataFingerprints = await Promise.all(dataFingerprintsPromises);

		// const uint8Arrays = dataFingerprints.map(fingerprint => Uint8Array.from(Buffer.from(fingerprint, "hex")));
		// const numberArrays = uint8Arrays.map(uint8Array => Array.from(uint8Array));
		const dataTimestamps = [Date.now(), Date.now() + 1000, Date.now() + 2000];

		const tx = await program.methods
			.addMultipleDataFingerprints(ciphertextBuffers, tagBuffers, ivBuffers, dataTimestamps.map(ts => new anchor.BN(ts)))
			.accountsStrict({
				dataAccount,
				ship: ship.publicKey,
			})
			.signers([ship])
			.rpc();

		console.log("Data Fingerprint added with transaction signature", tx);

		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(4);
		expect(Buffer.from(account.fingerprints[1][0]).toString('hex')).to.equal(encryptedDataFingerprint[0]);
		expect(Buffer.from(account.fingerprints[2][0]).toString('hex')).to.equal(encryptedDataFingerprint[1]);
		expect(Buffer.from(account.fingerprints[3][0]).toString('hex')).to.equal(encryptedDataFingerprint[2]);
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
    
        return {
            ciphertext: ciphertextBytes,
            tag: tagBytes,
            iv: Buffer.from(ivBytes)
        }
    }
});