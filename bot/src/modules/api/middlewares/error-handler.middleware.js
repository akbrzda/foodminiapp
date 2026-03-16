import { logger } from "../../../utils/logger.js";
import { sendError } from "../utils/http-response.js";

export const errorHandler = (error, req, res, next) => {
  logger.error("Unhandled bot-service error", {
    error: error?.message || String(error),
    path: req?.path || null,
    method: req?.method || null,
  });

  return sendError(res, 500, "Internal server error");
};

export default {
  errorHandler,
};
