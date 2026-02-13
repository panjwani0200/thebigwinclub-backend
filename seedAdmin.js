require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const ADMIN_EMAIL = "admin@bigwinclub.com";
const ADMIN_PASSWORD = "Admin@123";

async function seedAdmin() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MONGO_URI is missing in backend/.env");
    process.exit(1);
  }

  if (!uri.startsWith("mongodb+srv://")) {
    console.error("MONGO_URI must be a MongoDB Atlas SRV URI (mongodb+srv://)");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB Connected");

    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL }).select("_id email role");
    if (existingAdmin) {
      console.log("Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await User.create({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
    });

    console.log("Admin created successfully");
  } catch (error) {
    console.error("Failed to seed admin:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // no-op
    }
    process.exit(process.exitCode || 0);
  }
}

seedAdmin();
