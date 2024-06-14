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
const { addDoc } = require('firebase/firestore');
dotenv.config();

// Verify the MNEMONIC is loaded
console.log("Mnemonic from .env:", process.env.MNEMONIC);
// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(fs.readFileSync('./service_account.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const posts = async () => {
    const messagesRef = db.collection('channels').doc('Memes').collection('messages');
    const snapshot = await messagesRef.get();

    const batch = db.batch(); // Use a batch to perform atomic writes

    snapshot.forEach(doc => {
        const data = doc.data();
        const updateData = {};
        if (!data.hasOwnProperty('activity')) {
            updateData.activity = false; // Default value for activity
        }

        if (!data.hasOwnProperty('payment')) {
            updateData.payment = false; // Default value for payment
        }

        if (Object.keys(updateData).length > 0) {
            const docRef = messagesRef.doc(doc.id);
            batch.update(docRef, updateData);
        }
    });

    // Commit the batch
    await batch.commit();
    console.log('Documents updated successfully');
};

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

const UserRewards = async (uid) => {
    try {
        const data = await db.collection('rewards').doc(uid).collection('user_rewards').get();
        const rewards = [];
        data.forEach(doc => {
            rewards.push(doc.data());
        });
        return rewards;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return { error: error };
    }
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
            .where('payment', '==', false)
            .orderBy('timestamp', 'desc');
  
        // Execute the query
        const snapshot = await orderedMessagesQuery.get();
  
        // Log the size of the snapshot
        console.log('Number of documents retrieved:', snapshot.size);
  
        // Objects to store unique UIDs for participants and bonus
        const participants = {};
        const bonus = {};
  
        // Extract messages data and their comments
        const messagesWithComments = [];
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            console.log(doc.id);
            console.log('Message Data:', messageData);
            const mdata = { id: doc.id, userName: messageData.userName, text: messageData.text };
            const commentsSnapshot = await doc.ref.collection('comments').get();
            const comments = commentsSnapshot.docs.map(commentDoc => {
                const commentData = commentDoc.data();
                // Check if the comment has an imageUrl and ignore it if it does
                if (!commentData.imageUrl && commentData.sender !== messageData.userName) {
                    // Check the value of CImg and store UID accordingly
                    if (commentData.CImg === 0 ) {
                        if (!participants[commentData.uid]) {
                            participants[commentData.uid] = [];
                        }
                        participants[commentData.uid].push({prompt:commentData.text, name: messageData.userName});
                    } else if (commentData.CImg > 0) {
                        if (!bonus[commentData.uid]) {
                            bonus[commentData.uid] = [];
                        }
                        bonus[commentData.uid].push({prompt:commentData.text, name: messageData.userName});
                    }
                }
                const cData = {
                    id: commentDoc.id,
                    prompt: commentData.text,
                    name: commentData.sender,
                    ImageGenerated: commentData.CImg,
                    uid: commentData.uid
                };
                return cData;
            });
            mdata.comments = comments;
            messagesWithComments.push(mdata);
        }

        console.log('Participants:', participants);
        console.log('Bonus:', bonus);
  

        // Remove keys from participants if they are present in bonus
        for (const uid in bonus) {
            if (participants[uid]) {
                delete participants[uid];
            }
        }

        // Log the final objects
        console.log('Participants:', participants);
        console.log('Bonus:', bonus);

        const participantsData = await getWallets(participants);
        const bonusData = await getWallets(bonus);
        console.log('Participants:', participantsData);
        console.log('Bonus:', bonusData);  
        console.log('Messages:', messagesWithComments);
       // return in the json format
        return [messagesWithComments, participantsData, bonusData, participants, bonus];
    } catch (error) {
        console.error('Error fetching messages:', error);
        return { error: error.message };
    }
}  
  
 const getWallets = async (uids) => {
        //uids looks like 
        const wallets = [];
        for(const uid in uids) {
            const user = await admin.auth().getUser(uid);
            wallets.push({ id: uid, wallet: user.customClaims.wallet });
        }
        return wallets;
      }
  const setPayment = async (messages) => 
  {
    const batch = db.batch();
    //create rewards collection if its doesn't exist and keep the document id as 
    for (const message of messages) {
        const messageRef = db.collection('channels').doc('Memes').collection('messages').doc(message.id);
        batch.update(messageRef, { payment: true });
    }
    await batch.commit();
    console.log('Payments updated successfully');
  }

  const rewards = async (uids, trans, type) => {
    console.log("Rewards");
    console.log(uids);
    console.log(trans);
    
    // Create a batch for Firestore
    const batch = db.batch();
    
    let c = 0;
    for (const uid in uids) {
        if (uids.hasOwnProperty(uid)) {
            const promptObj = uids[uid][0];
            console.log(promptObj);
            
            // Reference to the user's document in the rewards collection
            const userRef = db.collection('rewards').doc(uid);
            
            // Reference to the rewards sub-collection inside the user's document
            const rewardsSubCollectionRef = userRef.collection('user_rewards').doc();
            
            // Get the signature
            const sig = trans[c].sig;
            
            // Prepare the data
            const rewardData = {
                prompt: promptObj.prompt,
                to: promptObj.name,
                sig: sig,
                type: type == 1 ? "Participant" : "Bonus"
            };
            
            // Add the document to the batch
            batch.set(rewardsSubCollectionRef, rewardData);
            
            c += 1;
        }
    }

    // Commit the batch
    await batch.commit();
    console.log('Rewards updated successfully');
};

const processPayment = async () => 
{
    const [messages,partWallets,bonusWallets, participants, bonus] = await payments();
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
    if(partWallets.length>0){
    for (const participant of partWallets) {
        const response=await SendUsdc(participant.wallet, sender, connection); 
        //create a json object
        const obj = { sig: response.sig, wallet: response.wallet,sender:sender.publicKey.toString(),receiver:participant,message:"Prompt suggestion Payment" };
        ar.push(obj);
    }
    await rewards(participants,ar,1);
    }
    if(bonusWallets.length>0){
    for (const bon of bonusWallets) 
    {
        const response=await SendUsdc(bon.wallet, sender, connection);
        //create a json object
        const obj = { sig: response.sig, wallet: response.wallet,sender:sender.publicKey.toString(),receiver:bon,message:"Prompt suggestion Payment" };
        ar.push(obj);
    }
    console.log(ar);
    await rewards(bonus,ar,2);
    }
    await setPayment(messages);
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

module.exports = { updateData, getProfile, Inprompt, transactions,payments,processPayment,posts,UserRewards};