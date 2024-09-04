import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PontNetwork } from "../target/types/pont_network";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import { blake3 } from 'hash-wasm'

describe("pont_network", () => {
	// Configure the client to use the local cluster.
	anchor.setProvider(anchor.AnchorProvider.env());
	const provider = anchor.AnchorProvider.env();
	const program = anchor.workspace.PontNetwork as Program<PontNetwork>;

	const ship = anchor.web3.Keypair.generate();
	// external observers
	const eo1 = anchor.web3.Keypair.generate();
	const eo2 = anchor.web3.Keypair.generate();
	const eos = [eo1.publicKey, eo2.publicKey];

	async function airdropLamports(ship: PublicKey, amount: number) {
		const signature = await provider.connection.requestAirdrop(ship, amount);

		const latestBlockHash = await provider.connection.getLatestBlockhash();

		await provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: signature,
		})
	}

	it("Initializes a ShipAccount", async () => {
		const [shipAccount, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		);

		// Airdrop lamports to the ship account
		await airdropLamports(ship.publicKey, 1000 * LAMPORTS_PER_SOL); // Airdrop 1000 SOL

		const tx = await program.methods
			.initializeShip()
			.accountsStrict({
				shipAccount,
				ship: ship.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([ship])
			.rpc();

		console.log("ShipAccount initialized with transaction signature", tx);
	});

	it("Adds a Data Account", async () => {
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

		const externalObserversKeys = [new Uint8Array(32), new Uint8Array(32)].map(key => Array.from(key)); // Example keys

		const tx = await program.methods
			.addDataAccount(eos, externalObserversKeys)
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

	const externalObserver = anchor.web3.Keypair.generate();

	it("Requests to be an External Observer", async () => {
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
			externalObserver.publicKey,
			anchor.web3.LAMPORTS_PER_SOL
		);

		const latestBlockHash = await provider.connection.getLatestBlockhash();

		await provider.connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: airdropSignature,
		})

		const tx = await program.methods
			.externalObserverRequest()
			.accountsStrict({
				dataAccount,
				externalObserversAccount,
				externalObserver: externalObserver.publicKey,
				systemProgram: SystemProgram.programId,
			})
			.signers([externalObserver])
			.rpc();

		console.log("External Observer requested with transaction signature", tx);

		const account = await program.account.externalObserversAccount.fetch(externalObserversAccount);

		// Convert PublicKey objects to strings for comparison
		const unapprovedExternalObservers = account.unapprovedExternalObservers.map((pk: PublicKey) => pk.toString());
		const externalObserverPublicKey = externalObserver.publicKey.toString();

		expect(unapprovedExternalObservers).to.include(externalObserverPublicKey);
	});

	it("Approves an External Observer", async () => {
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
	
		// Approve the external observer
		const tx = await program.methods
		  .approveExternalObserver()
		  .accountsStrict({
			externalObserversAccount,
			externalObserver: externalObserver.publicKey,
			dataAccount,
		  }).
		  signers([externalObserver])
		  .rpc();
	
		console.log("External Observer approved with transaction signature", tx);
	
		console.log("Fetching externalObserversAccount: ", externalObserversAccount);
		const account = await program.account.externalObserversAccount.fetch(externalObserversAccount);
	
		// Convert PublicKey objects to strings for comparison
		const unapprovedExternalObservers = account.unapprovedExternalObservers.map((pk: PublicKey) => pk.toString());
		const externalObservers = account.externalObservers.map((pk: PublicKey) => pk.toString());
		const externalObserverPublicKey = externalObserver.publicKey.toString();
	
		expect(unapprovedExternalObservers).to.not.include(externalObserverPublicKey);
		expect(externalObservers).to.include(externalObserverPublicKey);
	  });

	  it("Adds a Data Fingerprint", async () => {
		const [shipAccountAddress, bump1] = PublicKey.findProgramAddressSync(
			[Buffer.from("ship_account"), ship.publicKey.toBuffer()],
			program.programId
		  );
		  const shipAccount = await program.account.shipAccount.fetch(shipAccountAddress);
	  
		  const [dataAccount, bump2] = PublicKey.findProgramAddressSync(
			[Buffer.from("data_account"), ship.publicKey.toBuffer(), new anchor.BN(shipAccount.dataAccounts.length - 1, "le").toArrayLike(Buffer, "le", 8)],
			program.programId
		  );
	
		const data = Buffer.from("test data");
		const dataFingerprint = await blake3(data);
		console.log("Data Fingerprint: ", dataFingerprint);
		const uint8Array = Uint8Array.from(Buffer.from(dataFingerprint, "hex"));
		const numberArray = Array.from(uint8Array);
		const dataTimestamp = Date.now();
	
		const tx = await program.methods
		  .addDataFingerprint(numberArray, new anchor.BN(dataTimestamp))
		  .accountsStrict({
			dataAccount,
			ship: ship.publicKey,
		  })
		  .signers([ship])
		  .rpc();

		console.log("Data Fingerprint added with transaction signature", tx);
	
		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(1);
	  });

	  it("Adds Multiple Data Fingerprints", async () => {
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
		const dataFingerprintsPromises = data.map(async (d) => await blake3(d));
		const dataFingerprints = await Promise.all(dataFingerprintsPromises);

		const uint8Arrays = dataFingerprints.map(fingerprint => Uint8Array.from(Buffer.from(fingerprint, "hex")));
		const numberArrays = uint8Arrays.map(uint8Array => Array.from(uint8Array));
		const dataTimestamps = [Date.now(), Date.now() + 1000, Date.now() + 2000];
	
		const tx = await program.methods
		  .addMultipleDataFingerprints(numberArrays, dataTimestamps.map(ts => new anchor.BN(ts)))
		  .accountsStrict({
			dataAccount,
			ship: ship.publicKey,
		  })
		  .signers([ship])
		  .rpc();
	
		console.log("Data Fingerprint added with transaction signature", tx);
	
		const account = await program.account.dataAccount.fetch(dataAccount);
		expect(account.fingerprints.length).to.equal(4);
	  });
});