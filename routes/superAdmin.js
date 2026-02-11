const express = require("express");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const Transaction = require("../models/Transaction");
const Game = require("../models/Game");
const Bet = require("../models/Bet");

const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

/* ===============================
   USERS (VIEW / BLOCK / UNBLOCK)
================================ */
router.get("/users", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

router.put("/users/:id/toggle", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const user = await User.findById(req.params.id);
  user.isActive = !user.isActive;
  await user.save();
  res.json(user);
});

/* ===============================
   WALLET SEED (SUPER ADMIN → ANY)
================================ */
router.post("/seed", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const { userId, amount } = req.body;

  let wallet = await Wallet.findOne({ userId });
  if (!wallet) wallet = await Wallet.create({ userId, balance: 0 });

  wallet.balance += Number(amount);
  await wallet.save();

  await Transaction.create({
    from: null,
    to: userId,
    amount,
    type: "SEED",
  });

  res.json({ message: "Coins seeded successfully", wallet });
});

/* ===============================
   GAMES CONTROL
================================ */
router.post("/games", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const game = await Game.create(req.body);
  res.json(game);
});

router.get("/games", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const games = await Game.find();
  res.json(games);
});

router.put("/games/:id", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const game = await Game.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(game);
});

router.put("/games/:id/toggle", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const game = await Game.findById(req.params.id);
  game.isActive = !game.isActive;
  await game.save();
  res.json(game);
});

/* ===============================
   BET HISTORY (FULL VISIBILITY)
================================ */
router.get("/bets", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const bets = await Bet.find()
    .populate("userId", "email role")
    .populate("gameId", "name")
    .sort({ createdAt: -1 });

  res.json(bets);
});

/* ===============================
   PROFIT / LOSS REPORT
================================ */
router.get("/reports/profit-loss", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const bets = await Bet.find();
  const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
  res.json({ totalProfit });
});

/* ===============================
   TRANSACTION HISTORY
================================ */
router.get("/transactions", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  const tx = await Transaction.find()
    .populate("from", "email role")
    .populate("to", "email role")
    .sort({ createdAt: -1 });

  res.json(tx);
});

/* ===============================
   WALLET TRANSFER (SUPER ADMIN)
================================ */
router.post("/transfer", auth, role([ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    const { fromId, toId, amount } = req.body;
    const amt = Number(amount);
    if (!fromId || !toId || !amt || amt <= 0) {
      return res.status(400).json({ message: "Invalid transfer details" });
    }

    const fromWallet = await Wallet.findOne({ userId: fromId });
    const toWallet = await Wallet.findOneAndUpdate(
      { userId: toId },
      { $setOnInsert: { balance: 0 } },
      { upsert: true, new: true }
    );

    if (!fromWallet || fromWallet.balance < amt) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    fromWallet.balance -= amt;
    toWallet.balance += amt;
    await fromWallet.save();
    await toWallet.save();

    await Transaction.create({
      from: fromId,
      to: toId,
      amount: amt,
      type: "TRANSFER",
    });

    res.json({ message: "Transfer successful" });
  } catch (err) {
    console.error("SUPER ADMIN TRANSFER ERROR:", err);
    res.status(500).json({ message: "Transfer failed" });
  }
});

module.exports = router;
