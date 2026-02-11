const mongoose = require("mongoose");

const customerGameControlSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameSlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

customerGameControlSchema.index({ customerId: 1, gameSlug: 1 }, { unique: true });

module.exports = mongoose.model("CustomerGameControl", customerGameControlSchema);

