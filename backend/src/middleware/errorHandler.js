// Middleware для обработки ошибок
export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Ошибка валидации
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: err.message,
    });
  }

  // Ошибка аутентификации
  if (err.name === "UnauthorizedError" || err.status === 401) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing authentication token",
    });
  }

  // Ошибка доступа
  if (err.status === 403) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission to access this resource",
    });
  }

  // Ресурс не найден
  if (err.status === 404) {
    return res.status(404).json({
      error: "Not found",
      message: err.message || "Resource not found",
    });
  }

  // Общая серверная ошибка
  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;

  res.status(statusCode).json({
    error: "Server error",
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

// Middleware для обработки 404
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.url} not found`,
  });
};

// Async handler wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
