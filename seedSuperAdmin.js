const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const ADMIN_EMAIL = "admin@bigwinclub.com";
const ADMIN_PASSWORD = "Admin@123";

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gamblingDB");

(async () => {
  try {
    console.log("Connecting to MongoDB...");
    
    // Hash the password using backend bcryptjs
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    console.log("Password hashed successfully");
    
    // Upsert admin user (create if doesn't exist, update if exists)
    const result = await User.findOneAndUpdate(
      { email: ADMIN_EMAIL },
      {
        password: hashedPassword,
        role: "ADMIN",
        name: "Admin User",
        isActive: true
      },
      { upsert: true, new: true }
    );
    
    console.log("✅ Admin password updated successfully");
    console.log("Admin user:", {
      email: result.email,
      role: result.role,
      isActive: result.isActive
    });
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
