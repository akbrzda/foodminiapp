import { sendError } from "../utils/http-response.js";

export const validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema(req.body);
    if (!result.valid) {
      return sendError(res, 400, result.error || "Некорректный запрос");
    }

    req.validatedBody = result.value;
    return next();
  };
};

export default {
  validateBody,
};
