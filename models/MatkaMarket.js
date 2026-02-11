const mongoose = require("mongoose");

const MatkaMarketSchema = new mongoose.Schema(
  {
    marketId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["running", "closed"], default: "running" },
    openTime: { type: String, default: "10:00 AM" },
    closeTime: { type: String, default: "05:00 PM" },
    result: { type: String, default: "" },
    roundId: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MatkaMarket", MatkaMarketSchema);
