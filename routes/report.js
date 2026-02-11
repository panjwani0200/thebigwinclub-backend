const express = require("express");
const router = express.Router();
const Bet = require("../models/Bet");

// helper for date ranges
const getStartDate = (type) => {
  const now = new Date();
  if (type === "daily") now.setHours(0, 0, 0, 0);
  if (type === "weekly") now.setDate(now.getDate() - 7);
  if (type === "monthly") now.setMonth(now.getMonth() - 1);
  return now;
};

/* ===============================
   ADMIN PROFIT / LOSS
================================ */
router.get("/profit-loss/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const startDate = getStartDate(type);

    const bets = await Bet.find({
      createdAt: { $gte: startDate },
    });

    let totalBet = 0;
    let totalWin = 0;

    bets.forEach((b) => {
      totalBet += b.amount;
      if (b.status === "WIN") totalWin += b.winAmount;
    });

    const profitLoss = totalBet - totalWin;

    res.json({
      period: type,
      totalBet,
      totalWin,
      profitLoss,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
