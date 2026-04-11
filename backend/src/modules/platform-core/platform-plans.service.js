import { platformPlansRepository } from "./platform-plans.repository.js";

const normalizeLimitsJson = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.stringify(value);
};

const normalizePlanPayload = (payload = {}) => {
  const code = String(payload.code || "")
    .trim()
    .toLowerCase();
  const name = String(payload.name || "").trim();
  if (!code || !name) {
    const error = new Error("code и name обязательны");
    error.status = 400;
    throw error;
  }

  return {
    code,
    name,
    description: String(payload.description || "").trim() || null,
    monthly_price: Number(payload.monthly_price || 0),
    annual_price: payload.annual_price === null || payload.annual_price === undefined ? null : Number(payload.annual_price),
    currency: String(payload.currency || "USD")
      .trim()
      .toUpperCase(),
    limits_json: normalizeLimitsJson(payload.limits_json),
    is_active: payload.is_active === false ? 0 : 1,
  };
};

export const platformPlansService = {
  list: () => platformPlansRepository.list(),
  getById: (id) => platformPlansRepository.getById(id),
  create: (payload) => platformPlansRepository.create(normalizePlanPayload(payload)),
  async update(id, payload) {
    const existing = await platformPlansRepository.getById(id);
    if (!existing) {
      const error = new Error("План не найден");
      error.status = 404;
      throw error;
    }

    return platformPlansRepository.update(
      id,
      normalizePlanPayload({
        ...existing,
        ...payload,
      })
    );
  },
  async remove(id) {
    const deleted = await platformPlansRepository.remove(id);
    if (!deleted) {
      const error = new Error("План не найден");
      error.status = 404;
      throw error;
    }
  },
};
