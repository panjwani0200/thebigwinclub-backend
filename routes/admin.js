const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Wallet = require("../models/wallet");
const Transaction = require("../models/Transaction");
const Bet = require("../models/Bet");
const Game = require("../models/Game");
const WithdrawLog = require("../models/WithdrawLog");
const MatkaMarket = require("../models/MatkaMarket");
const MatkaBet = require("../models/MatkaBet");
const DepositLog = require("../models/DepositLog");
const TeenPattiBet = require("../models/TeenPattiBet");
const AndarBaharBet = require("../models/AndarBaharBet");
const CustomerGameControl = require("../models/CustomerGameControl");

const canManageCustomer = async (actor, customer) => {
  if (!customer || customer.role !== "CUSTOMER") return false;
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  if (actor.role !== ROLES.ADMIN) return false;

  const ownerClient = await User.findOne({
    _id: customer.createdByClient,
    role: "CLIENT",
  }).select("createdByAdmin");

  return !!ownerClient && String(ownerClient.createdByAdmin || "") === actor.id;
};

/* ===============================
   CREATE CLIENT (ADMIN ONLY)
================================ */
router.post(
  "/clients",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      const lastClient = await User.findOne({ role: "CLIENT" })
        .sort({ createdAt: -1 })
        .select("userCode");

      let next = 1;
      if (lastClient?.userCode) {
        next = parseInt(lastClient.userCode.replace("CL", "")) + 1;
      }

      const userCode = `CL${String(next).padStart(4, "0")}`;

      const hashedPassword = await bcrypt.hash(password, 10);

      const client = await User.create({
        userCode,
        name: name || "",
        email,
        password: hashedPassword,
        role: "CLIENT",
        createdByAdmin: req.user.id,
        isActive: true,
      });

      // 🔥 FIX: SAFE WALLET CREATE (NO DUPLICATES)
      await Wallet.findOneAndUpdate(
        { userId: client._id },
        { $setOnInsert: { balance: 0 } },
        { upsert: true, new: true }
      );

      res.status(201).json({
        message: "Client created",
        client,
      });
    } catch (err) {
      console.error("CREATE CLIENT ERROR:", err);
      res.status(500).json({ message: "Client creation failed" });
    }
  }
);

/* ===============================
   VIEW OWN CLIENTS (ADMIN)
================================ */
router.get(
  "/clients",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const clients = await User.find({
        role: "CLIENT",
        createdByAdmin: req.user.id,
      })
        .select("name email userCode createdAt")
        .sort({ createdAt: -1 });

      res.json(clients);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  }
);

/* ===============================
   DELETE CLIENT (ADMIN)
================================ */
router.delete(
  "/clients/:clientId",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const client = await User.findOne({
        _id: req.params.clientId,
        role: "CLIENT",
      });
      if (!client) return res.status(404).json({ message: "Client not found" });

      if (
        req.user.role === ROLES.ADMIN &&
        String(client.createdByAdmin || "") !== req.user.id
      ) {
        return res.status(403).json({ message: "Unauthorized client access" });
      }

      const customerIds = await User.find({
        role: "CUSTOMER",
        createdByClient: client._id,
      }).distinct("_id");

      const userIds = [client._id, ...customerIds];

      await Promise.all([
        Wallet.deleteMany({ userId: { $in: userIds } }),
        Bet.deleteMany({ userId: { $in: userIds } }),
        MatkaBet.deleteMany({ userId: { $in: userIds } }),
        TeenPattiBet.deleteMany({ userId: { $in: userIds } }),
        AndarBaharBet.deleteMany({ userId: { $in: userIds } }),
        Transaction.deleteMany({
          $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }],
        }),
        User.deleteMany({ _id: { $in: customerIds }, role: "CUSTOMER" }),
      ]);

      await User.deleteOne({ _id: client._id, role: "CLIENT" });

      res.json({
        message: "Client deleted",
        clientId: client._id,
        deletedCustomers: customerIds.length,
      });
    } catch (err) {
      console.error("DELETE CLIENT ERROR:", err);
      res.status(500).json({ message: "Failed to delete client" });
    }
  }
);

/* ===============================
   VIEW ALL CUSTOMERS + OWNER (ADMIN)
================================ */
router.get(
  "/customers",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const customers = await User.find({ role: "CUSTOMER" })
        .select("name email userCode createdByClient createdAt")
        .populate("createdByClient", "email userCode");

      res.json(customers);
    } catch (err) {
      console.error("FETCH CUSTOMERS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  }
);

/* ===============================
   DELETE CUSTOMER (ADMIN)
================================ */
router.delete(
  "/customers/:customerId",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const customer = await User.findOne({
        _id: req.params.customerId,
        role: "CUSTOMER",
      }).select("_id createdByClient");
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      if (req.user.role === ROLES.ADMIN) {
        const ownerClient = await User.findOne({
          _id: customer.createdByClient,
          role: "CLIENT",
        }).select("createdByAdmin");

        if (!ownerClient || String(ownerClient.createdByAdmin || "") !== req.user.id) {
          return res.status(403).json({ message: "Unauthorized customer access" });
        }
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

      res.json({ message: "Customer deleted", customerId: userId });
    } catch (err) {
      console.error("DELETE CUSTOMER ERROR:", err);
      res.status(500).json({ message: "Failed to delete customer" });
    }
  }
);

/* ===============================
   ADMIN → CLIENT SEED
================================ */
router.post(
  "/withdraw-client",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { clientCode, clientId, amount } = req.body;
      const amt = Number(amount);
      if (!amt || amt <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      let client = null;
      if (clientId) {
        client = await User.findOne({ _id: clientId, role: "CLIENT" });
      } else if (clientCode) {
        client = await User.findOne({ userCode: clientCode, role: "CLIENT" });
      }

      if (!client) return res.status(404).json({ message: "Client not found" });

      if (req.user.role === ROLES.ADMIN && client.createdByAdmin?.toString() !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized client access" });
      }

      const clientWallet = await Wallet.findOne({ userId: client._id });
      if (!clientWallet) return res.status(404).json({ message: "Client wallet not found" });
      if (clientWallet.balance < amt) {
        return res.status(400).json({ message: "Insufficient client balance" });
      }

      const adminWallet = await Wallet.findOneAndUpdate(
        { userId: req.user.id },
        { $setOnInsert: { balance: 0 } },
        { upsert: true, new: true }
      );

      const clientBalanceBefore = clientWallet.balance;
      const adminBalanceBefore = adminWallet.balance;

      clientWallet.balance -= amt;
      adminWallet.balance += amt;

      await clientWallet.save();
      await adminWallet.save();

      await Transaction.create({
        from: client._id,
        to: req.user.id,
        amount: amt,
        type: "WITHDRAW",
      });

      await WithdrawLog.create({
        customerId: null,
        clientId: client._id,
        adminId: req.user.id,
        withdrawType: "CLIENT",
        amount: amt,
        status: "SUCCESS",
        customerBalanceBefore: 0,
        customerBalanceAfter: 0,
        clientBalanceBefore,
        clientBalanceAfter: clientWallet.balance,
        note: "Admin withdrawal from client",
      });

      res.json({
        message: "Client withdrawal successful",
        clientBalance: clientWallet.balance,
        adminBalance: adminWallet.balance,
      });
    } catch (e) {
      console.error("ADMIN WITHDRAW CLIENT ERROR:", e);
      res.status(500).json({ message: "Withdraw failed" });
    }
  }
);

router.get(
  "/withdraw-logs",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { clientCode } = req.query;
      let filter = {};

      if (clientCode) {
        const client = await User.findOne({ userCode: clientCode, role: "CLIENT" });
        if (!client) return res.status(404).json({ message: "Client not found" });
        if (req.user.role === ROLES.ADMIN && client.createdByAdmin?.toString() !== req.user.id) {
          return res.status(403).json({ message: "Unauthorized client access" });
        }
        filter.clientId = client._id;
      } else if (req.user.role === ROLES.ADMIN) {
        const clientIds = await User.find({
          role: "CLIENT",
          createdByAdmin: req.user.id,
        }).distinct("_id");
        filter.clientId = { $in: clientIds };
      }

      const logs = await WithdrawLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("customerId", "userCode email")
        .populate("clientId", "userCode email")
        .populate("adminId", "userCode email");

      res.json(logs);
    } catch (err) {
      console.error("ADMIN WITHDRAW LOGS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch withdraw logs" });
    }
  }
);

router.post(
  "/seed",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { clientCode, clientId, amount } = req.body;
      const amt = Number(amount);

      let client = null;
      if (clientId) {
        client = await User.findOne({ _id: clientId, role: "CLIENT" });
      } else if (clientCode) {
        client = await User.findOne({ userCode: clientCode, role: "CLIENT" });
      }

      if (!client) return res.status(404).json({ message: "Client not found" });

      const wallet = await Wallet.findOneAndUpdate(
        { userId: client._id },
        { $inc: { balance: amt } },
        { new: true, upsert: true }
      );

      await DepositLog.create({
        customerId: null,
        clientId: client._id,
        adminId: req.user.id,
        depositType: "CLIENT",
        amount: amt,
        customerBalanceBefore: 0,
        customerBalanceAfter: 0,
        clientBalanceBefore: wallet.balance - amt,
        clientBalanceAfter: wallet.balance,
        note: "Admin deposit to client",
      });

      res.json({
        message: "Seed successful",
        userId: client._id,
        userCode: client.userCode,
        email: client.email,
        balance: wallet.balance,
      });
    } catch (e) {
      console.error("ADMIN SEED ERROR:", e);
      res.status(500).json({ message: "Seed failed" });
    }
  }
);

/* ===============================
   VIEW CLIENT BETS
================================ */
router.get(
  "/clients/:clientId/bets",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const bets = await Bet.find({ userId: req.params.clientId })
        .populate("gameId", "name")
        .sort({ createdAt: -1 });

      res.json(bets);
    } catch (err) {
      console.error("CLIENT BETS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch bets" });
    }
  }
);

router.post(
  "/game/rtp",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { slug, rtp, forceResult } = req.body;

      let game = await Game.findOne({ slug });
      if (!game && slug) {
        const name = String(slug)
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        game = await Game.create({ name, slug, isActive: true });
      }
      if (!game) return res.status(404).json({ message: "Game not found" });

      if (rtp !== undefined) game.rtp = rtp;
      if (forceResult !== undefined) game.forceResult = forceResult;

      await game.save();

      res.json({
        message: "Game control updated",
        rtp: game.rtp,
        forceResult: game.forceResult,
      });
    } catch (err) {
      res.status(500).json({ message: "RTP update failed" });
    }
  }
);

/* ===============================
   ADMIN → MATKA MARKETS
================================ */
router.get(
  "/matka/markets",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const markets = await MatkaMarket.find({}).sort({ name: 1 });
      res.json(markets);
    } catch (err) {
      console.error("ADMIN MATKA MARKETS ERROR:", err);
      res.status(500).json({ message: "Failed to load markets" });
    }
  }
);

/* ===============================
   ADMIN → MATKA RESULT DECLARE
================================ */
router.post(
  "/matka/results",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { marketId, result } = req.body;
      if (!marketId || !result) {
        return res.status(400).json({ message: "Market and result required" });
      }

      const format = /^\d{3}-\d{2}-\d{3}$/;
      if (!format.test(result)) {
        return res.status(400).json({ message: "Invalid result format" });
      }

      const market = await MatkaMarket.findOne({ marketId });
      if (!market) return res.status(404).json({ message: "Market not found" });

      market.result = result;
      market.status = "closed";
      if (!market.roundId) {
        market.roundId = `MK${Date.now()}${Math.floor(Math.random() * 1000)}`;
      }
      await market.save();

      const [openPatti, , closePatti] = result.split("-");
      const openAnk = String(
        openPatti.split("").reduce((sum, d) => sum + Number(d), 0) % 10
      );
      const closeAnk = String(
        closePatti.split("").reduce((sum, d) => sum + Number(d), 0) % 10
      );

      const pending = await MatkaBet.find({
        marketId,
        status: "PENDING",
      });

      for (const bet of pending) {
        let isWin = false;
        if (bet.betType === "SINGLE_ANK") {
          isWin =
            (bet.session === "OPEN" && bet.number === openAnk) ||
            (bet.session === "CLOSE" && bet.number === closeAnk);
        } else if (bet.betType === "JODI") {
          const jodi = `${openAnk}${closeAnk}`;
          isWin = bet.number === jodi;
        } else {
          isWin =
            (bet.session === "OPEN" && bet.number === openPatti) ||
            (bet.session === "CLOSE" && bet.number === closePatti);
        }

        if (isWin) {
          const payout = Number((bet.amount * 9.5).toFixed(2));
          bet.status = "WIN";
          bet.payout = payout;
          const wallet = await Wallet.findOne({ userId: bet.userId });
          if (wallet) {
            wallet.balance += payout;
            await wallet.save();
          }
        } else {
          bet.status = "LOSE";
          bet.payout = 0;
        }
        await bet.save();
      }

      res.json({ message: "Result declared", processed: pending.length });
    } catch (err) {
      console.error("ADMIN MATKA RESULT ERROR:", err);
      res.status(500).json({ message: "Failed to declare result" });
    }
  }
);

/* ===============================
   ADMIN → MATKA OPEN NEW ROUND
================================ */
router.post(
  "/matka/markets/:marketId/open",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const market = await MatkaMarket.findOne({ marketId: req.params.marketId });
      if (!market) return res.status(404).json({ message: "Market not found" });

      market.status = "running";
      market.result = "";
      market.roundId = `MK${Date.now()}${Math.floor(Math.random() * 1000)}`;
      await market.save();

      res.json({ message: "Market opened", market });
    } catch (err) {
      console.error("ADMIN MATKA OPEN ERROR:", err);
      res.status(500).json({ message: "Failed to open market" });
    }
  }
);

/* ===============================
   ADMIN → MATKA CLOSE MARKET
================================ */
router.post(
  "/matka/markets/:marketId/close",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const market = await MatkaMarket.findOne({ marketId: req.params.marketId });
      if (!market) return res.status(404).json({ message: "Market not found" });

      market.status = "closed";
      await market.save();

      res.json({ message: "Market closed", market });
    } catch (err) {
      console.error("ADMIN MATKA CLOSE ERROR:", err);
      res.status(500).json({ message: "Failed to close market" });
    }
  }
);

/* ===============================
   ADMIN → DEPOSIT LOGS
================================ */
router.get(
  "/deposit-logs",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { clientCode } = req.query;
      let filter = {};

      if (clientCode) {
        const client = await User.findOne({ userCode: clientCode, role: "CLIENT" });
        if (!client) return res.status(404).json({ message: "Client not found" });
        if (req.user.role === ROLES.ADMIN && client.createdByAdmin?.toString() !== req.user.id) {
          return res.status(403).json({ message: "Unauthorized client access" });
        }
        filter.clientId = client._id;
      } else if (req.user.role === ROLES.ADMIN) {
        const clientIds = await User.find({
          role: "CLIENT",
          createdByAdmin: req.user.id,
        }).distinct("_id");
        filter.clientId = { $in: clientIds };
      }

      const logs = await DepositLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("customerId", "name userCode email")
        .populate("clientId", "userCode email")
        .populate("adminId", "userCode email");

      res.json(logs);
    } catch (err) {
      console.error("ADMIN DEPOSIT LOGS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch deposit logs" });
    }
  }
);

/* ===============================
   PERSONAL GAME CONTROL - CUSTOMER SEARCH
================================ */
router.get(
  "/personal-game-control/customers",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const query = { role: "CUSTOMER" };

      if (q) {
        query.$or = [
          { userCode: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
        ];
      }

      if (req.user.role === ROLES.ADMIN) {
        const clientIds = await User.find({
          role: "CLIENT",
          createdByAdmin: req.user.id,
        }).distinct("_id");
        query.createdByClient = { $in: clientIds };
      }

      const customers = await User.find(query)
        .select("name email userCode createdByClient")
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("createdByClient", "name email userCode");

      res.json(customers);
    } catch (err) {
      console.error("PERSONAL GAME CONTROL SEARCH ERROR:", err);
      res.status(500).json({ message: "Failed to search customers" });
    }
  }
);

/* ===============================
   PERSONAL GAME CONTROL - GET CUSTOMER
================================ */
router.get(
  "/personal-game-control/:customerId",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const customer = await User.findById(req.params.customerId).select(
        "name email userCode role createdByClient"
      );
      const allowed = await canManageCustomer(req.user, customer);
      if (!allowed) return res.status(404).json({ message: "Customer not found" });

      const controls = await CustomerGameControl.find({
        customerId: customer._id,
      }).select("gameSlug isEnabled updatedAt");
      res.json({ customer, controls });
    } catch (err) {
      console.error("PERSONAL GAME CONTROL FETCH ERROR:", err);
      res.status(500).json({ message: "Failed to load customer game control" });
    }
  }
);

/* ===============================
   PERSONAL GAME CONTROL - UPDATE
================================ */
router.patch(
  "/personal-game-control/:customerId",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { gameSlug, isEnabled } = req.body;
      if (!gameSlug || typeof isEnabled !== "boolean") {
        return res.status(400).json({ message: "gameSlug and isEnabled are required" });
      }

      const customer = await User.findById(req.params.customerId).select(
        "_id role createdByClient"
      );
      const allowed = await canManageCustomer(req.user, customer);
      if (!allowed) return res.status(404).json({ message: "Customer not found" });

      const game = await Game.findOne({ slug: String(gameSlug).toLowerCase().trim() }).select(
        "_id slug"
      );
      if (!game) return res.status(404).json({ message: "Game not found" });

      const control = await CustomerGameControl.findOneAndUpdate(
        { customerId: customer._id, gameSlug: game.slug },
        {
          $set: {
            isEnabled,
            updatedBy: req.user.id,
          },
        },
        { upsert: true, new: true }
      );

      res.json({
        message: "Customer game control updated",
        control,
      });
    } catch (err) {
      console.error("PERSONAL GAME CONTROL UPDATE ERROR:", err);
      res.status(500).json({ message: "Failed to update customer game control" });
    }
  }
);
module.exports = router;
