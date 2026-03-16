import db from "../../../../config/database.js";

export function extractPremiumBonusClientId(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.client_id || payload.clientId || payload.id || payload?.buyer?.client_id || null;
}

export function isPremiumBonusBuyerFound(info) {
  if (!info || typeof info !== "object") return false;
  if (info.success === false) return false;
  if (info.is_registered === true) return true;
  if (extractPremiumBonusClientId(info)) return true;
  return false;
}

export function isBuyerNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (status === 404) return true;
  if (status === 400 && (message.includes("не найден") || message.includes("not found"))) {
    return true;
  }
  return false;
}

export function isPhoneAndExternalIdConflictError(error) {
  const message = String(
    error?.message || error?.error_description || error?.error || ""
  ).toLowerCase();
  return (
    message.includes("нельзя указать телефон и внешний идентификатор одновременно") ||
    (message.includes("phone") &&
      message.includes("external") &&
      message.includes("simultaneously"))
  );
}

export function assertPremiumBonusProfileSuccess(response, fallbackMessage) {
  if (response?.success === false) {
    throw new Error(response?.error_description || response?.error || fallbackMessage);
  }
}

export function parseGroupPercent(rawName) {
  const source = String(rawName || "")
    .trim()
    .replace(",", ".");
  if (!source) return null;
  const match = source.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function normalizePhoneForPremiumBonus(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

export function normalizeBonusAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return Math.ceil(parsed);
  return Math.floor(parsed);
}

export function parsePbBalance(info) {
  if (!info || typeof info !== "object") return 0;
  const direct = Number(info.balance);
  if (Number.isFinite(direct)) return normalizeBonusAmount(direct);
  const accumulated = Number(info.balance_bonus_accumulated || 0);
  const present = Number(info.balance_bonus_present || 0);
  const action = Number(info.balance_bonus_action || 0);
  const total = accumulated + present + action;
  return Number.isFinite(total) ? normalizeBonusAmount(total) : 0;
}

export function mapOrderStatusToPremiumBonusStatus(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (["completed", "ready", "delivering", "confirmed", "preparing"].includes(normalized)) {
    return "approved";
  }
  return "not_approved";
}

export function mapOrderItemsToPremiumBonusPurchaseItems(items = [], options = {}) {
  const mappedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.item_price) || 0;
      const amount = Number(item?.subtotal);
      const resolvedAmount = Number.isFinite(amount) ? amount : unitPrice * quantity;
      if (quantity <= 0 || resolvedAmount <= 0) return null;

      return {
        name: String(item?.item_name || "").trim() || "Позиция",
        external_item_id: String(item?.iiko_item_id || item?.item_id || "").trim() || undefined,
        amount: Number(resolvedAmount.toFixed(2)),
        quantity: Number(quantity.toFixed(3)),
        type: "product",
      };
    })
    .filter(Boolean);

  const deliveryCost = Number(options?.deliveryCost || 0);
  if (Number.isFinite(deliveryCost) && deliveryCost > 0) {
    mappedItems.push({
      name: "Доставка",
      external_item_id: String(options?.deliveryExternalId || "delivery").trim(),
      amount: Number(deliveryCost.toFixed(2)),
      quantity: 1,
      type: "product",
    });
  }

  return mappedItems;
}

export function assertPremiumBonusSuccess(response, fallbackMessage) {
  if (response?.success === false) {
    const errorDescription = String(response?.error_description || response?.error || "").trim();
    throw new Error(errorDescription || fallbackMessage);
  }
}

async function resolveLocalLevelByPercent(percent) {
  if (!Number.isFinite(percent)) return null;
  const [rows] = await db.query(
    `SELECT id, name, earn_percentage
     FROM loyalty_levels
     WHERE is_enabled = 1 AND earn_percentage = ?
     LIMIT 1`,
    [Number(percent)]
  );
  if (!rows.length) return null;
  return rows[0];
}

export async function resolveLocalLevelByPremiumBonusGroup({ groupId = "", groupName = "" } = {}) {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedGroupName = String(groupName || "").trim();

  if (normalizedGroupId) {
    const [rows] = await db.query(
      `SELECT id, name, earn_percentage
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND pb_group_id = ?
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupId]
    );
    if (rows.length > 0) return rows[0];
  }

  if (normalizedGroupName) {
    const [rows] = await db.query(
      `SELECT id, name, earn_percentage
       FROM loyalty_levels
       WHERE is_enabled = 1
         AND (
           LOWER(TRIM(pb_group_name)) = LOWER(TRIM(?))
           OR LOWER(TRIM(name)) = LOWER(TRIM(?))
         )
       ORDER BY sort_order ASC, threshold_amount ASC, id ASC
       LIMIT 1`,
      [normalizedGroupName, normalizedGroupName]
    );
    if (rows.length > 0) return rows[0];
  }

  const percent = parseGroupPercent(normalizedGroupName);
  if (!Number.isFinite(percent)) return null;
  return resolveLocalLevelByPercent(percent);
}
