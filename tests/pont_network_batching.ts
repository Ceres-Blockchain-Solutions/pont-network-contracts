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
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { getAssociatedTokenAddress, getAssociatedTokenAddressSync } from "@solana/spl-token";

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

    const vc1 = anchor.web3.Keypair.generate();
    const vc2 = anchor.web3.Keypair.generate();
    const vc3 = anchor.web3.Keypair.generate();

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
        await airdropLamports(vc1.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(vc2.publicKey, 1000 * LAMPORTS_PER_SOL);
        await airdropLamports(vc3.publicKey, 1000 * LAMPORTS_PER_SOL);
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

    it("Fundraising", async () => {
        await program.methods.startFundraising().accounts({
            user: shipManagement.publicKey,
        }).signers([shipManagement]).rpc();
    });

    it("Contribute", async () => {
        const tx1 = await program.methods.contribute(new anchor.BN(100 * LAMPORTS_PER_SOL)).accounts({
            user: vc1.publicKey
        }).signers([vc1]).rpc();

        const tx2 = await program.methods.contribute(new anchor.BN(200 * LAMPORTS_PER_SOL)).accounts({
            user: vc2.publicKey
        }).signers([vc2]).rpc();

        const t3 = await program.methods.contribute(new anchor.BN(300 * LAMPORTS_PER_SOL)).accounts({
            user: vc3.publicKey
        }).signers([vc3]).rpc();
    });

    it("Stake", async () => {
        const tx1 = await program.methods.stake(new anchor.BN(100 * LAMPORTS_PER_SOL)).accounts({
            sender: vc1.publicKey,
            recipient: vc1.publicKey
        }).signers([vc1]).rpc();

        const tx2 = await program.methods.stake(new anchor.BN(200 * LAMPORTS_PER_SOL)).accounts({
            sender: vc2.publicKey,
            recipient: vc2.publicKey
        }).signers([vc2]).rpc();

        const tx3 = await program.methods.stake(new anchor.BN(300 * LAMPORTS_PER_SOL)).accounts({
            sender: vc3.publicKey,
            recipient: vc3.publicKey
        }).signers([vc3]).rpc();

        console.log("Test: ", (await program.account.fundraisingAccount.all())[0].account.userStakingInfo);
    });

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

        const batches = [initialBatch];
        const timestampIncrement = 5000;

        for (let i = 1; i < 10; i++) {
            const nextBatch = generateNextBatch(batches[i - 1], timestampIncrement);
            batches.push(nextBatch);
        }

        for (let i = 0; i < 10; i++) {
            const ivUint32Array = new Uint32Array(3);
            crypto.getRandomValues(ivUint32Array);

            const sensorData = batches[i];
            const sensorDataJson = JSON.stringify(sensorData);
            const sensorDataBuffer = Buffer.from(sensorDataJson);

            const encryptedData = encrypt(sensorDataBuffer, masterKey, ivUint32Array);
            const { ciphertext, tag, iv } = serializeEncryptedData(encryptedData);

            const dataTimestamp = Date.now();

            const tx = await program.methods
                .addDataFingerprint(ciphertext.subarray(0, 10), tag, iv, new anchor.BN(dataTimestamp))
                .accountsPartial({
                    dataAccount,
                    ship: ship4.publicKey,
                    systemProgram: SystemProgram.programId,
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
    });

    it("Claim rewards", async () => {
        const tokenMint = (await program.account.fundraisingAccount.all())[0].account.tokenMint;

        const vc1BeforeLamports = (await program.provider.connection.getAccountInfo(vc1.publicKey)).lamports;
        const vc2BeforeLamports = (await program.provider.connection.getAccountInfo(vc2.publicKey)).lamports;
        const vc3BeforeLamports = (await program.provider.connection.getAccountInfo(vc3.publicKey)).lamports;

        const tx1 = await program.methods.claimRewards().accounts({
            user: vc1.publicKey,
            tokenMint
        }).signers([vc1]).rpc();

        const tx2 = await program.methods.claimRewards().accounts({
            user: vc2.publicKey,
            tokenMint
        }).signers([vc2]).rpc();

        const tx3 = await program.methods.claimRewards().accounts({
            user: vc3.publicKey,
            tokenMint
        }).signers([vc3]).rpc();

        const vc1AfterLamports = (await program.provider.connection.getAccountInfo(vc1.publicKey)).lamports;
        const vc2AfterLamports = (await program.provider.connection.getAccountInfo(vc2.publicKey)).lamports;
        const vc3AfterLamports = (await program.provider.connection.getAccountInfo(vc3.publicKey)).lamports;

        expect(vc1AfterLamports).to.equal(Math.floor(1/6 * 10 * 0.01 * LAMPORTS_PER_SOL)  + vc1BeforeLamports);
        expect(vc2AfterLamports).to.equal(Math.floor(1/3 * 10 * 0.01 * LAMPORTS_PER_SOL) + vc2BeforeLamports);
        expect(vc3AfterLamports).to.equal(Math.floor(1/2 * 10 * 0.01 * LAMPORTS_PER_SOL) + vc3BeforeLamports);
    });

});

const initialBatch = [
    {
        "id": "2kBcbo8q4m2BQHBM6YXdqzKvs3jngDKeuasLUbjpzLbw",
        "gps": {
            "lat": -72.08676024597169,
            "long": 45.24489045895045
        },
        "mil": 832.924678836468,
        "eng": 61.7674345504559,
        "fuel": 0,
        "sea": "phenomenal",
        "sst": -16.033855771848014,
        "air": 73.11872379690351,
        "hum": 56.0037126236963,
        "bar": 993.7594710848113,
        "cargo": "LOADED",
        "time": 1727958512857
    },
    {
        "id": "2kBcbo8q4m2BQHBM6YXdqzKvs3jngDKeuasLUbjpzLbw",
        "gps": {
            "lat": -70.35416584693074,
            "long": 40.46302823313966
        },
        "mil": 834.7202878787384,
        "eng": 75.229296029204,
        "fuel": 0,
        "sea": "high",
        "sst": -17.452268356567966,
        "air": 73.38776586915114,
        "hum": 55.378798481889945,
        "bar": 993.3529433773064,
        "cargo": "INTRANSIT",
        "time": 1727958517857
    },
    {
        "id": "2kBcbo8q4m2BQHBM6YXdqzKvs3jngDKeuasLUbjpzLbw",
        "gps": {
            "lat": -67.16685908117938,
            "long": 39.47718137474942
        },
        "mil": 835.7492815332844,
        "eng": 25.65602509766032,
        "fuel": 0,
        "sea": "very rough",
        "sst": -18.44757107685398,
        "air": 72.1882819817114,
        "hum": 54.77186162909738,
        "bar": 991.4561955135117,
        "cargo": "LOADED",
        "time": 1727958522857
    },
    {
        "id": "2kBcbo8q4m2BQHBM6YXdqzKvs3jngDKeuasLUbjpzLbw",
        "gps": {
            "lat": -62.79241172943559,
            "long": 37.78338928089358
        },
        "mil": 837.6282867902132,
        "eng": 64.52746806944776,
        "fuel": 0,
        "sea": "slight",
        "sst": -17.143678716026304,
        "air": 74.01773835369463,
        "hum": 56.37668605441742,
        "bar": 991.5571217149911,
        "cargo": "DELIVERED",
        "time": 1727958527857
    }
];

function generateNextBatch(previousBatch: any[], timestampIncrement: number): any[] {
    return previousBatch.map((data) => {
        const newData = { ...data };
        newData.time += timestampIncrement;
        return newData;
    });
}

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