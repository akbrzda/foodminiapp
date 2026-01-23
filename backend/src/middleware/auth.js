import jwt from "jsonwebtoken";
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      error: "Access token required",
    });
  }
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      error: "Invalid or expired token",
    });
  }
};
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }
    next();
  };
};
export const checkCityAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }
  if (req.user.role === "admin" || req.user.role === "ceo") {
    return next();
  }
  const cityId = parseInt(req.params.cityId || req.query.cityId || req.body.cityId);
  if (!cityId) {
    return next();
  }
  if (req.user.cities && req.user.cities.includes(cityId)) {
    return next();
  }
  return res.status(403).json({
    error: "You do not have access to this city",
  });
};
