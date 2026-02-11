const mongoose = require("mongoose");

const betSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game" },
    gameSlug: String,
    roundId: String,
    side: String,
    amount: Number,
    odds: Number,
    result: { type: String, enum: ["WIN", "LOSE", "LOSS"] },
    payout: Number,
    profit: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bet", betSchema);
