const mongoose = require("mongoose");

const MatkaBetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    marketId: { type: String, required: true },
    roundId: { type: String, default: "" },
    betType: {
      type: String,
      enum: ["SINGLE_ANK", "SINGLE_PATTI", "DOUBLE_PATTI", "TRIPLE_PATTI", "JODI"],
      required: true,
    },
    number: { type: String, required: true },
    session: { type: String, enum: ["OPEN", "CLOSE"], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "WIN", "LOSE"], default: "PENDING" },
    payout: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MatkaBet", MatkaBetSchema);
