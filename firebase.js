const admin = require('firebase-admin');
const {
  Keypair,
  Transaction,
  PublicKey,
  Connection,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl
} = require('@solana/web3.js');
const bs58 = require('bs58');
const { HDKey } = require('micro-ed25519-hdkey');
const bip39 = require('bip39');
const dotenv = require('dotenv');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
} = require('@solana/spl-token');
const fs = require('fs');
const { getToken } = require('firebase/app-check');
dotenv.config();

// Verify the MNEMONIC is loaded
console.log("Mnemonic from .env:", process.env.MNEMONIC);
// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(fs.readFileSync('./service_account.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const transactions = async (uid) => {
  try {
    const data = await db.collection('prompt').where('uid', '==', uid).orderBy('time', 'desc').get();
    const transactions = [];
    data.forEach(doc => {
      transactions.push(doc.data());
    });
    return transactions;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { error: error };
  }
}

const wallet = async (uid) => {
    const user = await admin.auth().getUser(uid);
    return user.customClaims.wallet;
}
        

const payments = async () => {
    try {
        // Get the current timestamp in milliseconds
        const nowMillis = Date.now();
        console.log('Current Timestamp (milliseconds):', nowMillis);
  
        // Calculate the timestamp for 48 hours ago in milliseconds
        const fortyEightHoursAgoMillis = nowMillis - 48 * 60 * 60 * 1000;
        console.log('48 Hours Ago Timestamp (milliseconds):', fortyEightHoursAgoMillis);
  
        // Reference to the messages collection in the Memes channel
        const messagesRef = db.collection('channels').doc('Memes').collection('messages');
      
        // Query to get messages from the last 48 hours where activity is true
        const orderedMessagesQuery = messagesRef
            .where('timestamp', '>=', fortyEightHoursAgoMillis)
            .where('activity', '==', true)
            .orderBy('timestamp', 'desc');
  
        // Execute the query
        const snapshot = await orderedMessagesQuery.get();
  
        // Log the size of the snapshot
        console.log('Number of documents retrieved:', snapshot.size);
  
        // Sets to store unique UIDs for participants and bonus
        const participantsSet = new Set();
        const bonusSet = new Set();
  
        // Extract messages data and their comments
        const messagesWithComments = [];
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            const commentsSnapshot = await doc.ref.collection('comments').get();
            const comments = commentsSnapshot.docs.map(commentDoc => {
                const commentData = commentDoc.data();
                // Check if the comment has an imageUrl and ignore it if it does
                if (!commentData.imageUrl) {
                    // Check the value of CImg and store UID accordingly
                    if (commentData.CImg === 0) {
                        participantsSet.add(commentData.uid);
                    } else if (commentData.CImg > 0) {
                        bonusSet.add(commentData.uid);
                    }
                }
                return commentData;
            });
            messageData.comments = comments;
            messagesWithComments.push(messageData);
        }
  
        // Convert sets to arrays
        const participants = Array.from(participantsSet);
        const bonus = Array.from(bonusSet);
  
        // Remove UIDs from participants that are also in bonus
        const finalParticipants = participants.filter(uid => !bonusSet.has(uid));
  
        // Get profile data for participants and bonus UIDs
        const participantsData = await getWallets(finalParticipants);
        const bonusData = await getWallets(bonus);
        console.log('Participants:', participantsData);
        console.log('Bonus:', bonusData);  
        console.log('Messages:', messagesWithComments);
       // return in the json format
        return [messagesWithComments, participantsData, bonusData];
    } catch (error) {
        console.error('Error fetching messages:', error);
        return { error: error.message };
    }
}

  
  
 const getWallets = async (uids) => {
        const wallets = [];
        for (const uid of uids) {
            //call wallet function
            const add = await wallet(uid);
          wallets.push(add);
        }
        return wallets;
      }

const processPayment = async () => 
{
    const [messages, participants, bonus] = await payments();
    const ar=[];
    //load solana wallet using private key
    const privateKey="b4Go5JqCAagBUizzQ1aUuXvtVJVvEBNPKbTowqw47LXuzMtHZD4RAMvpaXuDFXPwnoAayttQ5tEiTE2mju3bBLL";
    let secretKey=bs58.decode(privateKey);
    const sender = Keypair.fromSecretKey(secretKey);
    console.log(sender.publicKey.toString());
    console.log(sender.secretKey.toString());
    console.log(sender.secretKey);
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    // now iterate participants and bonus and send sol to them
    for (const participant of participants) {
        const response=await SendUsdc(participant, sender, connection); 
        //create a json object
        const obj = { sig: response.sig, wallet: response.wallet,sender:sender.publicKey.toString(),receiver:participant,message:"Prompt suggestion Payment" };
        ar.push(obj);
    }
    for (const bon of bonus) 
    {
        const response=await SendUsdc(bon, sender, connection);
        //create a json object
        const obj = { sig: response.sig, wallet: response.wallet,sender:sender.publicKey.toString(),receiver:bon,message:"Prompt suggestion Payment" };
        ar.push(obj);
    }
    return ar;
}

const SendUsdc = async (Address,sender,connection) =>
{
    const toWallet = new PublicKey(Address);
        console.log(toWallet);
        console.log(sender.publicKey.toString());
        const MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
        
        const senderTokenAccountAddress = await getAssociatedTokenAddress(
          MINT,
          sender.publicKey
        );
        console.log(senderTokenAccountAddress);
    
        try{ await getAccount(
          connection,
          senderTokenAccountAddress,
          "confirmed",
          TOKEN_PROGRAM_ID
        ) } catch (e) {
            return { error: "Sender account not found" };
        }
    
        const receiverTokenAccountAddress = await getAssociatedTokenAddress(
          MINT,
          toWallet
        );
        console.log(receiverTokenAccountAddress);
    
        
    
        const transaction = new Transaction();
    
        try {
          await getAccount(
            connection,
            receiverTokenAccountAddress,
            "confirmed",
            TOKEN_PROGRAM_ID
          );
        } catch (e) {
          if (e.name === "TokenAccountNotFoundError") {
            const createAccountInstruction = createAssociatedTokenAccountInstruction(
              sender.publicKey,
              receiverTokenAccountAddress,
              toWallet,
              MINT,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );
            transaction.add(createAccountInstruction);
          } else {
            throw e;
          }
        }
    
        const transferInstruction = createTransferInstruction(
          senderTokenAccountAddress,
          receiverTokenAccountAddress,
          sender.publicKey,
          1000000
        );
    
        transaction.add(transferInstruction);
    
        console.log("kishore");
    
        try {
          const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [sender]
          );
    
          console.log("Transaction Signature", signature);
          return { sig: signature, wallet: sender.publicKey.toString() };
        } catch (error) {
          if (error) {
            return { error: "Insufficient funds" };
          } else {
            throw error;
          }
        }
}
      

// Inprompt
const Inprompt = async (uid) => {
  try {
    const user = await admin.auth().getUser(uid);
    console.log(user);
    const seed = bip39.mnemonicToSeedSync(process.env.MNEMONIC, "");
    const hd = HDKey.fromMasterSeed(seed.toString("hex"));
    const path = `m/44'/501'/${user.customClaims.index}'/0'`;
    const sender = Keypair.fromSeed(hd.derive(path).privateKey);
    console.log(sender.secretKey.toString());
    console.log(sender.publicKey.toString());
    console.log(user.customClaims.wallet);

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const publicKey = new PublicKey(user.customClaims.wallet);
    const balance = await connection.getBalance(publicKey);
    console.log(balance);

    if (balance === 0) {
      return { error: "Not having enough SOL" };
    }

    const toWallet = new PublicKey("CzKZcazeXoUJr8nksqVivN8ReHZ7Hrof8tdkpguZmDua");
    console.log(toWallet);
    console.log(sender.publicKey.toString());
    const MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
    
    const senderTokenAccountAddress = await getAssociatedTokenAddress(
      MINT,
      sender.publicKey
    );
    console.log(senderTokenAccountAddress);

    try{ await getAccount(
      connection,
      senderTokenAccountAddress,
      "confirmed",
      TOKEN_PROGRAM_ID
    ) } catch (e) {
        return { error: "Sender account not found" };
    }

    const receiverTokenAccountAddress = await getAssociatedTokenAddress(
      MINT,
      toWallet
    );
    console.log(receiverTokenAccountAddress);

    

    const transaction = new Transaction();

    try {
      await getAccount(
        connection,
        receiverTokenAccountAddress,
        "confirmed",
        TOKEN_PROGRAM_ID
      );
    } catch (e) {
      if (e.name === "TokenAccountNotFoundError") {
        const createAccountInstruction = createAssociatedTokenAccountInstruction(
          sender.publicKey,
          receiverTokenAccountAddress,
          toWallet,
          MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        transaction.add(createAccountInstruction);
      } else {
        throw e;
      }
    }

    const transferInstruction = createTransferInstruction(
      senderTokenAccountAddress,
      receiverTokenAccountAddress,
      sender.publicKey,
      1000000
    );

    transaction.add(transferInstruction);

    console.log("kishore");

    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [sender]
      );

      console.log("Transaction Signature", signature);
      return { sig: signature, wallet: sender.publicKey.toString() };
    } catch (error) {
      if (error) {
        return { error: "Insufficient funds" };
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error occurred:', error);
    return { error: error.message };
  }
};


const getProfile = async (uid) => {
  const user = await admin.auth().getUser(uid);
  const users= await admin.auth().listUsers();
  console.log(users.users.length);
  let i=0;
  users.users.forEach(user => {
    i=i+1;
    console.log(i);
    console.log(user.displayName);
    console.log(user.customClaims);
  });
    console.log(user.displayName);
    console.log(user.email);
    console.log(user.customClaims.wallet);
    console.log(user.photoURL);

    const url = clusterApiUrl("devnet");
    const connection = new Connection(url);
    const publicKey = new PublicKey(user.customClaims.wallet);
    const balance = await connection.getBalance(publicKey);
    console.log(balance);
  try {
    // Get USDC balance
    const USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"); // Replace with the actual USDC mint public key
    const account = await connection.getParsedTokenAccountsByOwner(publicKey, {
      mint: USDC_MINT,
    });
    return { 
      name: user.displayName, 
      email: user.email, 
      wallet: user.customClaims.wallet, 
      photo: user.photoURL, 
      amount: balance / LAMPORTS_PER_SOL,
      usdc: account.value[0].account.data.parsed.info.tokenAmount.uiAmount
    };
  } catch (error) {
    return { 
      name: user.displayName, 
      email: user.email, 
      wallet: user.customClaims.wallet, 
      photo: user.photoURL, 
      amount: balance / LAMPORTS_PER_SOL,
      usdc: 0
    };
  }
}

// Function to get the token account balance for a specific token and wa


// Retrieve all users
const updateData = async (uid) => {
  const mnemonic = process.env.MNEMONIC;
  console.log(mnemonic);
  const seed = bip39.mnemonicToSeedSync(mnemonic, "");
  const hd = HDKey.fromMasterSeed(seed);

  try {
    const listUsers = await admin.auth().listUsers();
    const index = listUsers.users.length;
    const data = await admin.auth().getUser(uid);

    if (data.customClaim) {
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
    console.error('Error updating user data:', error);
  }
}

module.exports = { updateData, getProfile, Inprompt, transactions,payments,processPayment };