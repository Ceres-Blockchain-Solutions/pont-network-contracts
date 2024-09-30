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
	const ship4 = anchor.web3.Keypair.fromSeed(new Uint8Array(32).fill(99));

	const shipManagement = anchor.web3.Keypair.fromSeed(new Uint8Array(32));
	console.log("Ship Management secret key: ", shipManagement.secretKey);

	// external observers
	const eo1 = anchor.web3.Keypair.generate();
	const eo2 = anchor.web3.Keypair.generate();
    const eo3 = anchor.web3.Keypair.generate();

	const masterKey = new Uint8Array(32);
	// crypto.getRandomValues(masterKey);
	const keyBytes = new Uint8Array(masterKey.buffer);

	const eo1_x25519pk = x25519.getPublicKey(eo1.secretKey.slice(0, 32));
	const eo2_x25519pk = x25519.getPublicKey(eo2.secretKey.slice(0, 32));
    const eo3_x25519pk = x25519.getPublicKey(eo3.secretKey.slice(0, 32));

	async function airdropLamports(ship: PublicKey, amount: number) {
		const signature = await program.provider.connection.requestAirdrop(ship, amount);

		const latestBlockHash = await program.provider.connection.getLatestBlockhash();

		await program.provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: signature,
		})
	}
    
	before(async () => {
        // Airdrop lamports to the ship account
        await airdropLamports(ship1.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(ship2.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(ship3.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(ship4.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(eo1.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(eo2.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(eo3.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(shipManagement.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(new PublicKey("TN9afBn533hvXpQ1s5uexBUksR7yMUMjcfgLLc1QKrz"), 1000 * LAMPORTS_PER_SOL);
	});

	it("Initializes a ShipAccounts", async () => {
		const [shipAccount1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount2] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship2.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount3] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship3.publicKey.toBuffer()],
			program.programId
		);

		const [shipAccount4] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship4.publicKey.toBuffer()],
			program.programId
		);

		const tx1 = await program.methods
			.initializeShip(ship1.publicKey)
			.accountsStrict({
				shipAccount: shipAccount1,
				shipManagement: shipManagement.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([shipManagement])
			.rpc();

		console.log("SHIP ACCOUNT 1: ", ship1.publicKey.toBase58());

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

	it("Adds a Data Account to each ship", async () => {
        // Ship 1
        const [shipAccountAddress1] = PublicKey.findProgramAddressSync(
            [Buffer.from("ship_account"), ship1.publicKey.toBuffer()],
            program.programId
        );
    
        const shipAccount1 = await program.account.shipAccount.fetch(shipAccountAddress1);
    
        const [dataAccount1] = PublicKey.findProgramAddressSync(
            [Buffer.from("data_account"), ship1.publicKey.toBuffer(), new anchor.BN(shipAccount1.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
            program.programId
        );
    
        const [externalObserversAccount1] = PublicKey.findProgramAddressSync(
            [Buffer.from("external_observers_account"), dataAccount1.toBuffer()],
            program.programId
        );
    
        const tx1 = await program.methods
			.addDataAccount([], [], [], new anchor.BN(1577836800000)) // 01/01/2020
            .accountsStrict({
                shipAccount: shipAccountAddress1,
                ship: ship1.publicKey,
                systemProgram: SystemProgram.programId,
                dataAccount: dataAccount1,
                externalObserversAccount: externalObserversAccount1,
            })
            .signers([ship1])
            .rpc();
    
        // Ship 2
        const [shipAccountAddress2] = PublicKey.findProgramAddressSync(
            [Buffer.from("ship_account"), ship2.publicKey.toBuffer()],
            program.programId
        );
    
        const shipAccount2 = await program.account.shipAccount.fetch(shipAccountAddress2);
    
        const [dataAccount2] = PublicKey.findProgramAddressSync(
            [Buffer.from("data_account"), ship2.publicKey.toBuffer(), new anchor.BN(shipAccount2.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
            program.programId
        );
    
        const [externalObserversAccount2] = PublicKey.findProgramAddressSync(
            [Buffer.from("external_observers_account"), dataAccount2.toBuffer()],
            program.programId
        );
    
        const tx2 = await program.methods
            .addDataAccount([], [], [], new anchor.BN(1609459200000)) // 01/01/2021
            .accountsStrict({
                shipAccount: shipAccountAddress2,
                ship: ship2.publicKey,
                systemProgram: SystemProgram.programId,
                dataAccount: dataAccount2,
                externalObserversAccount: externalObserversAccount2,
            })
            .signers([ship2])
            .rpc();
    
        // Ship 3
        const [shipAccountAddress3] = PublicKey.findProgramAddressSync(
            [Buffer.from("ship_account"), ship3.publicKey.toBuffer()],
            program.programId
        );
    
        const shipAccount3 = await program.account.shipAccount.fetch(shipAccountAddress3);
    
        const [dataAccount3] = PublicKey.findProgramAddressSync(
            [Buffer.from("data_account"), ship3.publicKey.toBuffer(), new anchor.BN(shipAccount3.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
            program.programId
        );
    
        const [externalObserversAccount3] = PublicKey.findProgramAddressSync(
            [Buffer.from("external_observers_account"), dataAccount3.toBuffer()],
            program.programId
        );
    
        const tx3 = await program.methods
            .addDataAccount([], [], [], new anchor.BN(1640995200000)) // 01/01/2022
            .accountsStrict({
                shipAccount: shipAccountAddress3,
                ship: ship3.publicKey,
                systemProgram: SystemProgram.programId,
                dataAccount: dataAccount3,
                externalObserversAccount: externalObserversAccount3,
            })
            .signers([ship3])
            .rpc();
    
        // Ship 4 first data account
        const [shipAccountAddress4] = PublicKey.findProgramAddressSync(
            [Buffer.from("ship_account"), ship4.publicKey.toBuffer()],
            program.programId
        );
    
        const shipAccount4 = await program.account.shipAccount.fetch(shipAccountAddress4);
    
        const [dataAccount4] = PublicKey.findProgramAddressSync(
            [Buffer.from("data_account"), ship4.publicKey.toBuffer(), new anchor.BN(shipAccount4.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
            program.programId
        );
    
        const [externalObserversAccount4] = PublicKey.findProgramAddressSync(
            [Buffer.from("external_observers_account"), dataAccount4.toBuffer()],
            program.programId
        );
    
        const tx4 = await program.methods
            .addDataAccount([], [], [], new anchor.BN(1672531200000)) // 01/01/2023
            .accountsStrict({
                shipAccount: shipAccountAddress4,
                ship: ship4.publicKey,
                systemProgram: SystemProgram.programId,
                dataAccount: dataAccount4,
                externalObserversAccount: externalObserversAccount4,
            })
            .signers([ship4])
            .rpc();

		// Ship 4 second data account
        const shipAccount4_2 = await program.account.shipAccount.fetch(shipAccountAddress4);
    
        const [dataAccount4_2] = PublicKey.findProgramAddressSync(
            [Buffer.from("data_account"), ship4.publicKey.toBuffer(), new anchor.BN(shipAccount4_2.dataAccounts.length, "le").toArrayLike(Buffer, "le", 8)],
            program.programId
        );
    
        const [externalObserversAccount4_2] = PublicKey.findProgramAddressSync(
            [Buffer.from("external_observers_account"), dataAccount4_2.toBuffer()],
            program.programId
        );
    
        const tx5 = await program.methods
            .addDataAccount([], [], [], new anchor.BN(Date.now()))
            .accountsStrict({
                shipAccount: shipAccountAddress4,
                ship: ship4.publicKey,
                systemProgram: SystemProgram.programId,
                dataAccount: dataAccount4_2,
                externalObserversAccount: externalObserversAccount4_2,
            })
            .signers([ship4])
            .rpc();
    });

	const sensorData = {
		"lat": -4.96579,
		"long": -1.72182,
		"mileage": 0.25,
		"engineLoad": 79.81,
		"fuelLevel": 99.89,
		"seaState": "high",
		"seaSurfaceTemperature": 11.7,
		"airTemp": 25.6,
		"humidity": 58.22,
		"barometricPressure": 999.71,
		"cargoStatus": "INTRANSIT",
		"time": 1725629220025
	};
	const sensorDataJson = JSON.stringify(sensorData);
	const sensorDataBuffer = Buffer.from(sensorDataJson);

	it("Populate Data Fingerprints for first Data Account", async () => {
		const [shipAccountAddress] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship4.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);
	
		const [dataAccount] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship4.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 2, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);
	
		for (let i = 0; i < 10; i++) {
			const ivUint32Array = new Uint32Array(3);
			crypto.getRandomValues(ivUint32Array);
	
			const sensorData = getRandomSensorData();
            const sensorDataJson = JSON.stringify(sensorData);
            const sensorDataBuffer = Buffer.from(sensorDataJson);

			const encryptedData = encrypt(sensorDataBuffer, masterKey, ivUint32Array);
			const { ciphertext, tag, iv } = serializeEncryptedData(encryptedData);
	
			const encryptedDataFingerprint = await blake3(ciphertext);
			const dataTimestamp = Date.now();
	
			const tx = await program.methods
				.addDataFingerprint(ciphertext, tag, iv, new anchor.BN(dataTimestamp))
				.accountsStrict({
					dataAccount,
					ship: ship4.publicKey,
				})
				.signers([ship4])
				.rpc();
	
			console.log(`Data Fingerprint ${i + 1} added with transaction signature`, tx);
	
			const txDetails = await program.provider.connection.getTransaction(tx, {
				maxSupportedTransactionVersion: 0,
				commitment: "confirmed",
			});
	
			console.log(`Transaction ${i + 1} Details: `, txDetails);
		}
	
		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(10);
	
		// for (let i = 0; i < 10; i++) {
		// 	// Convert byte array (number[]) to Buffer
		// 	const fingerprintBuffer = Buffer.from(account.fingerprints[i][0]);
	
		// 	// Convert Buffer to hex string
		// 	const fingerprintHex = fingerprintBuffer.toString('hex');
		// 	console.log(`Data Fingerprint ${i + 1}: `, fingerprintHex);

		// 	const encryptedDataFingerprint = await blake3(ciphertext);
		// 	expect(fingerprintHex).to.equal(encryptedDataFingerprint);
		// }
	});

	it("Adds a Data Fingerprint each 2 seconds for 60 seconds", async () => {
		// await new Promise(resolve => setTimeout(resolve, 15000));
		const [shipAccountAddress] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship4.publicKey.toBuffer()],
			program.programId
		);
		const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);

		const [dataAccount] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship4.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		);

        let counter = 1;
		console.log("Counter: ", counter);
        const intervalId = setInterval(async () => {
            if (counter >= 200) {
                clearInterval(intervalId);
                return;
            }
            const sensorData = getRandomSensorData();
            const sensorDataJson = JSON.stringify(sensorData);
            const sensorDataBuffer = Buffer.from(sensorDataJson);
    
            const ivUint32Array = new Uint32Array(3);
            crypto.getRandomValues(ivUint32Array);
    
            const encryptedData = encrypt(sensorDataBuffer, masterKey, ivUint32Array);
            const { ciphertext, tag, iv } = serializeEncryptedData(encryptedData);
    
            const encryptedDataFingerprint = await blake3(ciphertext);
            const dataTimestamp = Date.now();
            try {
				const tx = await program.methods
					.addDataFingerprint(ciphertext, tag, iv, new anchor.BN(dataTimestamp))
					.accountsStrict({
						dataAccount,
						ship: ship4.publicKey,
					})
					.signers([ship4])
					.rpc();
				console.log("Data Fingerprint added with transaction signature", tx);
	
				const txDetails = await program.provider.connection.getTransaction(tx, {
					maxSupportedTransactionVersion: 0,
					commitment: "confirmed",
				});
	
				console.log("Transaction Details: ", txDetails);
	
				const account = await program.account.dataAccount.fetch(dataAccount);
				expect(account.fingerprints.length).to.equal(counter + 1);
	
				// Convert byte array (number[]) to Buffer
				const fingerprintBuffer = Buffer.from(account.fingerprints[counter][0]);
	
				// Convert Buffer to hex string
				const fingerprintHex = fingerprintBuffer.toString('hex');
				console.log("Data Fingerprint: ", fingerprintHex);
	
				expect(fingerprintHex).to.equal(encryptedDataFingerprint);
	
				console.log("Counter: ", counter);
				counter++;
			} catch (error) {
				console.error("Transaction failed: ", error);
			}
        }, 2000);
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

	return {
		ciphertext: ciphertextBytes,
		tag: tagBytes,
		iv: Buffer.from(ivBytes)
	}
}

function getRandomSensorData() {
    return {
        lat: (Math.random() * 180 - 90).toFixed(5),
        long: (Math.random() * 360 - 180).toFixed(5),
        mileage: (Math.random() * 1000).toFixed(2),
        engineLoad: (Math.random() * 100).toFixed(2),
        fuelLevel: (Math.random() * 100).toFixed(2),
        seaState: ["calm", "moderate", "rough", "high"][Math.floor(Math.random() * 4)],
        seaSurfaceTemperature: (Math.random() * 30).toFixed(1),
        airTemp: (Math.random() * 40).toFixed(1),
        humidity: (Math.random() * 100).toFixed(2),
        barometricPressure: (Math.random() * 50 + 950).toFixed(2),
        cargoStatus: ["INTRANSIT", "LOADING", "UNLOADING"][Math.floor(Math.random() * 3)],
        time: Date.now()
    };
}