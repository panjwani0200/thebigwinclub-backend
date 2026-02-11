const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const Wallet = require("../models/wallet");
const User = require("../models/User");
const Bet = require("../models/Bet");
const TeenPattiBet = require("../models/TeenPattiBet");
const AndarBaharBet = require("../models/AndarBaharBet");
const MatkaBet = require("../models/MatkaBet");
const Transaction = require("../models/Transaction");

// CLIENT dashboard
router.get(
  "/dashboard",
  auth,
  role([ROLES.CLIENT]),
  (req, res) => {
    res.json({
      message: "Client dashboard access 🤝",
      user: req.user,
    });
  }
);

/* ===============================
   CLIENT → MY WALLET (BALANCE)
================================ */
router.get(
  "/wallet",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      // ✅ FINAL FIX: use req.user.id
      const userId = req.user.id;

      const user = await User.findById(userId).select("email userCode role");
      const wallet = await Wallet.findOne({ userId });

      return res.json({
        userId,
        email: user?.email,
        userCode: user?.userCode,
        role: user?.role,
        balance: wallet ? wallet.balance : 0,
      });
    } catch (err) {
      console.error("FETCH CLIENT WALLET ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch wallet" });
    }
  }
);

/* ===============================
   CLIENT -> DELETE OWN CUSTOMER
================================ */
router.delete(
  "/my-customers/:customerId",
  auth,
  role([ROLES.CLIENT, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const customer = await User.findOne({
        _id: req.params.customerId,
        role: "CUSTOMER",
        createdByClient: req.user.id,
      }).select("_id");

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const userId = customer._id;

      await Promise.all([
        Wallet.deleteOne({ userId }),
        Bet.deleteMany({ userId }),
        MatkaBet.deleteMany({ userId }),
        TeenPattiBet.deleteMany({ userId }),
        AndarBaharBet.deleteMany({ userId }),
        Transaction.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
        User.deleteOne({ _id: userId, role: "CUSTOMER" }),
      ]);

      return res.json({ message: "Customer deleted", customerId: userId });
    } catch (err) {
      console.error("CLIENT DELETE CUSTOMER ERROR:", err);
      return res.status(500).json({ message: "Failed to delete customer" });
    }
  }
);

module.exports = router;
