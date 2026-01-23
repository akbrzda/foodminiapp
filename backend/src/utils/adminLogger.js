import db from "../config/database.js";
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
  }
}
export function autoLogMiddleware(action, entityType) {
  return (req, res, next) => {
    const originalSend = res.send;
    res.send = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || req.body?.id || null;
        const ipAddress = req.ip || req.connection.remoteAddress;
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
