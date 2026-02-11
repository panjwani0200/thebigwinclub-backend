const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    amount: Number,
    type: { type: String, enum: ["SEED", "TRANSFER", "WITHDRAW"] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
