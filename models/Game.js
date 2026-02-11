const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // 🔥 RTP CONTROL (Admin Power)
    rtp: {
      type: Number,
      default: 90, // % Return To Player
      min: 0,
      max: 100,
    },

    // 😈 FORCE RESULT (Admin Override)
    // null = normal RTP logic
    // "WIN" = force all wins
    // "LOSE" = force all losses
    forceResult: {
      type: String,
      enum: ["WIN", "LOSE", "A", "B", "ANDAR", "BAHAR", null],
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Game", gameSchema);
