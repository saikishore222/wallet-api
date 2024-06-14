const express = require("express");
const { Keypair, TransactionStatus } = require("@solana/web3.js");
const { HDKey } = require("micro-ed25519-hdkey");
const bip39 = require("bip39");
const http = require("http");
const dotenv = require("dotenv");
const cors = require('cors');
const cron = require('node-cron');
const { getProfile, updateData, Inprompt, transactions, processPayment,posts, payments,UserRewards } = require("./firebase.js");

dotenv.config();

const app = express();
const port = 8000;

const allowedOrigins = ['http://localhost:3000', 'https://prompt-expert.netlify.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.get('/', (req, res) => {
  res.send('Welcome to my server!');
});

app.get("/posts", async (req, res) => {
  await posts();
  console.log('Posts data');
  res.send("Posts data");
});

app.get("/trans", async (req, res) => {
  const uid = req.query.uid;
  const data = await transactions(uid);
  console.log('Transactions data');
  console.log(data);
  res.send(data);
});

app.get("/rewards", async (req, res) => {
  const uid = req.query.uid;
  const data = await UserRewards(uid);
  console.log('Rewards data');
  console.log(data);
  res.send(data);
});

app.get("/payments", async (req, res) => {
  const data = await processPayment();
  console.log('Payments data');
  console.log(data);
  res.send(data);
});

app.get("/inprompt", async (req, res) => {
  const uid = req.query.uid;
  const response = await Inprompt(uid);
  res.send(response);
});

// get the user profile
app.get("/profile", async (req, res) => {
  const uid = req.query.uid;
  const data = await getProfile(uid);
  res.send(data);
});

// create a new wallet
app.get("/wallet", (req, res) => {
  const uid = req.query.uid;
  console.log(uid);
  updateData(uid);
  res.send("thanks");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Schedule the processPayment function to run every 48 hours
cron.schedule('0 1 */1 * *', async () => {
  try {
    console.log('Running daily processPayment job at 1 AM...');
    const data = await processPayment();
    console.log('Payments data');
    console.log(data);
  } catch (error) {
    console.error('Error running processPayment job:', error);
  }
});

module.exports = app;
