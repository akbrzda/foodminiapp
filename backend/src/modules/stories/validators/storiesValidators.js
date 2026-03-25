const ALLOWED_STATUSES = new Set(["draft", "active", "paused", "archived"]);
const ALLOWED_PLACEMENTS = new Set(["home"]);
const ALLOWED_CTA_TYPES = new Set(["none", "url", "category", "product"]);

const toIntOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolOrDefault = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const assert = (condition, message) => {
  if (!condition) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
};

const normalizeSlide = (slide, index) => {
  const title = String(slide?.title || "").trim();
  const mediaUrl = String(slide?.media_url || "").trim();
  const ctaType = String(slide?.cta_type || "none").trim().toLowerCase();
  const durationSeconds = toIntOrNull(slide?.duration_seconds) ?? 6;

  assert(title.length > 0, `Слайд #${index + 1}: поле title обязательно`);
  assert(mediaUrl.length > 0, `Слайд #${index + 1}: поле media_url обязательно`);
  assert(ALLOWED_CTA_TYPES.has(ctaType), `Слайд #${index + 1}: неподдерживаемый cta_type`);
  assert(durationSeconds >= 3 && durationSeconds <= 15, `Слайд #${index + 1}: duration_seconds должен быть в диапазоне 3-15`);

  return {
    title,
    subtitle: String(slide?.subtitle || "").trim() || null,
    media_url: mediaUrl,
    cta_text: String(slide?.cta_text || "").trim() || null,
    cta_type: ctaType,
    cta_value: String(slide?.cta_value || "").trim() || null,
    duration_seconds: durationSeconds,
    sort_order: toIntOrNull(slide?.sort_order) ?? index,
    is_active: toBoolOrDefault(slide?.is_active, true),
  };
};

export const normalizeStoriesListQuery = (query = {}) => {
  const page = toIntOrNull(query.page) ?? 1;
  const limit = Math.min(toIntOrNull(query.limit) ?? 20, 100);
  const search = String(query.search || "").trim();
  const status = String(query.status || "").trim().toLowerCase();
  const placement = String(query.placement || "").trim().toLowerCase();

  if (status && !ALLOWED_STATUSES.has(status)) {
    const error = new Error("Недопустимый status");
    error.status = 400;
    throw error;
  }

  if (placement && !ALLOWED_PLACEMENTS.has(placement)) {
    const error = new Error("Недопустимый placement");
    error.status = 400;
    throw error;
  }

  return { page: Math.max(page, 1), limit: Math.max(limit, 1), search, status, placement };
};

export const normalizeStoriesCampaignPayload = (payload = {}, { isUpdate = false } = {}) => {
  const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const readField = (field, transform) => {
    if (isUpdate && !hasField(field)) return undefined;
    const value = payload[field];
    return transform ? transform(value) : value;
  };

  const status = readField("status", (value) => String(value || "draft").trim().toLowerCase());
  const placement = readField("placement", (value) => String(value || "home").trim().toLowerCase());
  const startAt = readField("start_at", toDateOrNull);
  const endAt = readField("end_at", toDateOrNull);
  const slides = readField("slides", (value) => {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeSlide);
  });

  if (status !== undefined) {
    assert(ALLOWED_STATUSES.has(status), "Недопустимый status");
  }

  if (placement !== undefined) {
    assert(ALLOWED_PLACEMENTS.has(placement), "Недопустимый placement");
  }

  if (startAt !== undefined && endAt !== undefined && startAt && endAt) {
    assert(startAt <= endAt, "start_at не может быть позже end_at");
  }

  const result = {
    name: readField("name", (value) => String(value || "").trim()),
    title: readField("title", (value) => String(value || "").trim()),
    placement,
    status,
    is_active: readField("is_active", (value) => toBoolOrDefault(value, true)),
    priority: readField("priority", (value) => toIntOrNull(value) ?? 0),
    cover_image_url: readField("cover_image_url", (value) => String(value || "").trim() || null),
    start_at: startAt,
    end_at: endAt,
    city_id: readField("city_id", toIntOrNull),
    branch_id: readField("branch_id", toIntOrNull),
    segment_config: readField("segment_config", (value) => value || null),
    slides,
  };

  if (!isUpdate) {
    assert(result.name, "Поле name обязательно");
    assert(result.title, "Поле title обязательно");
    assert(Array.isArray(result.slides) && result.slides.length > 0, "Добавьте минимум 1 слайд");
  }

  if (isUpdate) {
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
  }

  return result;
};

export const normalizeActiveStoriesQuery = (query = {}) => {
  const placement = String(query.placement || "home").trim().toLowerCase();
  const cityId = toIntOrNull(query.city_id);
  const branchId = toIntOrNull(query.branch_id);
  assert(ALLOWED_PLACEMENTS.has(placement), "Недопустимый placement");
  return { placement, cityId, branchId };
};

export const normalizeImpressionPayload = (payload = {}) => {
  const campaignId = toIntOrNull(payload.campaign_id);
  const slideId = toIntOrNull(payload.slide_id);
  const placement = String(payload.placement || "home").trim().toLowerCase();

  assert(Number.isInteger(campaignId) && campaignId > 0, "campaign_id обязателен");
  assert(ALLOWED_PLACEMENTS.has(placement), "Недопустимый placement");

  return { campaignId, slideId, placement };
};

export const normalizeClickPayload = (payload = {}) => {
  const base = normalizeImpressionPayload(payload);
  const ctaType = String(payload.cta_type || "none").trim().toLowerCase();
  const ctaValue = String(payload.cta_value || "").trim() || null;

  assert(ALLOWED_CTA_TYPES.has(ctaType), "Недопустимый cta_type");
  return {
    ...base,
    ctaType,
    ctaValue,
  };
};

export const normalizeCompletePayload = (payload = {}) => {
  const campaignId = toIntOrNull(payload.campaign_id);
  const lastSlideIndex = toIntOrNull(payload.last_slide_index) ?? 0;

  assert(Number.isInteger(campaignId) && campaignId > 0, "campaign_id обязателен");
  assert(lastSlideIndex >= 0, "last_slide_index должен быть >= 0");

  return { campaignId, lastSlideIndex };
};
