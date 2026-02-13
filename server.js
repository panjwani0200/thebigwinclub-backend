const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const clientRoutes = require("./routes/client");
const customerRoutes = require("./routes/customer");
const walletRoutes = require("./routes/wallet");
const betRoutes = require("./routes/bet");
const superAdminRoutes = require("./routes/superAdmin");
const gameRoutes = require("./routes/game");
const matkaRoutes = require("./routes/matka");

const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
app.disable("x-powered-by");

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalized = String(origin).trim().replace(/\/+$/, "");
  if (allowedOrigins.length === 0) return true;

  return allowedOrigins.some((entry) => {
    if (entry === normalized) return true;
    if (entry.startsWith("*.")) {
      const root = entry.slice(2);
      return normalized.endsWith(`.${root}`) || normalized.endsWith(root);
    }
    return false;
  });
};

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." },
});

app.use(globalLimiter);
app.use("/api/auth/login", loginLimiter);

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/bet", betRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/matka", matkaRoutes);

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);

const startServer = async () => {
  await connectDB();
   // Auto-seed admin user on startup
 const bcrypt = require("bcryptjs");
 const User = require("./models/User");
 try {
 const exists = await User.findOne({ email: "admin@bigwinclub.com" });
 if (!exists) {
 const hashedPassword = await bcrypt.hash("Admin@123", 12);
 await User.create({
 email: "admin@bigwinclub.com",
 password: hashedPassword,
 role: "ADMIN",
 name: "Admin User",
 isActive: true
 });
 console.log("✅ Admin user created automatically");
 }
 } catch (err) {
 console.error("Auto-seed error:", err.message);
 }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

module.exports = app;
