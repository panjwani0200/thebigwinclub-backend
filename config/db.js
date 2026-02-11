const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MONGO_URI is not set. Running without DB connection.");
    return false;
  }

  if (isConnected) return true;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 30,
    });

    isConnected = true;
    console.log("MongoDB connected");

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      console.error("MongoDB disconnected");
    });

    mongoose.connection.on("error", (error) => {
      console.error("MongoDB error:", error.message);
    });

    return true;
  } catch (error) {
    isConnected = false;
    console.error("MongoDB connection failed:", error.message);

    // Retry in background without crashing the app
    setTimeout(() => {
      connectDB().catch(() => {});
    }, 10000);

    return false;
  }
};

module.exports = connectDB;
