const mongoose = require("mongoose");

const teenPattiRoundSchema = new mongoose.Schema(
  {
    roundId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    winner: { type: String, enum: ["A", "B", null], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeenPattiRound", teenPattiRoundSchema);
