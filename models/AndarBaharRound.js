const mongoose = require("mongoose");

const andarBaharRoundSchema = new mongoose.Schema(
  {
    roundId: { type: String, required: true, unique: true },
    jokerCard: { type: String, required: true },
    status: { type: String, enum: ["BETTING", "CLOSED"], default: "BETTING" },
    winner: { type: String, enum: ["ANDAR", "BAHAR", null], default: null },
    dealtCards: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AndarBaharRound", andarBaharRoundSchema);
