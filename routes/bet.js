const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const Bet = require("../models/Bet");
const Wallet = require("../models/wallet");
const Game = require("../models/Game");
const GameRound = require("../models/GameRound");
const CustomerGameControl = require("../models/CustomerGameControl");

const MIN_BET_AMOUNT = 50;

const isCustomerGameEnabled = async (customerId, gameSlug) => {
  const control = await CustomerGameControl.findOne({
    customerId,
    gameSlug: String(gameSlug || "").toLowerCase(),
  }).select("isEnabled");
  return control ? !!control.isEnabled : true;
};

/* ===============================
   PLACE BET (CUSTOMER – PAPPU)
================================ */
router.post(
  "/place",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const { roundId, symbol, amount } = req.body;

      if (!roundId || !symbol || amount === undefined || amount === null) {
        return res.status(400).json({ message: "Missing fields" });
      }

      const betAmount = Number(amount);
      if (!Number.isFinite(betAmount) || betAmount < MIN_BET_AMOUNT) {
        return res.status(400).json({ message: `Minimum bet is ₹${MIN_BET_AMOUNT}` });
      }
      const userId = req.user.id;
      const allowed = await isCustomerGameEnabled(userId, "pappu-playing-pictures");
      if (!allowed) {
        return res.status(403).json({ message: "Game is disabled for this customer" });
      }

      // 1️⃣ Wallet check
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // 2️⃣ Round check
      const round = await GameRound.findById(roundId);
      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      // 3️⃣ Game ON / OFF check
      const game = await Game.findOne({ slug: "pappu-playing-pictures" });
      if (!game || !game.isActive) {
        return res.status(403).json({ message: "Game is OFF" });
      }

      // 4️⃣ Cut balance
      wallet.balance -= betAmount;

      let result = "LOSE";
      let payout = 0;

      // 5️⃣ Win logic (9x)
      if (round.resultSymbol === symbol) {
        result = "WIN";
        payout = betAmount * 9;
        wallet.balance += payout;
      }

      await wallet.save();

      // 6️⃣ Save bet
      const profit = result === "WIN" ? payout - betAmount : -betAmount;
      const bet = await Bet.create({
        userId,
        gameSlug: "pappu-playing-pictures",
        roundId,
        symbol,
        amount: betAmount,
        odds: 9,
        result,
        payout,
        profit,
      });

      res.json({
        message: result === "WIN" ? "You won 🎉" : "You lost 😢",
        result,
        payout,
        balance: wallet.balance,
      });
    } catch (err) {
      console.error("PLACE BET ERROR:", err);
      res.status(500).json({ message: err.message || "Bet failed" });
    }
  }
);

/* ===============================
   CUSTOMER – MY BETS
================================ */
router.get(
  "/my",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const bets = await Bet.find({ userId: req.user.id })
        .populate("gameId", "name")
        .sort({ createdAt: -1 });

      res.json(bets);
    } catch (err) {
      console.error("MY BETS ERROR:", err);
      res.json([]);
    }
  }
);

/* ===============================
   PLACE BET (CUSTOMER – TEEN PATTI A/B)
================================ */
router.post(
  "/teenpatti/place",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const { side, amount } = req.body;
      const betAmount = Number(amount);
      const allowed = await isCustomerGameEnabled(req.user.id, "teen-patti-ab");
      if (!allowed) {
        return res.status(403).json({ message: "Game is disabled for this customer" });
      }

      if (!side || !["A", "B"].includes(side)) {
        return res.status(400).json({ message: "Invalid side" });
      }
      if (!Number.isFinite(betAmount) || betAmount < MIN_BET_AMOUNT) {
        return res.status(400).json({ message: `Minimum bet is ₹${MIN_BET_AMOUNT}` });
      }

      const userId = req.user.id;

      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const game = await Game.findOne({ slug: "teen-patti-ab" });
      if (!game || !game.isActive) {
        return res.status(403).json({ message: "Game is OFF" });
      }

      wallet.balance -= betAmount;

      const win = Math.random() > 0.5;
      const result = win ? "WIN" : "LOSE";
      const payout = win ? betAmount * 2 : 0;
      if (win) wallet.balance += payout;

      await wallet.save();

      const bet = await Bet.create({
        userId,
        gameId: game._id,
        gameSlug: "teen-patti-ab",
        side,
        amount: betAmount,
        result,
        payout,
      });

      res.json({
        message: result === "WIN" ? "You won" : "You lost",
        result,
        payout,
        balance: wallet.balance,
        betId: bet._id,
      });
    } catch (err) {
      console.error("TEEN PATTI BET ERROR:", err);
      res.status(500).json({ message: err.message || "Bet failed" });
    }
  }
);

/* ===============================
   ADMIN / SUPER ADMIN – VIEW ALL BETS
================================ */
router.get(
  "/all",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const bets = await Bet.find()
        .populate("userId", "name email userCode role")
        .populate("gameId", "name slug")
        .sort({ createdAt: -1 });

      res.json(bets);
    } catch (err) {
      console.error("ALL BETS ERROR:", err);
      res.json([]);
    }
  }
);

/* ===============================
   PROFIT / LOSS
================================ */
router.get(
  "/profit-loss/:type",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { type } = req.params;
      const now = new Date();

      let startDate = new Date();
      if (type === "daily") startDate.setHours(0, 0, 0, 0);
      if (type === "weekly") startDate.setDate(now.getDate() - 7);
      if (type === "monthly") startDate.setMonth(now.getMonth() - 1);

      const bets = await Bet.find({
        createdAt: { $gte: startDate },
      });

      let totalBet = 0;
      let totalWin = 0;

      bets.forEach(b => {
        totalBet += b.amount || 0;
        if (b.result === "WIN") totalWin += b.payout || 0;
      });

      res.json({
        period: type,
        totalBet,
        totalWin,
        profitLoss: totalBet - totalWin,
      });
    } catch (err) {
      console.error("PROFIT LOSS ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
