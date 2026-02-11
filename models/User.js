const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,

    userCode: String, // ✅ CL0001 / CS0001

    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN", "CLIENT", "CUSTOMER"],
      default: "CUSTOMER",
    },

    isActive: { type: Boolean, default: true },

    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    createdByClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true, // ✅ FIXES "Invalid Date"
  }
);

module.exports = mongoose.model("User", userSchema);
