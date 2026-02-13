const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const User = require("../models/User");
const auth = require("../middlewares/authMiddleware");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ===============================
   LOGIN
================================ */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = String(email || "").trim();
    const plainPassword = String(password || "");

    if (!identifier || !plainPassword) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    let user = await User.findOne({
      $or: [{ email: identifier }, { userCode: identifier }],
    });

    // Case-insensitive fallback for legacy email casing mismatches
    if (!user && identifier.includes("@")) {
      user = await User.findOne({ email: new RegExp(`^${escapeRegExp(identifier)}$`, "i") });
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    let isMatch = false;
    const storedPassword = String(user.password || "");

    if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
      isMatch = await bcrypt.compare(plainPassword, storedPassword);
    } else {
      // Legacy fallback: migrate plain text password to bcrypt on successful login.
      isMatch = storedPassword === plainPassword;
      if (isMatch) {
        user.password = await bcrypt.hash(plainPassword, 10);
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.json({
      token,
      role: user.role,
      userId: user._id,
    });
  } catch (err) {
    console.error("LOGIN ERROR FULL >>>", err);
    return res.status(500).json({
      message: err.message,
    });
  }
});

/* ===============================
   CREATE USER
================================ */
router.post("/create-user", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      role,
    });

    return res.json({
      message: "User created",
      userId: user._id,
      role: user.role,
    });
  } catch (err) {
    console.error("CREATE USER ERROR:", err);
    return res.status(500).json({ message: err.message });
  }
});

/* ===============================
   ME (PROFILE)
================================ */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name email userCode role");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("AUTH ME ERROR:", err);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

/* ===============================
   CHANGE PASSWORD (LOGGED-IN USER)
================================ */
router.post("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({ message: "Failed to update password" });
  }
});

module.exports = router;
