import { platformSubscriptionsRepository } from "./platform-subscriptions.repository.js";

const ALLOWED_STATUSES = new Set(["trial", "active", "past_due", "suspended", "cancelled", "deleted"]);
const ALLOWED_BILLING_CYCLES = new Set(["monthly", "annual"]);

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const platformSubscriptionsService = {
  list: () => platformSubscriptionsRepository.list(),

  async create(payload = {}) {
    const tenantId = Number(payload.tenant_id);
    const planId = Number(payload.plan_id);
    const status = String(payload.status || "trial")
      .trim()
      .toLowerCase();
    const billingCycle = String(payload.billing_cycle || "monthly")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      const error = new Error("Некорректный tenant_id");
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(planId) || planId <= 0) {
      const error = new Error("Некорректный plan_id");
      error.status = 400;
      throw error;
    }
    if (!ALLOWED_STATUSES.has(status)) {
      const error = new Error("Некорректный статус подписки");
      error.status = 400;
      throw error;
    }
    if (!ALLOWED_BILLING_CYCLES.has(billingCycle)) {
      const error = new Error("Некорректный billing_cycle");
      error.status = 400;
      throw error;
    }

    return platformSubscriptionsRepository.create({
      tenant_id: tenantId,
      plan_id: planId,
      status,
      billing_cycle: billingCycle,
      trial_ends_at: normalizeDate(payload.trial_ends_at),
      current_period_starts_at: normalizeDate(payload.current_period_starts_at),
      current_period_ends_at: normalizeDate(payload.current_period_ends_at),
      cancelled_at: normalizeDate(payload.cancelled_at),
      suspended_at: normalizeDate(payload.suspended_at),
    });
  },

  async updateStatus(id, payload = {}) {
    const subscriptionId = Number(id);
    const status = String(payload.status || "")
      .trim()
      .toLowerCase();
    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      const error = new Error("Некорректный id подписки");
      error.status = 400;
      throw error;
    }
    if (!ALLOWED_STATUSES.has(status)) {
      const error = new Error("Некорректный статус подписки");
      error.status = 400;
      throw error;
    }

    const existing = await platformSubscriptionsRepository.getById(subscriptionId);
    if (!existing) {
      const error = new Error("Подписка не найдена");
      error.status = 404;
      throw error;
    }

    return platformSubscriptionsRepository.updateStatus(subscriptionId, {
      status,
      cancelled_at: status === "cancelled" ? new Date() : null,
      suspended_at: status === "suspended" ? new Date() : null,
    });
  },
};
