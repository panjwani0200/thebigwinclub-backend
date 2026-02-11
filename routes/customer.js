const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Wallet = require("../models/wallet");
const Bet = require("../models/Bet");
const Transaction = require("../models/Transaction");
const WithdrawLog = require("../models/WithdrawLog");
const DepositLog = require("../models/DepositLog");

/* =================================
   CUSTOMER GAME AREA (UNCHANGED)
================================= */
router.get(
  "/play",
  auth,
  role([ROLES.CUSTOMER]),
  (req, res) => {
    res.json({
      message: "Welcome to game area 🎮",
      user: req.user,
    });
  }
);

/* =================================
   CLIENT → CREATE CUSTOMER
================================= */
router.post(
  "/create",
  auth,
  role([ROLES.CLIENT, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      const lastCustomer = await User.findOne({ role: "CUSTOMER" })
        .sort({ createdAt: -1 })
        .select("userCode");

      let next = 1;
      if (lastCustomer?.userCode) {
        next = parseInt(lastCustomer.userCode.replace("CS", "")) + 1;
      }

      const userCode = `CS${String(next).padStart(4, "0")}`;

      const hashedPassword = await bcrypt.hash(password, 10);

      const customer = await User.create({
        userCode,
        name: name || "",
        email,
        password: hashedPassword,
        role: "CUSTOMER",
        createdByClient: req.user.id,
        isActive: true,
      });

      await Wallet.create({
        userId: customer._id,
        balance: 0,
      });

      res.status(201).json({
        message: "Customer created",
        customer,
      });
    } catch (err) {
      console.error("CREATE CUSTOMER ERROR:", err);
      res.status(500).json({ message: "Customer creation failed" });
    }
  }
);

/* =================================
   CLIENT → SEED CUSTOMER  (FIRST ERROR FIXED)
================================= */
router.post(
  "/seed",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { customerCode, amount } = req.body;
      const amt = Number(amount);
      if (!customerCode || !amt || amt <= 0) {
        return res.status(400).json({ message: "Invalid amount or customer code" });
      }

      // find customer
      const customer = await User.findOne({
        userCode: customerCode,
        role: "CUSTOMER",
        createdByClient: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // find customer wallet
      const customerWallet = await Wallet.findOne({ userId: customer._id });
      if (!customerWallet) {
        return res.status(404).json({ message: "Customer wallet not found" });
      }

      // ✅ ensure client wallet exists
      const clientWallet = await Wallet.findOneAndUpdate(
        { userId: req.user.id },
        { $setOnInsert: { balance: 0 } },
        { upsert: true, new: true }
      );
      if (!clientWallet) {
        return res.status(404).json({ message: "Client wallet not found" });
      }

      if (clientWallet.balance < amt) {
        return res.status(400).json({ message: "Insufficient client balance" });
      }

      // deduct + add
      const customerBalanceBefore = customerWallet.balance;
      const clientBalanceBefore = clientWallet.balance;

      clientWallet.balance -= amt;
      customerWallet.balance += amt;

      await clientWallet.save();
      await customerWallet.save();

      await Transaction.create({
        from: req.user.id,
        to: customer._id,
        amount: amt,
        type: "SEED",
      });

      await DepositLog.create({
        customerId: customer._id,
        clientId: req.user.id,
        adminId: req.user.id,
        depositType: "CUSTOMER",
        amount: amt,
        customerBalanceBefore,
        customerBalanceAfter: customerWallet.balance,
        clientBalanceBefore,
        clientBalanceAfter: clientWallet.balance,
        note: "Client deposit to customer",
      });

      res.json({
        message: "Customer seeded successfully",
        clientBalance: clientWallet.balance,
        customerBalance: customerWallet.balance,
      });
    } catch (err) {
      console.error("SEED CUSTOMER ERROR:", err);
      res.status(500).json({ message: "Seed customer failed" });
    }
  }
);

/* =================================
   CLIENT → WITHDRAW FROM CUSTOMER
================================= */
router.post(
  "/withdraw",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { customerCode, amount } = req.body;
      const amt = Number(amount);
      if (!customerCode || !amt || amt <= 0) {
        return res.status(400).json({ message: "Invalid amount or customer code" });
      }

      const customer = await User.findOne({
        userCode: customerCode,
        role: "CUSTOMER",
        createdByClient: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customerWallet = await Wallet.findOne({ userId: customer._id });
      if (!customerWallet) {
        return res.status(404).json({ message: "Customer wallet not found" });
      }

      if (customerWallet.balance < amt) {
        return res.status(400).json({ message: "Insufficient customer balance" });
      }

      const clientWallet = await Wallet.findOneAndUpdate(
        { userId: req.user.id },
        { $setOnInsert: { balance: 0 } },
        { upsert: true, new: true }
      );

      const customerBalanceBefore = customerWallet.balance;
      const clientBalanceBefore = clientWallet.balance;

      customerWallet.balance -= amt;
      clientWallet.balance += amt;

      await customerWallet.save();
      await clientWallet.save();

      await Transaction.create({
        from: customer._id,
        to: req.user.id,
        amount: amt,
        type: "WITHDRAW",
      });

      await WithdrawLog.create({
        customerId: customer._id,
        clientId: customer.createdByClient || req.user.id,
        adminId: req.user.id,
        withdrawType: "CUSTOMER",
        amount: amt,
        status: "SUCCESS",
        customerBalanceBefore,
        customerBalanceAfter: customerWallet.balance,
        clientBalanceBefore,
        clientBalanceAfter: clientWallet.balance,
        note: "Client withdrawal from customer",
      });

      res.json({
        message: "Withdrawal successful",
        clientBalance: clientWallet.balance,
        customerBalance: customerWallet.balance,
      });
    } catch (err) {
      console.error("WITHDRAW CUSTOMER ERROR:", err);
      res.status(500).json({ message: "Withdraw failed" });
    }
  }
);

/* =================================
   CLIENT → GET ONLY MY CUSTOMERS
================================= */
router.get(
  "/deposit-logs",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const filter =
        req.user.role === ROLES.SUPER_ADMIN
          ? {}
          : { clientId: req.user.id, depositType: "CUSTOMER" };

      const logs = await DepositLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("customerId", "name userCode email")
        .populate("clientId", "userCode email")
        .populate("adminId", "userCode email");

      res.json(logs);
    } catch (err) {
      console.error("DEPOSIT LOGS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch deposit logs" });
    }
  }
);

/* =================================
   CLIENT → GET ONLY MY CUSTOMERS
================================= */
router.get(
  "/withdraw-logs",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const filter =
        req.user.role === ROLES.SUPER_ADMIN
          ? {}
          : { clientId: req.user.id };

      const logs = await WithdrawLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("customerId", "userCode email")
        .populate("clientId", "userCode email")
        .populate("adminId", "userCode email");

      res.json(logs);
    } catch (err) {
      console.error("WITHDRAW LOGS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch withdraw logs" });
    }
  }
);

/* =================================
   CLIENT → GET ONLY MY CUSTOMERS
================================= */
router.get(
  "/my-customers",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const customers = await User.find({
        role: "CUSTOMER",
        createdByClient: req.user.id,
      })
        .select("name email userCode createdAt")
        .sort({ createdAt: -1 });

      res.json(customers);
    } catch (err) {
      console.error("FETCH CUSTOMERS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  }
);

/* =================================
   CLIENT → CUSTOMER BETS (BY CODE)
================================= */
router.get(
  "/bets/:customerCode",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { customerCode } = req.params;

      const customer = await User.findOne({
        userCode: customerCode,
        role: "CUSTOMER",
        createdByClient: req.user.id,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const bets = await Bet.find({ userId: customer._id })
        .populate("gameId", "name slug")
        .sort({ createdAt: -1 });

      res.json(bets);
    } catch (err) {
      console.error("CUSTOMER BETS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch customer bets" });
    }
  }
);

module.exports = router;
