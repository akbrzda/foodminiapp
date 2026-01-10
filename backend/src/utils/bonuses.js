import db from "../config/database.js";

/**
 * Правила бонусной программы (можно вынести в конфиг)
 */
const BONUS_RULES = {
  earnRate: 0.03, // 3% от суммы заказа начисляется бонусами
  maxUsePercent: 0.25, // Максимум 25% от суммы заказа можно оплатить бонусами
  minOrderForBonus: 500, // Минимальная сумма заказа для начисления бонусов
};

/**
 * Рассчитать количество бонусов к начислению
 */
export function calculateEarnedBonuses(orderTotal) {
  if (orderTotal < BONUS_RULES.minOrderForBonus) {
    return 0;
  }
  return Math.floor(orderTotal * BONUS_RULES.earnRate);
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
 * Начислить бонусы пользователю
 */
export async function earnBonuses(userId, orderId, amount, description = null) {
  if (amount <= 0) {
    return null;
  }

  // Обновляем баланс пользователя
  await db.query("UPDATE users SET bonus_balance = bonus_balance + ? WHERE id = ?", [amount, userId]);

  // Получаем новый баланс
  const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
  const newBalance = parseFloat(users[0].bonus_balance);

  // Записываем в историю
  const [result] = await db.query(
    `INSERT INTO bonus_history 
     (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'earned', ?, ?, ?)`,
    [userId, orderId, amount, newBalance, description || "Bonus earned from order"]
  );

  // WebSocket: уведомление о начислении бонусов
  try {
    const { wsServer } = await import("../index.js");
    wsServer.notifyBonusUpdate(userId, newBalance, {
      type: "earned",
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
}

/**
 * Списать бонусы у пользователя
 */
export async function useBonuses(userId, orderId, amount, description = null) {
  if (amount <= 0) {
    return null;
  }

  // Проверяем достаточно ли бонусов
  const [users] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);

  if (users.length === 0) {
    throw new Error("User not found");
  }

  const currentBalance = parseFloat(users[0].bonus_balance);
  if (amount > currentBalance) {
    throw new Error("Insufficient bonus balance");
  }

  // Списываем бонусы
  await db.query("UPDATE users SET bonus_balance = bonus_balance - ? WHERE id = ?", [amount, userId]);

  // Получаем новый баланс
  const [updatedUsers] = await db.query("SELECT bonus_balance FROM users WHERE id = ?", [userId]);
  const newBalance = parseFloat(updatedUsers[0].bonus_balance);

  // Записываем в историю
  const [result] = await db.query(
    `INSERT INTO bonus_history 
     (user_id, order_id, type, amount, balance_after, description)
     VALUES (?, ?, 'used', ?, ?, ?)`,
    [userId, orderId, amount, newBalance, description || "Bonus used for order"]
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
}

/**
 * Получить историю бонусов пользователя
 */
export async function getBonusHistory(userId, limit = 50, offset = 0) {
  const [history] = await db.query(
    `SELECT id, order_id, type, amount, balance_after, description, created_at
     FROM bonus_history
     WHERE user_id = ?
     ORDER BY created_at DESC
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
};
