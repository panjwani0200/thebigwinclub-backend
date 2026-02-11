const mongoose = require("mongoose");

const WithdrawLogSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    withdrawType: {
      type: String,
      enum: ["CUSTOMER", "CLIENT"],
      default: "CUSTOMER",
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      default: "SUCCESS",
    },
    customerBalanceBefore: {
      type: Number,
      default: 0,
    },
    customerBalanceAfter: {
      type: Number,
      default: 0,
    },
    clientBalanceBefore: {
      type: Number,
      required: true,
    },
    clientBalanceAfter: {
      type: Number,
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WithdrawLog", WithdrawLogSchema);
