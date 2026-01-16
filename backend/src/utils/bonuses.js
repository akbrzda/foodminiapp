import db from "../config/database.js";

/**
 * Правила бонусной программы (можно вынести в конфиг)
 */
const LOYALTY_LEVELS = {
  1: { name: "Бронза", earnRate: 0.05, threshold: 0 }, // 5% от суммы, порог 0₽
  2: { name: "Серебро", earnRate: 0.07, threshold: 10000 }, // 7% от суммы, порог 10,000₽
  3: { name: "Золото", earnRate: 0.1, threshold: 50000 }, // 10% от суммы, порог 50,000₽
};

const BONUS_RULES = {
  maxUsePercent: 0.5, // Максимум 50% от суммы заказа можно оплатить бонусами
};

/**
 * Рассчитать количество бонусов к начислению на основе уровня лояльности
 */
export function calculateEarnedBonuses(orderTotal, loyaltyLevel = 1) {
  const level = LOYALTY_LEVELS[loyaltyLevel] || LOYALTY_LEVELS[1];
  return Math.floor(orderTotal * level.earnRate);
}

/**
 * Рассчитать максимальное количество бонусов для списания
 */
export function calculateMaxUsableBonuses(orderSubtotal) {
  return Math.floor(orderSubtotal * BONUS_RULES.maxUsePercent);
}

/**
 * Валидация использования бонусов
 */
export async function validateBonusUsage(userId, bonusToUse, orderSubtotal) {
  if (!bonusToUse || bonusToUse <= 0) {
    return { valid: true, amount: 0 };
  }

  // Получаем текущий баланс пользователя
  const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);

  if (users.length === 0) {
    return { valid: false, error: "User not found" };
  }

  const userBalance = parseFloat(users[0].bonus_balance);

  // Проверяем достаточно ли бонусов
  if (bonusToUse > userBalance) {
    return {
      valid: false,
      error: `Insufficient bonus balance. Available: ${userBalance}`,
    };
  }

  // Проверяем не превышает ли лимит
  const maxUsable = calculateMaxUsableBonuses(orderSubtotal);
  if (bonusToUse > maxUsable) {
    return {
      valid: false,
      error: `Maximum ${maxUsable} bonuses can be used for this order`,
    };
  }

  return { valid: true, amount: bonusToUse };
}

/**
 * Проверить и повысить уровень лояльности пользователя
 */
export async function checkLevelUp(userId) {
  // Получаем текущий уровень и total_spent
  const [users] = await db.query("SELECT loyalty_level, total_spent FROM users WHERE id = ?", [userId]);

  if (users.length === 0) {
    return null;
  }

  const currentLevel = users[0].loyalty_level || 1;
  const totalSpent = parseFloat(users[0].total_spent) || 0;

  // Определяем новый уровень на основе total_spent
  let newLevel = currentLevel;
  if (totalSpent >= LOYALTY_LEVELS[3].threshold && currentLevel < 3) {
    newLevel = 3;
  } else if (totalSpent >= LOYALTY_LEVELS[2].threshold && currentLevel < 2) {
    newLevel = 2;
  }

  // Если уровень изменился, обновляем
  if (newLevel !== currentLevel) {
    await db.query("UPDATE users SET loyalty_level = ? WHERE id = ?", [newLevel, userId]);

    // WebSocket: уведомление о повышении уровня
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

/**
 * Начислить бонусы пользователю и обновить total_spent
 */
export async function earnBonuses(userId, orderId, orderTotal, description = null) {
  // Получаем текущий уровень пользователя
  const [users] = await db.query("SELECT loyalty_level, bonus_balance FROM users WHERE id = ?", [userId]);

  if (users.length === 0) {
    throw new Error("User not found");
  }

  const loyaltyLevel = users[0].loyalty_level || 1;

  // Рассчитываем бонусы на основе уровня
  const amount = calculateEarnedBonuses(orderTotal, loyaltyLevel);

  if (amount <= 0) {
    return null;
  }

  // Обновляем баланс бонусов и total_spent
  await db.query("UPDATE users SET bonus_balance = bonus_balance + ?, total_spent = total_spent + ? WHERE id = ?", [amount, orderTotal, userId]);

  // Получаем новый баланс
  const [updatedUsers] = await db.query("SELECT bonus_balance, total_spent FROM users WHERE id = ?", [userId]);
  const newBalance = parseFloat(updatedUsers[0].bonus_balance);
  const newTotalSpent = parseFloat(updatedUsers[0].total_spent);

  // Записываем в историю
  const [result] = await db.query(
    `INSERT INTO bonus_history 
     (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'earned', ?, ?, ?)`,
    [userId, orderId, amount, newBalance, description || `Начисление бонусов (уровень ${LOYALTY_LEVELS[loyaltyLevel].name})`]
  );

  // Проверяем повышение уровня
  const levelUp = await checkLevelUp(userId);

  // WebSocket: уведомление о начислении бонусов
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

/**
 * Списать бонусы у пользователя
 */
export async function useBonuses(userId, orderId, amount, description = null, connection = null) {
  if (amount <= 0) {
    return null;
  }

  const executor = connection || db;
  const maxAttempts = 3;
  const selectBalanceSql = connection ? "SELECT bonus_balance FROM users WHERE id = ? FOR UPDATE" : "SELECT bonus_balance FROM users WHERE id = ?";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Проверяем достаточно ли бонусов
      const [users] = await executor.query(selectBalanceSql, [userId]);

      if (users.length === 0) {
        throw new Error("User not found");
      }

      const currentBalance = parseFloat(users[0].bonus_balance);
      if (amount > currentBalance) {
        throw new Error("Insufficient bonus balance");
      }

      const newBalance = currentBalance - amount;

      // Списываем бонусы
      await executor.query("UPDATE users SET bonus_balance = ? WHERE id = ?", [newBalance, userId]);

      // Записываем в историю
      const [result] = await executor.query(
        `INSERT INTO bonus_history 
         (user_id, order_id, type, amount, balance_after, description)
         VALUES (?, ?, 'used', ?, ?, ?)`,
        [userId, orderId, amount, newBalance, description || "Списание бонусов"]
      );

      // WebSocket: уведомление о списании бонусов
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

/**
 * Получить историю бонусов пользователя
 */
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
    [userId, limit, offset]
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
