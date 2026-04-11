import { platformBillingRepository } from "./platform-billing.repository.js";

const ALLOWED_TRANSACTION_STATUS = new Set(["pending", "succeeded", "failed", "refunded"]);
const ALLOWED_EVENT_STATUS = new Set(["received", "processed", "failed", "ignored"]);

const normalizeJson = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

export const platformBillingService = {
  listTransactions(limit) {
    const normalizedLimit = Number(limit);
    return platformBillingRepository.listTransactions(
      Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? Math.min(normalizedLimit, 500) : 100
    );
  },

  async createTransaction(payload = {}) {
    const tenantId = Number(payload.tenant_id);
    const subscriptionId =
      payload.subscription_id === null || payload.subscription_id === undefined
        ? null
        : Number(payload.subscription_id);
    const status = String(payload.status || "pending")
      .trim()
      .toLowerCase();
    const amount = Number(payload.amount);

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      const error = new Error("Некорректный tenant_id");
      error.status = 400;
      throw error;
    }
    if (subscriptionId !== null && (!Number.isInteger(subscriptionId) || subscriptionId <= 0)) {
      const error = new Error("Некорректный subscription_id");
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("Некорректный amount");
      error.status = 400;
      throw error;
    }
    if (!ALLOWED_TRANSACTION_STATUS.has(status)) {
      const error = new Error("Некорректный статус транзакции");
      error.status = 400;
      throw error;
    }

    return platformBillingRepository.createTransaction({
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      amount,
      currency: String(payload.currency || "USD")
        .trim()
        .toUpperCase(),
      status,
      provider: String(payload.provider || "").trim() || null,
      provider_txn_id: String(payload.provider_txn_id || "").trim() || null,
      description: String(payload.description || "").trim() || null,
      metadata: normalizeJson(payload.metadata),
    });
  },

  async ingestBillingWebhook(payload = {}) {
    const provider = String(payload.provider || "").trim().toLowerCase();
    const providerEventId = String(payload.provider_event_id || "").trim();
    const eventType = String(payload.event_type || "").trim();

    if (!provider || !providerEventId || !eventType) {
      const error = new Error("provider, provider_event_id и event_type обязательны");
      error.status = 400;
      throw error;
    }

    const existing = await platformBillingRepository.findBillingEvent(provider, providerEventId);
    if (existing) {
      return {
        event: existing,
        idempotent: true,
      };
    }

    const event = await platformBillingRepository.createBillingEvent({
      tenant_id:
        payload.tenant_id === null || payload.tenant_id === undefined ? null : Number(payload.tenant_id),
      transaction_id:
        payload.transaction_id === null || payload.transaction_id === undefined
          ? null
          : Number(payload.transaction_id),
      provider,
      event_type: eventType,
      provider_event_id: providerEventId,
      payload: normalizeJson(payload.payload || payload),
      processing_status: ALLOWED_EVENT_STATUS.has(String(payload.processing_status || "").toLowerCase())
        ? String(payload.processing_status || "").toLowerCase()
        : "received",
    });

    return {
      event,
      idempotent: false,
    };
  },

  async setBillingEventStatus(id, processingStatus, processingError = null) {
    if (!ALLOWED_EVENT_STATUS.has(String(processingStatus || "").trim().toLowerCase())) {
      const error = new Error("Некорректный processing_status");
      error.status = 400;
      throw error;
    }
    await platformBillingRepository.markBillingEventProcessed(
      Number(id),
      String(processingStatus).trim().toLowerCase(),
      processingError ? String(processingError) : null
    );
  },
};
