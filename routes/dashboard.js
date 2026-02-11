const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/super", authMiddleware, (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  res.json({
    message: "Welcome Super Admin 👑",
    user: req.user
  });
});

module.exports = router;
