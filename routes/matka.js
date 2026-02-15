const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const ROLES = require("../config/roles");

const MatkaMarket = require("../models/MatkaMarket");
const MatkaBet = require("../models/MatkaBet");
const Wallet = require("../models/wallet");

const MIN_BET_AMOUNT = 20;

const MARKETS = [
  { marketId: "tara_mumbai_day", name: "Tara Mumbai Day", openTime: "10:00 AM", closeTime: "02:30 PM" },
  { marketId: "tara_mumbai_night", name: "Tara Mumbai Night", openTime: "05:30 PM", closeTime: "10:30 PM" },
  { marketId: "kalyan_day", name: "Kalyan", openTime: "11:30 AM", closeTime: "03:30 PM" },
  { marketId: "kalyan_night", name: "Kalyan Night", openTime: "06:30 PM", closeTime: "11:00 PM" },
];

const ensureMarkets = async () => {
  const count = await MatkaMarket.countDocuments();
  if (count > 0) return;
  await MatkaMarket.insertMany(
    MARKETS.map((m) => ({
      ...m,
      status: "running",
      openSessionStatus: "running",
      closeSessionStatus: "running",
      result: "",
      roundId: `MK${Date.now()}${Math.floor(Math.random() * 1000)}`,
    }))
  );
};

const SINGLE_PATTI_SET = new Set([
  "127","136","145","190","235","280","370","389","460","479","569","578",
  "128","137","146","236","245","290","380","470","489","560","579","678",
  "129","138","147","156","237","246","345","390","480","570","589","679",
  "120","139","148","157","238","247","256","346","490","580","670","689",
  "130","149","158","167","239","248","257","347","356","590","680","789",
  "140","159","168","230","249","258","267","348","357","456","690","780",
  "123","150","169","178","240","259","268","349","358","367","457","790",
  "124","160","179","250","269","278","340","359","368","458","467","890",
  "125","134","170","189","260","279","350","369","378","459","468","567",
  "126","135","180","234","270","289","360","379","450","469","478","568",
]);

const DOUBLE_PATTI_SET = new Set([
  "118","226","244","299","334","488","550","668","677",
  "100","119","155","227","335","344","399","588","669",
  "110","200","228","255","336","499","660","688","778",
  "166","229","300","337","355","445","599","779","788",
  "112","220","266","338","400","446","455","699","770",
  "113","122","177","339","366","447","500","799","889",
  "114","277","330","448","466","556","600","880","899",
  "115","133","188","223","377","449","557","566","700",
  "116","224","233","288","440","477","558","800","990",
  "117","144","199","225","388","559","577","667","900",
]);

const TRIPLE_PATTI_SET = new Set([
  "000","111","222","333","444","555","666","777","888","999",
]);

const validateBetNumber = (betType, number) => {
  if (!number) return false;
  const num = String(number).trim();
  if (betType === "SINGLE_ANK") return /^\d$/.test(num);
  if (betType === "SINGLE_PATTI") return SINGLE_PATTI_SET.has(num);
  if (betType === "DOUBLE_PATTI") return DOUBLE_PATTI_SET.has(num);
  if (betType === "TRIPLE_PATTI") return TRIPLE_PATTI_SET.has(num);
  if (betType === "JODI") return /^\d{2}$/.test(num);
  return false;
};

/* ===============================
   CUSTOMER → LIST MARKETS
================================ */
router.get(
  "/markets",
  auth,
  role([ROLES.CUSTOMER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      await ensureMarkets();
      const markets = await MatkaMarket.find({}).sort({ name: 1 });
      res.json(markets);
    } catch (err) {
      console.error("MATKA MARKETS ERROR:", err);
      res.status(500).json({ message: "Failed to load markets" });
    }
  }
);

/* ===============================
   CUSTOMER → MARKET DETAILS
================================ */
router.get(
  "/markets/:marketId",
  auth,
  role([ROLES.CUSTOMER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const market = await MatkaMarket.findOne({ marketId: req.params.marketId });
      if (!market) return res.status(404).json({ message: "Market not found" });
      res.json(market);
    } catch (err) {
      console.error("MATKA MARKET ERROR:", err);
      res.status(500).json({ message: "Failed to load market" });
    }
  }
);

/* ===============================
   CUSTOMER → PLACE BET
================================ */
router.post(
  "/bet",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const {
        marketId: singleMarketId,
        betType: singleBetType,
        number: singleNumber,
        session: singleSession,
        amount: singleAmount,
        bets,
      } = req.body;

      const normalizedBets = Array.isArray(bets) && bets.length > 0
        ? bets
        : [{
            marketId: singleMarketId,
            betType: singleBetType,
            number: singleNumber,
            session: singleSession,
            amount: singleAmount,
          }];

      if (!normalizedBets.length) {
        return res.status(400).json({ message: "Invalid bet data" });
      }

      const marketId = String(
        normalizedBets[0]?.marketId || singleMarketId || ""
      ).trim();
      if (!marketId) {
        return res.status(400).json({ message: "Market is required" });
      }

      const market = await MatkaMarket.findOne({ marketId });
      if (!market) return res.status(404).json({ message: "Market not found" });
      if (market.status !== "running") {
        return res.status(400).json({ message: "Betting closed for this market" });
      }

      // Backfill for old documents that do not have session status fields.
      if (!market.openSessionStatus) market.openSessionStatus = "running";
      if (!market.closeSessionStatus) market.closeSessionStatus = "running";

      const sanitizedBets = [];
      let totalAmount = 0;

      for (const rawBet of normalizedBets) {
        const betType = String(rawBet?.betType || "").trim().toUpperCase();
        const number = String(rawBet?.number || "").trim();
        const session = String(rawBet?.session || "").trim().toUpperCase();
        const amount = Number(rawBet?.amount);

        if (!betType || !number || !session || !Number.isFinite(amount) || amount < MIN_BET_AMOUNT) {
          return res.status(400).json({ message: "Invalid bet data" });
        }

        if (session !== "OPEN" && session !== "CLOSE") {
          return res.status(400).json({ message: "Invalid session" });
        }

        if (session === "OPEN" && market.openSessionStatus === "closed") {
          return res.status(400).json({ message: "Open session is closed for this market" });
        }
        if (session === "CLOSE" && market.closeSessionStatus === "closed") {
          return res.status(400).json({ message: "Close session is closed for this market" });
        }

        if (!validateBetNumber(betType, number)) {
          return res.status(400).json({ message: "Invalid number for bet type" });
        }

        sanitizedBets.push({
          userId: req.user.id,
          marketId,
          roundId: market.roundId,
          betType,
          number,
          session,
          amount,
          status: "PENDING",
          payout: 0,
        });
        totalAmount += amount;
      }

      const wallet = await Wallet.findOne({ userId: req.user.id });
      if (!wallet || wallet.balance < totalAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      if (!market.roundId) {
        market.roundId = `MK${Date.now()}${Math.floor(Math.random() * 1000)}`;
        await market.save();
        sanitizedBets.forEach((b) => {
          b.roundId = market.roundId;
        });
      }

      wallet.balance -= totalAmount;
      await wallet.save();

      const created = await MatkaBet.insertMany(sanitizedBets);

      res.json({
        message: "Bet placed",
        count: created.length,
        totalAmount,
        betIds: created.map((b) => b._id),
      });
    } catch (err) {
      console.error("MATKA BET ERROR:", err);
      res.status(500).json({ message: "Bet failed" });
    }
  }
);

/* ===============================
   CUSTOMER → MY BETS
================================ */
router.get(
  "/bets/me",
  auth,
  role([ROLES.CUSTOMER]),
  async (req, res) => {
    try {
      const bets = await MatkaBet.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(100);
      res.json(bets);
    } catch (err) {
      console.error("MATKA MY BETS ERROR:", err);
      res.status(500).json({ message: "Failed to load bets" });
    }
  }
);

module.exports = router;
