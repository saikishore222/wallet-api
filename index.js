const express = require("express");
const { Keypair, TransactionStatus } = require("@solana/web3.js");
const { HDKey } = require("micro-ed25519-hdkey");
const bip39 = require("bip39");
const http = require("http");
const dotenv = require("dotenv");
const cors = require('cors');
const { getProfile, updateData, Inprompt, transactions } = require("./firebase.js");

dotenv.config();

const app = express();
const port = 8000;

app.use(cors({
  origin: 'https://prompt-expert.netlify.app', // Allow requests from this origin
}));

app.get('/', (req, res) => {
  res.send('Welcome to my server!');
});

app.get("/trans", async (req, res) => {
  const uid = req.query.uid;
  const data = await transactions(uid);
  console.log('Transactions data');
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

module.exports = app;
