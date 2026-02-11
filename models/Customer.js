const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,

  createdByClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // client
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Customer", customerSchema);
