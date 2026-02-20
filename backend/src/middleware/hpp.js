const hasPollutedShape = (value) => {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) => hasPollutedShape(entry));
};

export const hppMiddleware = (req, res, next) => {
  const duplicateQuery = hasPollutedShape(req.query);
  if (duplicateQuery) {
    return res.status(400).json({ error: "Duplicate query parameters are not allowed" });
  }
  return next();
};

export default hppMiddleware;
