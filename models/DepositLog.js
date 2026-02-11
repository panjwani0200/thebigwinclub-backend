const mongoose = require("mongoose");

const DepositLogSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    depositType: {
      type: String,
      enum: ["CUSTOMER", "CLIENT"],
      default: "CUSTOMER",
    },
    amount: { type: Number, required: true, min: 1 },
    customerBalanceBefore: { type: Number, default: 0 },
    customerBalanceAfter: { type: Number, default: 0 },
    clientBalanceBefore: { type: Number, default: 0 },
    clientBalanceAfter: { type: Number, default: 0 },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DepositLog", DepositLogSchema);
