const mongoose = require("mongoose");

const systemWalletSchema = new mongoose.Schema({
  key: { type: String, default: "SUPER_ADMIN" },
});

module.exports = mongoose.model("SystemWallet", systemWalletSchema);
