import db from "../config/database.js";
import { invalidateBonusCache } from "../utils/bonuses.js";

const normalizeAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

async function rebuildUser(userId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [earnRows] = await connection.query(
      "SELECT id, amount, expires_at FROM loyalty_transactions WHERE user_id = ? AND type = 'earn' ORDER BY expires_at ASC, id ASC FOR UPDATE",
      [userId],
    );
    const [spendRows] = await connection.query(
      "SELECT id, amount FROM loyalty_transactions WHERE user_id = ? AND type = 'spend' ORDER BY created_at ASC, id ASC",
      [userId],
    );
    const earns = earnRows.map((row) => ({
      id: row.id,
      expires_at: row.expires_at,
      remaining: normalizeAmount(row.amount),
    }));
    let remainingSpend = spendRows.reduce((sum, row) => sum + normalizeAmount(row.amount), 0);
    for (const earn of earns) {
      if (remainingSpend <= 0) break;
      const delta = Math.min(earn.remaining, remainingSpend);
      earn.remaining = Math.max(0, earn.remaining - delta);
      remainingSpend -= delta;
    }
    for (const earn of earns) {
      await connection.query("UPDATE loyalty_transactions SET amount = ? WHERE id = ?", [earn.remaining, earn.id]);
    }
    const now = Date.now();
    const activeBalance = earns.reduce((sum, earn) => {
      if (!earn.expires_at) return sum;
      const expiresAt = new Date(earn.expires_at).getTime();
      if (expiresAt > now) return sum + earn.remaining;
      return sum;
    }, 0);
    await connection.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [activeBalance, userId]);
    await connection.commit();
    await invalidateBonusCache(userId);
  } catch (error) {
    await connection.rollback();
    console.error(`Ошибка пересчета бонусов пользователя ${userId}:`, error);
  } finally {
    connection.release();
  }
}

async function rebuildAll() {
  const [users] = await db.query("SELECT id FROM users");
  for (const user of users) {
    await rebuildUser(user.id);
  }
  process.exit(0);
}

rebuildAll().catch((error) => {
  console.error("Ошибка запуска пересчета бонусов:", error);
  process.exit(1);
});
