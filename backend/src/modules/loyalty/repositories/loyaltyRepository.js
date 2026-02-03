import db from "../../../config/database.js";

const getExecutor = (connection) => connection || db;

export async function getUserLoyaltySnapshot(userId, { connection = null, forUpdate = false } = {}) {
  const executor = getExecutor(connection);
  const selectSql = forUpdate
    ? "SELECT loyalty_balance, current_loyalty_level_id FROM users WHERE id = ? FOR UPDATE"
    : "SELECT loyalty_balance, current_loyalty_level_id FROM users WHERE id = ?";
  const [users] = await executor.query(selectSql, [userId]);
  return users[0] || null;
}

export async function updateUserBalance(userId, balance, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE users SET loyalty_balance = ? WHERE id = ?", [balance, userId]);
}

export async function updateUserLevel(userId, levelId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE users SET current_loyalty_level_id = ? WHERE id = ?", [levelId, userId]);
}

export async function ensureUserLoyaltyDefaults(userId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query(
    "UPDATE users SET loyalty_joined_at = COALESCE(loyalty_joined_at, NOW()), current_loyalty_level_id = COALESCE(current_loyalty_level_id, 1) WHERE id = ?",
    [userId],
  );
}

export async function getLoyaltyLevels({ connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT id, name, threshold_amount, earn_percentage, max_spend_percentage FROM loyalty_levels WHERE is_enabled = TRUE ORDER BY threshold_amount ASC",
  );
  return rows;
}

export async function getTotalSpentForPeriod(userId, periodDays, { connection = null } = {}) {
  const executor = getExecutor(connection);
  try {
    const [totals] = await executor.query(
      `SELECT COALESCE(SUM(GREATEST(0, total - delivery_cost - bonus_spent)), 0) as total_spent
       FROM orders
       WHERE user_id = ?
         AND status IN ('delivered','completed')
         AND created_at >= (NOW() - INTERVAL ? DAY)`,
      [userId, periodDays],
    );
    return parseFloat(totals[0]?.total_spent) || 0;
  } catch (error) {
    if (String(error?.message || "").includes("bonus_spent")) {
      const [totals] = await executor.query(
        `SELECT COALESCE(SUM(GREATEST(0, total - delivery_cost - bonus_used)), 0) as total_spent
         FROM orders
         WHERE user_id = ?
           AND status IN ('delivered','completed')
           AND created_at >= (NOW() - INTERVAL ? DAY)`,
        [userId, periodDays],
      );
      return parseFloat(totals[0]?.total_spent) || 0;
    }
    throw error;
  }
}

export async function getExpiringBonuses(userId, days, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT 
      id,
      remaining_amount as amount,
      expires_at,
      DATEDIFF(expires_at, NOW()) as days_left
     FROM loyalty_transactions
     WHERE user_id = ?
       AND type IN ('earn','registration','birthday')
       AND status = 'completed'
       AND remaining_amount > 0
       AND expires_at IS NOT NULL
       AND expires_at > NOW()
       AND DATEDIFF(expires_at, NOW()) <= ?
     ORDER BY expires_at ASC`,
    [userId, days],
  );
  return rows;
}

export async function getLoyaltyHistory(userId, limit, offset, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT *
     FROM (
       SELECT 
         MAX(lt.id) as id,
         lt.order_id,
         o.order_number,
         'spend' as type,
         SUM(lt.amount) as amount,
         CASE
           WHEN SUM(lt.status = 'completed') > 0 THEN 'completed'
           WHEN SUM(lt.status = 'pending') > 0 THEN 'pending'
           WHEN SUM(lt.status = 'cancelled') = COUNT(*) THEN 'cancelled'
           ELSE MAX(lt.status)
         END as status,
         NULL as remaining_amount,
         NULL as expires_at,
         MAX(lt.created_at) as created_at
       FROM loyalty_transactions lt
       LEFT JOIN orders o ON lt.order_id = o.id
       WHERE lt.user_id = ?
         AND lt.type = 'spend'
       GROUP BY lt.order_id
       UNION ALL
       SELECT 
         lt.id,
         lt.order_id,
         o.order_number,
         lt.type,
         lt.amount,
         lt.status,
         lt.remaining_amount,
         lt.expires_at,
         lt.created_at
       FROM loyalty_transactions lt
       LEFT JOIN orders o ON lt.order_id = o.id
       WHERE lt.user_id = ?
         AND lt.type <> 'spend'
     ) as transactions
     ORDER BY transactions.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, userId, limit, offset],
  );
  return rows;
}

export async function getLoyaltyTransactions(userId, limit = 50, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT lt.id, lt.order_id, o.order_number, lt.type, lt.amount, lt.status, lt.expires_at, lt.created_at
     FROM loyalty_transactions lt
     LEFT JOIN orders o ON lt.order_id = o.id
     WHERE lt.user_id = ?
     ORDER BY lt.created_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  return rows;
}

export async function getLoyaltySummary(userId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT
      SUM(CASE WHEN type IN ('earn','registration','birthday') AND status = 'completed' THEN amount ELSE 0 END) as total_earned,
      SUM(CASE WHEN type = 'spend' AND status = 'completed' THEN amount ELSE 0 END) as total_spent,
      SUM(CASE WHEN type = 'expire' AND status = 'completed' THEN amount ELSE 0 END) as total_expired
     FROM loyalty_transactions
     WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || { total_earned: 0, total_spent: 0, total_expired: 0 };
}

export async function getLoyaltyLevelHistory(userId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT ull.id, ull.reason, ull.created_at, ll.name as level_name
     FROM user_loyalty_levels ull
     LEFT JOIN loyalty_levels ll ON ull.loyalty_level_id = ll.id
     WHERE ull.user_id = ?
     ORDER BY ull.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getLoyaltyTransaction(orderId, type, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT id, amount, remaining_amount, status
     FROM loyalty_transactions
     WHERE order_id = ?
       AND type = ?
     ORDER BY id DESC
     LIMIT 1`,
    [orderId, type],
  );
  return rows[0] || null;
}

export async function getOrderLoyaltyTransactions(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT id, type, amount, status, related_transaction_id FROM loyalty_transactions WHERE order_id = ?",
    [orderId],
  );
  return rows;
}

export async function insertLoyaltyTransaction(payload, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `INSERT INTO loyalty_transactions
     (user_id, type, status, amount, remaining_amount, order_id, related_transaction_id, description, expires_at, admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.user_id,
      payload.type,
      payload.status || "completed",
      payload.amount,
      payload.remaining_amount ?? null,
      payload.order_id || null,
      payload.related_transaction_id || null,
      payload.description || null,
      payload.expires_at || null,
      payload.admin_id || null,
    ],
  );
  return result.insertId;
}

export async function updateTransactionRemaining(id, remainingAmount, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE loyalty_transactions SET remaining_amount = ? WHERE id = ?", [remainingAmount, id]);
}

export async function updateTransactionStatus(id, status, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE loyalty_transactions SET status = ? WHERE id = ?", [status, id]);
}

export async function updateTransactionStatusAndRemaining(id, status, remainingAmount, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE loyalty_transactions SET status = ?, remaining_amount = ? WHERE id = ?", [status, remainingAmount, id]);
}

export async function getTransactionById(id, { connection = null, forUpdate = false } = {}) {
  const executor = getExecutor(connection);
  const selectSql = forUpdate
    ? "SELECT id, amount, remaining_amount, status FROM loyalty_transactions WHERE id = ? FOR UPDATE"
    : "SELECT id, amount, remaining_amount, status FROM loyalty_transactions WHERE id = ?";
  const [rows] = await executor.query(selectSql, [id]);
  return rows[0] || null;
}

export async function getEarnTransactions(userId, { onlyActive = false, connection = null, forUpdate = false } = {}) {
  const executor = getExecutor(connection);
  const baseSql =
    "SELECT id, amount, remaining_amount, expires_at, created_at FROM loyalty_transactions WHERE user_id = ? AND type IN ('earn','registration','birthday') AND status = 'completed' AND remaining_amount > 0";
  const activeFilter = onlyActive ? " AND expires_at > NOW()" : "";
  const orderSql = " ORDER BY created_at ASC, id ASC";
  const lockSql = forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.query(`${baseSql}${activeFilter}${orderSql}${lockSql}`, [userId]);
  return rows;
}

export async function insertLevelHistory({ userId, levelId, previousLevelId, reason, thresholdSum }, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query(
    `INSERT INTO user_loyalty_levels (user_id, loyalty_level_id, previous_level_id, reason, threshold_sum)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, levelId, previousLevelId, reason, thresholdSum],
  );
}

export async function markSpendTransactionsCompleted(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE loyalty_transactions SET status = 'completed' WHERE order_id = ? AND type = 'spend' AND status = 'pending'", [orderId]);
}

export async function getOrderBonusLock(orderId, { connection = null, forUpdate = false } = {}) {
  const executor = getExecutor(connection);
  const selectSql = forUpdate
    ? "SELECT id, bonus_earn_locked, bonus_earn_amount FROM orders WHERE id = ? FOR UPDATE"
    : "SELECT id, bonus_earn_locked, bonus_earn_amount FROM orders WHERE id = ?";
  const [rows] = await executor.query(selectSql, [orderId]);
  return rows[0] || null;
}

export async function lockOrderBonusEarn(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [result] = await executor.query("UPDATE orders SET bonus_earn_locked = TRUE WHERE id = ? AND bonus_earn_locked = FALSE", [orderId]);
  return result.affectedRows || 0;
}

export async function updateOrderBonusEarnAmount(orderId, amount, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE orders SET bonus_earn_amount = ? WHERE id = ?", [amount, orderId]);
}

export async function unlockOrderBonusEarn(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE orders SET bonus_earn_locked = FALSE WHERE id = ?", [orderId]);
}

export async function resetOrderBonusSpent(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query("UPDATE orders SET bonus_spent = 0 WHERE id = ?", [orderId]);
}

export async function getOrderSpendTotal(orderId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_transactions WHERE order_id = ? AND type = 'spend' AND status IN ('pending','completed')",
    [orderId],
  );
  return Number(rows[0]?.total) || 0;
}

export async function getUserById(userId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT u.id, u.first_name, u.last_name, u.phone, u.loyalty_balance, u.loyalty_joined_at, u.current_loyalty_level_id
     FROM users u
     WHERE u.id = ?`,
    [userId],
  );
  return rows[0] || null;
}

export async function getOrdersByUserAndCities(userId, cityIds, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query("SELECT id FROM orders WHERE user_id = ? AND city_id IN (?) LIMIT 1", [userId, cityIds]);
  return rows;
}

export async function getUsersForBirthday(month, day, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT id, loyalty_balance
     FROM users
     WHERE date_of_birth IS NOT NULL
       AND MONTH(date_of_birth) = ?
       AND DAY(date_of_birth) = ?`,
    [month, day],
  );
  return rows;
}

export async function getBirthdayTransaction(userId, year, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT id FROM loyalty_transactions WHERE user_id = ? AND type = 'birthday' AND YEAR(created_at) = ? LIMIT 1",
    [userId, year],
  );
  return rows[0] || null;
}

export async function getRegistrationTransaction(userId, { connection = null } = {}) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query("SELECT id FROM loyalty_transactions WHERE user_id = ? AND type = 'registration' LIMIT 1", [userId]);
  return rows[0] || null;
}

export async function insertExpireTransaction({ userId, amount, relatedId, expiresAt }, { connection = null } = {}) {
  const executor = getExecutor(connection);
  await executor.query(
    `INSERT INTO loyalty_transactions
     (user_id, type, status, amount, related_transaction_id, description, expires_at)
     VALUES (?, 'expire', 'completed', ?, ?, 'Истечение бонусов', ?)`,
    [userId, amount, relatedId, expiresAt],
  );
}

export default {
  getUserLoyaltySnapshot,
  updateUserBalance,
  updateUserLevel,
  ensureUserLoyaltyDefaults,
  getLoyaltyLevels,
  getTotalSpentForPeriod,
  getExpiringBonuses,
  getLoyaltyHistory,
  getLoyaltyTransactions,
  getLoyaltySummary,
  getLoyaltyLevelHistory,
  getLoyaltyTransaction,
  getOrderLoyaltyTransactions,
  insertLoyaltyTransaction,
  updateTransactionRemaining,
  updateTransactionStatus,
  updateTransactionStatusAndRemaining,
  getTransactionById,
  getEarnTransactions,
  insertLevelHistory,
  markSpendTransactionsCompleted,
  getOrderBonusLock,
  lockOrderBonusEarn,
  updateOrderBonusEarnAmount,
  unlockOrderBonusEarn,
  resetOrderBonusSpent,
  getOrderSpendTotal,
  getUserById,
  getOrdersByUserAndCities,
  getUsersForBirthday,
  getBirthdayTransaction,
  getRegistrationTransaction,
  insertExpireTransaction,
};
