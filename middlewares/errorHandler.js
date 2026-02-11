module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  const payload = {
    message: err.message || "Internal server error",
  };

  if (!isProd) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
};
