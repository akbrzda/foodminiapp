import { isPlainObject, schemaFail, schemaOk } from "./schema-helpers.js";

export const validateTelegramWebhookPayload = (payload) => {
  if (!isPlainObject(payload)) {
    return schemaFail("Webhook payload должен быть JSON-объектом");
  }

  if (!Number.isInteger(Number(payload.update_id))) {
    return schemaFail("Webhook payload должен содержать update_id");
  }

  const hasSupportedEvent = Boolean(payload.message || payload.callback_query);
  if (!hasSupportedEvent) {
    return schemaFail("Webhook payload не содержит поддерживаемых событий");
  }

  return schemaOk(payload);
};

export default {
  validateTelegramWebhookPayload,
};
