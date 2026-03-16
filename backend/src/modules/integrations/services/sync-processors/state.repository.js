import db from "../../../../config/database.js";
import { MAX_SYNC_ATTEMPTS, SYNC_STATUS } from "../../constants.js";

export function nextSyncState(attempts) {
  if (attempts >= MAX_SYNC_ATTEMPTS) return SYNC_STATUS.FAILED;
  return SYNC_STATUS.ERROR;
}

export async function markOrderIikoSync(orderId, patch) {
  const { status, error = null, attempts = null, iikoOrderId = null } = patch;
  await db.query(
    `UPDATE orders
     SET iiko_sync_status = ?,
         iiko_sync_error = ?,
         iiko_sync_attempts = COALESCE(?, iiko_sync_attempts),
         iiko_order_id = COALESCE(?, iiko_order_id),
         iiko_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, iikoOrderId, orderId]
  );
}

export async function markOrderPbSync(orderId, patch) {
  const { status, error = null, attempts = null, purchaseId = null } = patch;
  await db.query(
    `UPDATE orders
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_purchase_id = COALESCE(?, pb_purchase_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, purchaseId, orderId]
  );
}

export async function markUserPbSync(userId, patch) {
  const { status, error = null, attempts = null, pbClientId = null } = patch;
  await db.query(
    `UPDATE users
     SET pb_sync_status = ?,
         pb_sync_error = ?,
         pb_sync_attempts = COALESCE(?, pb_sync_attempts),
         pb_client_id = COALESCE(?, pb_client_id),
         pb_last_sync_at = NOW()
     WHERE id = ?`,
    [status, error, attempts, pbClientId, userId]
  );
}

export async function loadOrderWithItems(orderId) {
  const [orders] = await db.query(
    `SELECT o.*,
            u.phone AS user_phone,
            c.name AS city_name,
            c.timezone AS city_timezone,
            b.iiko_organization_id AS branch_iiko_organization_id,
            b.iiko_terminal_group_id AS branch_iiko_terminal_group_id
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN cities c ON c.id = o.city_id
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE o.id = ?`,
    [orderId]
  );
  if (orders.length === 0) throw new Error("Заказ не найден");

  const order = orders[0];
  const [items] = await db.query(
    `SELECT oi.*,
            mi.iiko_item_id,
            iv.iiko_variant_id
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.item_id
     LEFT JOIN item_variants iv ON iv.id = oi.variant_id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  const orderItemIds = items.map((item) => Number(item.id)).filter(Number.isFinite);
  if (orderItemIds.length === 0) {
    return { order, items };
  }

  const placeholders = orderItemIds.map(() => "?").join(",");
  const [modifierRows] = await db.query(
    `SELECT oim.order_item_id,
            oim.modifier_id,
            oim.modifier_name,
            oim.modifier_price,
            oim.modifier_weight,
            oim.modifier_weight_unit,
            m.iiko_modifier_id
     FROM order_item_modifiers oim
     LEFT JOIN modifiers m ON m.id = oim.modifier_id
     WHERE oim.order_item_id IN (${placeholders})`,
    orderItemIds
  );

  const modifiersByOrderItemId = new Map();
  for (const row of modifierRows) {
    const itemId = Number(row.order_item_id);
    if (!Number.isFinite(itemId)) continue;
    if (!modifiersByOrderItemId.has(itemId)) {
      modifiersByOrderItemId.set(itemId, []);
    }
    modifiersByOrderItemId.get(itemId).push(row);
  }

  const itemsWithModifiers = items.map((item) => ({
    ...item,
    modifiers: modifiersByOrderItemId.get(Number(item.id)) || [],
  }));

  return { order, items: itemsWithModifiers };
}
