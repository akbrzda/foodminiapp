import { logger } from "../utils/logger.js";

export const errorHandler = (err, req, res, next) => {
  // Логируем ошибку
  logger.error("API Error", {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }

  if (err.status === 400) {
    return res.status(400).json({
      error: err.message || "Bad request",
    });
  }

  if (err.name === "UnauthorizedError" || err.status === 401) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  if (err.status === 403) {
    return res.status(403).json({
      error: "Access denied",
    });
  }

  if (err.status === 404) {
    return res.status(404).json({
      error: "Resource not found",
    });
  }

  // Скрываем технические детали в production
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Проверяем, не содержит ли ошибка информацию о БД
  const isSqlError = err.code?.startsWith("ER_") || err.message?.toLowerCase().includes("sql") || err.message?.toLowerCase().includes("mysql");

  const message = isProduction ? "Internal server error" : isSqlError ? "Database error occurred" : err.message;

  res.status(statusCode).json({
    error: "Server error",
    message,
    // Показываем stack только в development
    ...(process.env.NODE_ENV === "development" && !isSqlError && { stack: err.stack }),
  });
};
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.url} not found`,
  });
};
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
