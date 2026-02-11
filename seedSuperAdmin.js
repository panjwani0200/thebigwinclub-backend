const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

mongoose.connect("mongodb://127.0.0.1:27017/gamblingDB");

(async () => {
  const password = await bcrypt.hash("123456", 10);

  await User.deleteMany({ role: "SUPER_ADMIN" });

  await User.create({
    name: "Super Admin",
    email: "superadmin@bigwinclub.com",
    password,
    role: "SUPER_ADMIN",
    isActive: true
  });

  console.log("✅ Super Admin created");
  process.exit();
})();
