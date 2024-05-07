import express from "express";
import { Keypair } from "@solana/web3.js";
import { HDKey } from "micro-ed25519-hdkey";
import * as bip39 from "bip39";
import * as dotenv from "dotenv";
dotenv.config();
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Welcome to my server!');
});

// create a new wallet
app.get("/wallet", (req, res) => {
    const mnemonic = process.env.mnemonic;
    console.log(mnemonic);
    console.log("kishore");
    const ar=[];
    const seed = bip39.mnemonicToSeedSync(mnemonic, "");
    const hd = HDKey.fromMasterSeed(seed.toString("hex"));
    // (mnemonic, password)
    for (let i = 0; i < 10; i++) {
        const path = `m/44'/501'/${i}'/0'`;
        const keypair = Keypair.fromSeed(hd.derive(path).privateKey);
        ar.push(keypair.publicKey.toBase58());
        console.log(`${path} => ${keypair.publicKey.toBase58()}`);
      }
    res.send(ar);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
