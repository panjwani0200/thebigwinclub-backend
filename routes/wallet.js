const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Wallet = require("../models/wallet");

router.get("/:userId", async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const wallet = await Wallet.findOne({ userId });
    res.json(wallet || { balance: 500 });
  } catch (err) {
    console.error("WALLET ERROR:", err.message);
    res.json({ balance: 0 }); // NEVER crash UI
  }
});

module.exports = router;
