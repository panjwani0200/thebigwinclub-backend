const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    const role = String(req.user?.role || "").trim().toUpperCase();
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};

module.exports = roleMiddleware;
