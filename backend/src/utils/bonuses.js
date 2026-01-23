import db from "../config/database.js";
const LOYALTY_LEVELS = {
  1: { name: "Бронза", earnRate: 0.05, threshold: 0 },
  2: { name: "Серебро", earnRate: 0.07, threshold: 10000 },
  3: { name: "Золото", earnRate: 0.1, threshold: 50000 },
};
const BONUS_RULES = {
  maxUsePercent: 0.5,
};
export function calculateEarnedBonuses(orderTotal, loyaltyLevel = 1) {
  const level = LOYALTY_LEVELS[loyaltyLevel] || LOYALTY_LEVELS[1];
  return Math.floor(orderTotal * level.earnRate);
}
export function calculateMaxUsableBonuses(orderSubtotal) {
  return Math.floor(orderSubtotal * BONUS_RULES.maxUsePercent);
}
export async function validateBonusUsage(userId, bonusToUse, orderSubtotal) {
  if (!bonusToUse || bonusToUse <= 0) {
    return { valid: true, amount: 0 };
  }
  const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return { valid: false, error: "User not found" };
  }
  const userBalance = parseFloat(users[0].bonus_balance);
  if (bonusToUse > userBalance) {
    return {
      valid: false,
      error: `Insufficient bonus balance. Available: ${userBalance}`,
    };
  }
  const maxUsable = calculateMaxUsableBonuses(orderSubtotal);
  if (bonusToUse > maxUsable) {
    return {
      valid: false,
      error: `Maximum ${maxUsable} bonuses can be used for this order`,
    };
  }
  return { valid: true, amount: bonusToUse };
}
export async function checkLevelUp(userId) {
  const [users] = await db.query("SELECT loyalty_level, total_spent FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return null;
  }
  const currentLevel = users[0].loyalty_level || 1;
  const totalSpent = parseFloat(users[0].total_spent) || 0;
  let newLevel = currentLevel;
  if (totalSpent >= LOYALTY_LEVELS[3].threshold && currentLevel < 3) {
    newLevel = 3;
  } else if (totalSpent >= LOYALTY_LEVELS[2].threshold && currentLevel < 2) {
    newLevel = 2;
  }
  if (newLevel !== currentLevel) {
    await db.query("UPDATE users SET loyalty_level = ? WHERE id = ?", [newLevel, userId]);
    try {
      const { wsServer } = await import("../index.js");
      wsServer.notifyLevelUp(userId, newLevel, LOYALTY_LEVELS[newLevel].name);
    } catch (wsError) {
      console.error("Failed to send WebSocket notification:", wsError);
    }
    return {
      old_level: currentLevel,
      new_level: newLevel,
      level_name: LOYALTY_LEVELS[newLevel].name,
    };
  }
  return null;
}
export async function earnBonuses(userId, orderId, orderTotal, description = null) {
  const [users] = await db.query("SELECT loyalty_level, bonus_balance FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    throw new Error("User not found");
  }
  const loyaltyLevel = users[0].loyalty_level || 1;
  const amount = calculateEarnedBonuses(orderTotal, loyaltyLevel);
  if (amount <= 0) {
    return null;
  }
  await db.query("UPDATE users SET bonus_balance = bonus_balance + ?, total_spent = total_spent + ? WHERE id = ?", [amount, orderTotal, userId]);
  const [updatedUsers] = await db.query("SELECT bonus_balance, total_spent FROM users WHERE id = ?", [userId]);
  const newBalance = parseFloat(updatedUsers[0].bonus_balance);
  const newTotalSpent = parseFloat(updatedUsers[0].total_spent);
  const [result] = await db.query(
    `INSERT INTO bonus_history 
     (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'earned', ?, ?, ?)`,
    [userId, orderId, amount, newBalance, description || `Начисление бонусов (уровень ${LOYALTY_LEVELS[loyaltyLevel].name})`],
  );
  const levelUp = await checkLevelUp(userId);
  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(userId, newBalance, {
      type: "earned",
      amount,
      orderId,
      level_up: levelUp,
    });
  } catch (wsError) {
    console.error("Failed to send WebSocket notification:", wsError);
  }
  return {
    id: result.insertId,
    amount,
    balance_after: newBalance,
    total_spent: newTotalSpent,
    level_up: levelUp,
  };
}
export async function useBonuses(userId, orderId, amount, description = null, connection = null) {
  if (amount <= 0) {
    return null;
  }
  const executor = connection || db;
  const maxAttempts = 3;
  const selectBalanceSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [users] = await executor.query(selectBalanceSql, [userId]);
      if (users.length === 0) {
        throw new Error("User not found");
      }
      const currentBalance = parseFloat(users[0].bonus_balance);
      if (amount > currentBalance) {
        throw new Error("Insufficient bonus balance");
      }
      const newBalance = currentBalance - amount;
      await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);
      const [result] = await executor.query(
        `INSERT INTO bonus_history 
         (user_id, order_id, type, amount, balance_after, description)
         VALUES (?, ?, 'used', ?, ?, ?)`,
        [userId, orderId, amount, newBalance, description || "Списание бонусов"],
      );
      try {
        const { wsServer } = await import("../index.js");
        wsServer.notifyBonusUpdate(userId, newBalance, {
          type: "used",
          amount,
          orderId,
        });
      } catch (wsError) {
        console.error("Failed to send WebSocket notification:", wsError);
      }
      return {
        id: result.insertId,
        amount,
        balance_after: newBalance,
      };
    } catch (error) {
      const isLockError = error?.code === "ER_LOCK_WAIT_TIMEOUT" || error?.code === "ER_LOCK_DEADLOCK";
      if (!isLockError || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
  return null;
}
export async function getBonusHistory(userId, limit = 50, offset = 0) {
  const [history] = await db.query(
    `SELECT 
      bh.id, 
      bh.order_id, 
      o.order_number,
      bh.type, 
      bh.amount, 
      bh.balance_after, 
      bh.description, 
      bh.created_at
     FROM bonus_history bh
     LEFT JOIN orders o ON bh.order_id = o.id
     WHERE bh.user_id = ?
     ORDER BY bh.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return history;
}
export default {
  calculateEarnedBonuses,
  calculateMaxUsableBonuses,
  validateBonusUsage,
  earnBonuses,
  useBonuses,
  getBonusHistory,
  checkLevelUp,
};
