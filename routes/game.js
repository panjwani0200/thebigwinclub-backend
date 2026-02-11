const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const Game = require("../models/Game");
const GameRound = require("../models/GameRound");
const TeenPattiRound = require("../models/TeenPattiRound");
const TeenPattiBet = require("../models/TeenPattiBet");
const AndarBaharRound = require("../models/AndarBaharRound");
const AndarBaharBet = require("../models/AndarBaharBet");
const Wallet = require("../models/wallet");
const Bet = require("../models/Bet");
const CustomerGameControl = require("../models/CustomerGameControl");

const MIN_BET_AMOUNT = 50;

const optionalUserFromToken = async (req) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

const isCustomerGameEnabled = async (customerId, gameSlug) => {
  const control = await CustomerGameControl.findOne({
    customerId,
    gameSlug: String(gameSlug || "").toLowerCase(),
  }).select("isEnabled");
  return control ? !!control.isEnabled : true;
};

const settleAndarBahar = async (roundId, winnerOverride = null) => {
  const round = await AndarBaharRound.findOne({ roundId, status: "BETTING" });
  if (!round) return null;

  const game = await Game.findOne({ slug: "andar-bahar" });
  const forced = game?.forceResult;
  let finalWinner = ["ANDAR", "BAHAR"].includes(winnerOverride) ? winnerOverride : null;
  if (forced === "ANDAR" || forced === "BAHAR") finalWinner = forced;
  if (!finalWinner) finalWinner = Math.random() > 0.5 ? "ANDAR" : "BAHAR";

  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["H", "D", "C", "S"];
  const jokerRank = round.jokerCard.slice(0, -1);
  const deck = [];
  for (const r of ranks) {
    for (const s of suits) {
      const card = `${r}${s}`;
      if (card !== round.jokerCard) deck.push(card);
    }
  }

  const matching = deck.filter((c) => c.startsWith(jokerRank));
  const nonMatching = deck.filter((c) => !c.startsWith(jokerRank));

  const dealt = [];
  // UI requirement: exactly one card on ANDAR and one card on BAHAR.
  // Index parity in UI: even -> ANDAR, odd -> BAHAR.
  const matchCard = matching[0] || deck[0];
  const nonMatchCard = nonMatching[0] || deck[1] || deck[0];
  if (finalWinner === "ANDAR") {
    dealt.push(matchCard, nonMatchCard); // ANDAR(match), BAHAR(non-match)
  } else {
    dealt.push(nonMatchCard, matchCard); // ANDAR(non-match), BAHAR(match)
  }

  round.dealtCards = dealt;
  round.winner = finalWinner;
  round.status = "CLOSED";
  await round.save();

  const bets = await AndarBaharBet.find({ roundId });
  for (const b of bets) {
    const isWin = b.side === finalWinner;
    const payout = isWin ? Number((b.amount * 1.98).toFixed(2)) : 0;
    b.result = isWin ? "WIN" : "LOSE";
    b.payout = payout;
    await b.save();

    const wallet = await Wallet.findOne({ userId: b.userId });
    if (wallet && payout > 0) {
      wallet.balance += payout;
      await wallet.save();
    }

        if (game) {
          await Bet.create({
            userId: b.userId,
            gameId: game._id,
            gameSlug: "andar-bahar",
            roundId,
            side: b.side,
            amount: b.amount,
            odds: 1.98,
            result: b.result,
            payout: b.payout,
            profit: b.result === "WIN" ? b.payout - b.amount : -b.amount,
          });
        }
  }

  return { roundId, winner: finalWinner, status: "CLOSED", dealtCards: dealt };
};

/* ===============================
   GET ALL GAMES (PUBLIC / CUSTOMER)
================================ */
router.get("/", async (req, res) => {
  try {
    let games = await Game.find();

    const ensureGame = async (name, slug) => {
      let game = games.find((g) => g.slug === slug);
      if (!game) {
        game = await Game.create({ name, slug, isActive: true });
        games = [...games, game];
      }
    };

    // Seed defaults if missing
    await ensureGame("Pappu Playing Pictures", "pappu-playing-pictures");
    await ensureGame("20-20 Live Teen Patti", "teen-patti-ab");
    await ensureGame("Andar Bahar", "andar-bahar");

    const user = await optionalUserFromToken(req);
    if (user?.role === ROLES.CUSTOMER) {
      const enabledGames = [];
      for (const g of games) {
        const allowed = await isCustomerGameEnabled(user.id, g.slug);
        if (allowed) enabledGames.push(g);
      }
      return res.json(enabledGames);
    }

    res.json(games);
  } catch (err) {
    console.error("GET GAMES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===============================
   CREATE GAME (ADMIN ONLY – ONE TIME)
================================ */
router.post(
  "/create",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Game name required" });
      }

      const slug = name
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^\w-]+/g, "");

      const exists = await Game.findOne({ slug });
      if (exists) {
        return res.status(400).json({ message: "Game already exists" });
      }

      const game = await Game.create({
        name,
        slug,
        isActive: true,
      });

      res.json(game);
    } catch (err) {
      console.error("CREATE GAME ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ===============================
   TOGGLE GAME ON / OFF (ADMIN)
================================ */
router.post(
  "/toggle/:id",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const game = await Game.findById(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      if (!game.slug) {
        if (!game.name) {
          return res.status(400).json({ message: "Game slug missing" });
        }
        game.slug = game.name
          .toLowerCase()
          .replace(/ /g, "-")
          .replace(/[^\w-]+/g, "");
      }

      game.isActive = !game.isActive;
      await game.save();

      res.json({
        message: "Game status updated",
        isActive: game.isActive,
      });
    } catch (err) {
      console.error("TOGGLE GAME ERROR:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ===============================
   PAPPU GAME → START ROUND (CUSTOMER)
   🔥 RTP + FORCE RESULT LOGIC
================================ */
router.post(
  "/pappu/start",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const allowed = await isCustomerGameEnabled(req.user.id, "pappu-playing-pictures");
      if (!allowed) {
        return res.status(403).json({ message: "Game is disabled for this customer" });
      }

      const game = await Game.findOne({
        slug: "pappu-playing-pictures",
        isActive: true,
      });

      if (!game) {
        return res.status(403).json({ message: "Game is OFF" });
      }

      const symbols = [
        "cow",
        "football",
        "diya",
        "rose",
        "butterfly",
        "rabbit",
        "umbrella",
        "kabutar",
        "bucket",
        "joker",
        "star",
        "coin",
      ];

      // 🎯 RTP DECISION
      let allowWin = Math.random() * 100 <= game.rtp;

      // 😈 FORCE OVERRIDE
      if (game.forceResult === "WIN") allowWin = true;
      if (game.forceResult === "LOSE") allowWin = false;

      // Result symbol (actual match/mismatch handled in bet logic)
      const resultSymbol =
        symbols[Math.floor(Math.random() * symbols.length)];

      const round = await GameRound.create({
        gameSlug: "pappu-playing-pictures",
        resultSymbol,
        allowWin, // future-proofing / audits
      });

      res.json({
        roundId: round._id,
        message: "Round started",
      });
    } catch (err) {
      console.error("PAPPU START ERROR:", err);
      res.status(500).json({ message: "Failed to start round" });
    }
  }
);

/* ===============================
   ANDAR BAHAR → START ROUND
================================ */
router.post(
  "/andarbahar/start",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      if (req.user.role === ROLES.CUSTOMER) {
        const allowed = await isCustomerGameEnabled(req.user.id, "andar-bahar");
        if (!allowed) {
          return res.status(403).json({ message: "Game is disabled for this customer" });
        }
      }

      await AndarBaharRound.updateMany(
        { status: "BETTING" },
        { $set: { status: "CLOSED" } }
      );

      const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
      const suits = ["H", "D", "C", "S"];
      const jokerRank = ranks[Math.floor(Math.random() * ranks.length)];
      const jokerSuit = suits[Math.floor(Math.random() * suits.length)];
      const jokerCard = `${jokerRank}${jokerSuit}`;

      const ts = new Date();
      const roundId = `AB${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
        ts.getDate()
      ).padStart(2, "0")}${String(ts.getHours()).padStart(2, "0")}${String(
        ts.getMinutes()
      ).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;

      const round = await AndarBaharRound.create({
        roundId,
        jokerCard,
        status: "BETTING",
      });

      res.json({ roundId: round.roundId, jokerCard: round.jokerCard, status: round.status });
    } catch (err) {
      console.error("ANDAR BAHAR START ERROR:", err);
      res.status(500).json({ message: "Failed to start round" });
    }
  }
);

/* ===============================
   ANDAR BAHAR → PLACE BET
================================ */
router.post(
  "/andarbahar/bet",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const allowed = await isCustomerGameEnabled(req.user.id, "andar-bahar");
      if (!allowed) {
        return res.status(403).json({ message: "Game is disabled for this customer" });
      }

      const { roundId, side, amount } = req.body;
      const betAmount = Number(amount);

      if (!roundId || !["ANDAR", "BAHAR"].includes(side)) {
        return res.status(400).json({ message: "Invalid round or side" });
      }
      if (!Number.isFinite(betAmount) || betAmount < MIN_BET_AMOUNT) {
        return res.status(400).json({ message: `Minimum bet is ₹${MIN_BET_AMOUNT}` });
      }

      const round = await AndarBaharRound.findOne({ roundId, status: "BETTING" });
      if (!round) return res.status(404).json({ message: "Round not open" });

      const existing = await AndarBaharBet.findOne({
        userId: req.user.id,
        roundId,
      });
      if (existing) return res.status(400).json({ message: "Bet already placed" });

      const wallet = await Wallet.findOne({ userId: req.user.id });
      if (!wallet || wallet.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      wallet.balance -= betAmount;
      await wallet.save();

      const bet = await AndarBaharBet.create({
        userId: req.user.id,
        roundId,
        side,
        amount: betAmount,
        odds: 1.98,
      });

      // Auto-resolve for normal flow (admin can still force via Game.forceResult)
      const resolved = await settleAndarBahar(roundId, null);
      res.json({ betId: bet._id, status: resolved ? "CLOSED" : "LOCKED" });
    } catch (err) {
      console.error("ANDAR BAHAR BET ERROR:", err);
      res.status(500).json({ message: "Bet failed" });
    }
  }
);

/* ===============================
   ANDAR BAHAR → DECLARE RESULT (ADMIN/SYSTEM)
================================ */
router.post(
  "/andarbahar/result",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const { roundId, winner } = req.body;
      const resolved = await settleAndarBahar(roundId, winner);
      if (!resolved) return res.status(404).json({ message: "Round not open" });
      res.json(resolved);
    } catch (err) {
      console.error("ANDAR BAHAR RESULT ERROR:", err);
      res.status(500).json({ message: "Failed to declare result" });
    }
  }
);

/* ===============================
   ANDAR BAHAR → ROUND STATUS
================================ */
router.get(
  "/andarbahar/round/:roundId",
  auth,
  role([ROLES.CUSTOMER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const round = await AndarBaharRound.findOne({ roundId: req.params.roundId });
      if (!round) return res.status(404).json({ message: "Round not found" });
      res.json({
        roundId: round.roundId,
        status: round.status,
        winner: round.winner,
        jokerCard: round.jokerCard,
        dealtCards: round.dealtCards || []
      });
    } catch (err) {
      console.error("ANDAR BAHAR ROUND ERROR:", err);
      res.status(500).json({ message: "Failed to fetch round" });
    }
  }
);

/* ===============================
   ANDAR BAHAR → HISTORY
================================ */
router.get("/andarbahar/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const rounds = await AndarBaharRound.find({ status: "CLOSED" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("roundId jokerCard winner createdAt");
    res.json(rounds);
  } catch (err) {
    console.error("ANDAR BAHAR HISTORY ERROR:", err);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});

/* ===============================
   TEEN PATTI A/B → START ROUND
================================ */
router.post(
  "/teenpatti-ab/start",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      if (req.user.role === ROLES.CUSTOMER) {
        const allowed = await isCustomerGameEnabled(req.user.id, "teen-patti-ab");
        if (!allowed) {
          return res.status(403).json({ message: "Game is disabled for this customer" });
        }
      }

      await TeenPattiRound.updateMany(
        { status: "OPEN" },
        { $set: { status: "CLOSED" } }
      );

      const ts = new Date();
      const roundId = `TP${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
        ts.getDate()
      ).padStart(2, "0")}${String(ts.getHours()).padStart(2, "0")}${String(
        ts.getMinutes()
      ).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;

      const round = await TeenPattiRound.create({
        roundId,
        status: "OPEN",
      });

      res.json({ roundId: round.roundId, status: round.status });
    } catch (err) {
      console.error("TEEN PATTI START ERROR:", err);
      res.status(500).json({ message: "Failed to start round" });
    }
  }
);

/* ===============================
   TEEN PATTI A/B → PLACE BET
================================ */
router.post(
  "/teenpatti-ab/bet",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const allowed = await isCustomerGameEnabled(req.user.id, "teen-patti-ab");
      if (!allowed) {
        return res.status(403).json({ message: "Game is disabled for this customer" });
      }

      const { roundId, side, amount } = req.body;
      const betAmount = Number(amount);

      if (!roundId || !["A", "B"].includes(side)) {
        return res.status(400).json({ message: "Invalid round or side" });
      }
      if (!Number.isFinite(betAmount) || betAmount < MIN_BET_AMOUNT) {
        return res.status(400).json({ message: `Minimum bet is ₹${MIN_BET_AMOUNT}` });
      }

      const round = await TeenPattiRound.findOne({ roundId, status: "OPEN" });
      if (!round) return res.status(404).json({ message: "Round not open" });

      const existing = await TeenPattiBet.findOne({
        userId: req.user.id,
        roundId,
      });
      if (existing) {
        return res.status(400).json({ message: "Bet already placed" });
      }

      const wallet = await Wallet.findOne({ userId: req.user.id });
      if (!wallet || wallet.balance < betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      wallet.balance -= betAmount;
      await wallet.save();

      const bet = await TeenPattiBet.create({
        userId: req.user.id,
        roundId,
        side,
        amount: betAmount,
        odds: 1.98,
      });

      // Auto-declare result after first bet for fast flow
      const game = await Game.findOne({ slug: "teen-patti-ab" });
      const forced = game?.forceResult;
      const winner = forced === "A" || forced === "B" ? forced : (Math.random() > 0.5 ? "A" : "B");

      round.winner = winner;
      round.status = "CLOSED";
      await round.save();

      const bets = await TeenPattiBet.find({ roundId });
      for (const b of bets) {
        const isWin = b.side === winner;
        const payout = isWin ? Number((b.amount * 1.98).toFixed(2)) : 0;
        b.result = isWin ? "WIN" : "LOSE";
        b.payout = payout;
        await b.save();

        const wallet = await Wallet.findOne({ userId: b.userId });
        if (wallet && payout > 0) {
          wallet.balance += payout;
          await wallet.save();
        }

        if (game) {
          await Bet.create({
            userId: b.userId,
            gameId: game._id,
            gameSlug: "teen-patti-ab",
            roundId,
            side: b.side,
            amount: b.amount,
            odds: 1.98,
            result: b.result,
            payout: b.payout,
            profit: b.result === "WIN" ? b.payout - b.amount : -b.amount,
          });
        }
      }

      res.json({ betId: bet._id, status: "CLOSED", winner });
    } catch (err) {
      console.error("TEEN PATTI BET ERROR:", err);
      res.status(500).json({ message: "Bet failed" });
    }
  }
);

/* ===============================
   TEEN PATTI A/B → DECLARE RESULT (ADMIN)
================================ */
router.post(
  "/teenpatti-ab/result",
  auth,
  role([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { roundId, winner } = req.body;
      const round = await TeenPattiRound.findOne({ roundId, status: "OPEN" });
      if (!round) return res.status(404).json({ message: "Round not open" });

      const game = await Game.findOne({ slug: "teen-patti-ab" });
      const forced = game?.forceResult;
      const finalWinner = forced === "A" || forced === "B" ? forced : winner;

      if (!finalWinner || !["A", "B"].includes(finalWinner)) {
        return res.status(400).json({ message: "Invalid winner" });
      }

      round.winner = finalWinner;
      round.status = "CLOSED";
      await round.save();

      const bets = await TeenPattiBet.find({ roundId });
      for (const b of bets) {
        const isWin = b.side === finalWinner;
        const payout = isWin ? Number((b.amount * 1.98).toFixed(2)) : 0;
        b.result = isWin ? "WIN" : "LOSE";
        b.payout = payout;
        await b.save();

        const wallet = await Wallet.findOne({ userId: b.userId });
        if (wallet && payout > 0) {
          wallet.balance += payout;
          await wallet.save();
        }

        if (game) {
          await Bet.create({
            userId: b.userId,
            gameId: game._id,
            gameSlug: "teen-patti-ab",
            roundId,
            side: b.side,
            amount: b.amount,
            odds: 1.98,
            result: b.result,
            payout: b.payout,
          });
        }
      }

      res.json({ roundId, winner: finalWinner, status: "CLOSED" });
    } catch (err) {
      console.error("TEEN PATTI RESULT ERROR:", err);
      res.status(500).json({ message: "Failed to declare result" });
    }
  }
);

/* ===============================
   TEEN PATTI A/B → ROUND STATUS
================================ */
router.get(
  "/teenpatti-ab/round/:roundId",
  auth,
  role([ROLES.CUSTOMER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const round = await TeenPattiRound.findOne({ roundId: req.params.roundId });
      if (!round) return res.status(404).json({ message: "Round not found" });
      res.json({ roundId: round.roundId, status: round.status, winner: round.winner });
    } catch (err) {
      console.error("TEEN PATTI ROUND ERROR:", err);
      res.status(500).json({ message: "Failed to fetch round" });
    }
  }
);

/* ===============================
   TEEN PATTI A/B → HISTORY
================================ */
router.get(
  "/teenpatti-ab/history",
  async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const rounds = await TeenPattiRound.find({ status: "CLOSED" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("roundId winner createdAt");
      res.json(rounds);
    } catch (err) {
      console.error("TEEN PATTI HISTORY ERROR:", err);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  }
);

/* ===============================
   PAPPU GAME → GET RESULT
================================ */
router.get(
  "/pappu/result/:roundId",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const round = await GameRound.findById(req.params.roundId);
      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      res.json({
        result: round.resultSymbol,
      });
    } catch (err) {
      console.error("PAPPU RESULT ERROR:", err);
      res.status(500).json({ message: "Failed to get result" });
    }
  }
);

/* ===============================
   PAPPU GAME → LAST 10 RESULTS
================================ */
router.get(
  "/pappu/last-results",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const rounds = await GameRound.find({
        gameSlug: "pappu-playing-pictures",
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("resultSymbol createdAt");

      res.json(rounds);
    } catch (err) {
      console.error("LAST RESULTS ERROR:", err);
      res.status(500).json({ message: "Failed to fetch results" });
    }
  }
);

module.exports = router;
