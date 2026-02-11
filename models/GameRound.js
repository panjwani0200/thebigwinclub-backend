const mongoose = require("mongoose");

const gameRoundSchema = new mongoose.Schema(
  {
    gameSlug: {
      type: String,
      required: true,
    },

    resultSymbol: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["BETTING", "SCRATCHING", "FINISHED"],
      default: "BETTING",
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GameRound", gameRoundSchema);
