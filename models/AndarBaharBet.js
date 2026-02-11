const mongoose = require("mongoose");

const andarBaharBetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    roundId: { type: String, required: true },
    side: { type: String, enum: ["ANDAR", "BAHAR"], required: true },
    amount: { type: Number, required: true },
    odds: { type: Number, default: 1.98 },
    result: { type: String, enum: ["PENDING", "WIN", "LOSE"], default: "PENDING" },
    payout: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AndarBaharBet", andarBaharBetSchema);
