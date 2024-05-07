const admin = require('firebase-admin');
const  { Keypair, SystemProgram, Transaction, PublicKey, Connection, clusterApiUrl, sendAndConfirmTransaction, LAMPORTS_PER_SOL,sendAndConfirmRawTransaction} = require("@solana/web3.js");
const { HDKey } = require("micro-ed25519-hdkey");
const bip39 = require("bip39");
const dotenv = require("dotenv");
dotenv.config();

// Initialize Firebase Admin SDK
const serviceAccount = require('./service_account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const transactions = async (uid) => {
    try {
        const data=db.collection('prompt').where('uid','==',uid).orderBy('time','desc').get();
        const transactions=[];
        (await data).forEach(doc=>{
            transactions.push(doc.data());
        });
        return transactions;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return {error:error};
    }
}
       

// Inprompt
const Inprompt = async (uid) => {
  try {
    const user = await admin.auth().getUser(uid);
    console.log(user);
    const seed = bip39.mnemonicToSeedSync(process.env.mnemonic, "");
    const hd = HDKey.fromMasterSeed(seed.toString("hex"));
    const path = `m/44'/501'/${user.customClaims.index}'/0'`;
    const keypair = Keypair.fromSeed(hd.derive(path).privateKey);
    console.log(keypair.secretKey.toString());
    console.log(user.customClaims.wallet);
    const lamportsToSend = 1_000_000;
    console.log(keypair);
    const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );
      // walllet balance
      const publicKey = new PublicKey(user.customClaims.wallet);
      const balance=await connection.getBalance(publicKey);
      console.log(balance);
      if(balance==0)
      {
        return {error:"Not having enough sol"}
      }
      const blockhashResponse = await connection.getLatestBlockhashAndContext();
      const lastValidBlockHeight = blockhashResponse.context.slot + 150;
     
      const transaction = new Transaction({
        feePayer: keypair.publicKey,
        blockhash: blockhashResponse.value.blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey("CzKZcazeXoUJr8nksqVivN8ReHZ7Hrof8tdkpguZmDua"),
          lamports: 1000000,
        }),
      );
     const response=await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair],
        {
          commitment: "confirmed",
        },
      );
      console.log(response);
  return {sig:response,wallet:user.customClaims.wallet};
} catch (error) {
    console.error('Error fetching user data:', error);
    return {error:error};
}
}

const getProfile = async (uid) => {
    try {
        const user = await admin.auth().getUser(uid);
        console.log(user);
        console.log(user.displayName);
        console.log(user.email);
        console.log(user.customClaims.wallet);
        console.log(user.photoURL);
        // get the wallet balance of devent
        const url = clusterApiUrl("devnet");
        const connection = new Connection(url);
        const publicKey = new PublicKey(user.customClaims.wallet);
        const balance = await connection.getBalance(publicKey);
        console.log(balance);
        return {name: user.displayName, email: user.email, wallet: user.customClaims.wallet,photo:user.photoURL,amount:balance/ LAMPORTS_PER_SOL};
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}

// Retrieve all users
const updateData = async (uid) => {
    const mnemonic = process.env.mnemonic;
    console.log(mnemonic);
    const seed = bip39.mnemonicToSeedSync(mnemonic, "");
    const hd = HDKey.fromMasterSeed(seed.toString("hex"));
    
    try {
        const listUsers = await admin.auth().listUsers();
        const index = listUsers.users.length;
        const data = await admin.auth().getUser(uid);
        console.log(data.customClaims.wallet);
        if(data.customClaims.wallet){
            return;
        }
        const path = `m/44'/501'/${index}'/0'`;
        const keypair = Keypair.fromSeed(hd.derive(path).privateKey);
        console.log(keypair.publicKey.toString());
        await admin.auth().setCustomUserClaims(uid, {
            wallet: keypair.publicKey.toString(),
            index: index
        });
        console.log('User data updated successfully');
        const getClaims = await admin.auth().getUser(uid);
        console.log(getClaims.customClaims.wallet);
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

module.exports = { updateData,getProfile,Inprompt,transactions};
