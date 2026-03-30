import redis from "../../../../config/redis.js";

export function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;

  if (typeof value === "object") {
    const nested = Number(
      value.currentPrice ??
        value.current_price ??
        value.price ??
        value.value ??
        value.amount ??
        value.valueWithoutVat ??
        value.value_without_vat ??
        NaN
    );
    if (Number.isFinite(nested)) return nested;
  }

  return null;
}

function resolvePriceAmount(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return toNumberOrNull(value.price ?? value.value ?? value.amount);
  }
  return toNumberOrNull(value);
}

export function resolveIikoPriceFromRows(rows = [], preferredOrganizationIds = []) {
  const normalizedRows = Array.isArray(rows)
    ? rows.filter((row) => row && typeof row === "object")
    : [];
  if (normalizedRows.length === 0) return null;

  const normalizedPreferredIds = preferredOrganizationIds
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  for (const organizationId of normalizedPreferredIds) {
    const matchedRow = normalizedRows.find((row) => {
      const rowOrganizationId = String(row.organizationId || row.organization_id || "").trim();
      return rowOrganizationId && rowOrganizationId === organizationId;
    });
    const matchedPrice = resolvePriceAmount(matchedRow);
    if (matchedPrice !== null) return matchedPrice;
  }

  for (const row of normalizedRows) {
    const price = resolvePriceAmount(row);
    if (price !== null) return price;
  }

  return null;
}

export function normalizeWeightUnit(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;

  if (["g", "гр", "г", "gram", "grams", "грамм", "граммы", "measureunittype.gram"].includes(raw))
    return "g";
  if (["kg", "кг", "kilogram", "kilograms", "measureunittype.kilogram"].includes(raw)) return "kg";
  if (["ml", "мл", "milliliter", "milliliters", "measureunittype.milliliter"].includes(raw))
    return "ml";
  if (["l", "л", "liter", "liters", "measureunittype.liter"].includes(raw)) return "l";
  if (["pcs", "шт", "шт.", "piece", "pieces", "measureunittype.piece"].includes(raw)) return "pcs";

  return null;
}

export function normalizeWeightValue(value, unit = null) {
  const numeric = toNumberOrNull(value);
  if (numeric === null) return null;
  if (unit === "g" || unit === "ml") return Math.round(numeric);
  return Number(numeric.toFixed(3));
}

export function calcServingNutrition(per100Value, weightGrams) {
  const p100 = toNumberOrNull(per100Value);
  const weight = toNumberOrNull(weightGrams);
  if (p100 === null || weight === null) return null;
  return Number(((p100 * weight) / 100).toFixed(2));
}

export function normalizeModifierGroupType(restrictions = {}) {
  const minQuantity = Number(restrictions?.minQuantity ?? 0);
  const maxQuantity = Number(restrictions?.maxQuantity ?? 1);
  if (Number.isFinite(maxQuantity) && maxQuantity > 1) return "multiple";
  if (Number.isFinite(minQuantity) && minQuantity > 1) return "multiple";
  return "single";
}

export function normalizeModifierGroupSelections(restrictions = {}) {
  const minRaw = Number(restrictions?.minQuantity ?? 0);
  const maxRaw = Number(restrictions?.maxQuantity ?? 1);
  const minSelections = Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : 0;
  const maxSelections =
    Number.isFinite(maxRaw) && maxRaw >= minSelections ? maxRaw : Math.max(1, minSelections);
  return { minSelections, maxSelections };
}

export function extractModifierPrice(value = {}) {
  const direct = toNumberOrNull(value?.price);
  if (direct !== null) return direct;
  const prices = Array.isArray(value?.prices) ? value.prices : [];
  if (prices.length === 0) return 0;
  return toNumberOrNull(prices[0]?.price) ?? 0;
}

export function resolveImageUrl(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return first ? first.trim() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object") {
    if (typeof value.href === "string" && value.href.trim()) return value.href.trim();
    if (typeof value.url === "string" && value.url.trim()) return value.url.trim();
  }
  return null;
}

export function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function toLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeDisplayName(value, fallback = "") {
  const source = String(value || fallback || "").trim();
  if (!source) return "";
  const lowered = source.toLocaleLowerCase("ru-RU");
  return `${lowered.charAt(0).toLocaleUpperCase("ru-RU")}${lowered.slice(1)}`;
}

export function normalizeIikoId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function extractIikoItemCategoryIds(item = {}) {
  const ids = new Set();
  const add = (value) => {
    const normalized = normalizeIikoId(value);
    if (normalized) ids.add(normalized);
  };

  add(item.parentGroup);
  add(item.parentGroupId);
  add(item.parent_group);
  add(item.groupId);
  add(item.group_id);
  add(item.categoryId);
  add(item.category_id);
  add(item.productCategoryId);
  add(item.product_category_id);
  add(item.iikoGroupId);
  add(item.iiko_group_id);
  add(item.productGroupId);
  add(item.product_group_id);

  if (Array.isArray(item.groups)) {
    for (const group of item.groups) {
      if (typeof group === "object") {
        add(group.id || group.groupId || group.group_id);
      } else {
        add(group);
      }
    }
  }

  if (Array.isArray(item.groupIds)) {
    for (const groupId of item.groupIds) add(groupId);
  }

  if (Array.isArray(item.parentGroups)) {
    for (const parentGroup of item.parentGroups) {
      if (typeof parentGroup === "object") {
        add(parentGroup.id || parentGroup.groupId || parentGroup.group_id);
      } else {
        add(parentGroup);
      }
    }
  }

  return [...ids];
}

export async function invalidatePublicMenuCache() {
  try {
    const keys = await redis.keys("menu:*:city:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    // Не критично для завершения sync: данные уже записаны в БД.
  }
}
