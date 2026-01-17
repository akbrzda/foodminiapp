import db from "../config/database.js";

/**
 * Логирование действия администратора
 * @param {number} adminUserId - ID администратора
 * @param {string} action - Тип действия (create, update, delete)
 * @param {string} entityType - Тип объекта (category, item, modifier, order, polygon, settings, etc.)
 * @param {number} entityId - ID объекта
 * @param {object} details - Детали изменения (например, {before: {...}, after: {...}})
 * @param {string} ipAddress - IP адрес
 */
export async function logAdminAction(adminUserId, action, entityType, entityId, details = null, ipAddress = null) {
  try {
    const description = details ? JSON.stringify(details) : null;

    await db.query(
      `INSERT INTO admin_action_logs (admin_user_id, action, entity_type, entity_id, description, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminUserId, action, entityType, entityId, description, ipAddress],
    );
  } catch (error) {
    console.error("Ошибка записи лога администратора:", error);
    // Не пробрасываем ошибку, чтобы не ломать основную операцию
  }
}

/**
 * Middleware для автоматического логирования
 * Использует req.adminUser из middleware аутентификации
 */
export function autoLogMiddleware(action, entityType) {
  return (req, res, next) => {
    const originalSend = res.send;

    res.send = function (data) {
      // Логируем только успешные операции (2xx статус)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || req.body?.id || null;
        const ipAddress = req.ip || req.connection.remoteAddress;

        // Формируем детали для разных типов действий
        let details = null;
        if (action === "create") {
          details = { data: req.body };
        } else if (action === "update") {
          details = { before: req.originalData, after: req.body };
        } else if (action === "delete") {
          details = { deleted: req.originalData };
        }

        if (req.adminUser?.id) {
          logAdminAction(req.adminUser.id, action, entityType, entityId, details, ipAddress);
        }
      }

      originalSend.call(this, data);
    };

    next();
  };
}
