import { sendError } from "../utils/http-response.js";

const parseBotServiceToken = () => String(process.env.BOT_SERVICE_TOKEN || "").trim();

export const requireInternalToken = (req, res, next) => {
  const expected = parseBotServiceToken();
  if (!expected) {
    return sendError(res, 500, "BOT_SERVICE_TOKEN не задан");
  }

  const received = String(req.headers["x-bot-service-token"] || "").trim();
  if (!received || received !== expected) {
    return sendError(res, 401, "Unauthorized");
  }

  return next();
};

export default {
  requireInternalToken,
};
