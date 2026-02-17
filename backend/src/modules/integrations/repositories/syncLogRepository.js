import db from "../../../config/database.js";

const safeJson = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ serialization_error: true });
  }
};

export async function createSyncLog(payload) {
  const {
    integrationType,
    module,
    action,
    status,
    entityType = null,
    entityId = null,
    errorMessage = null,
    requestData = null,
    responseData = null,
    attempts = 0,
    durationMs = null,
  } = payload;

  const [result] = await db.query(
    `INSERT INTO integration_sync_logs
      (integration_type, module, action, status, entity_type, entity_id, error_message, request_data, response_data, attempts, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      integrationType,
      module,
      action,
      status,
      entityType,
      entityId ? String(entityId) : null,
      errorMessage,
      safeJson(requestData),
      safeJson(responseData),
      Number(attempts) || 0,
      durationMs,
    ],
  );
  return result?.insertId || null;
}

export async function updateSyncLog(logId, patch = {}) {
  const id = Number(logId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const fields = [];
  const params = [];

  if (patch.status !== undefined) {
    fields.push("status = ?");
    params.push(patch.status);
  }
  if (patch.errorMessage !== undefined) {
    fields.push("error_message = ?");
    params.push(patch.errorMessage);
  }
  if (patch.requestData !== undefined) {
    fields.push("request_data = ?");
    params.push(safeJson(patch.requestData));
  }
  if (patch.responseData !== undefined) {
    fields.push("response_data = ?");
    params.push(safeJson(patch.responseData));
  }
  if (patch.attempts !== undefined) {
    fields.push("attempts = ?");
    params.push(Number(patch.attempts) || 0);
  }
  if (patch.durationMs !== undefined) {
    fields.push("duration_ms = ?");
    params.push(patch.durationMs);
  }

  if (fields.length === 0) return false;

  await db.query(
    `UPDATE integration_sync_logs
     SET ${fields.join(", ")}
     WHERE id = ?`,
    [...params, id],
  );
  return true;
}

export async function getSyncLogs({ page = 1, limit = 50, integrationType, module, status, dateFrom, dateTo }) {
  const offset = Math.max(0, (Number(page) - 1) * Number(limit));
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 50));

  const whereParts = [];
  const params = [];

  if (integrationType) {
    whereParts.push("integration_type = ?");
    params.push(integrationType);
  }
  if (module) {
    whereParts.push("module = ?");
    params.push(module);
  }
  if (status) {
    whereParts.push("status = ?");
    params.push(status);
  }
  if (dateFrom) {
    whereParts.push("created_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    whereParts.push("created_at <= ?");
    params.push(dateTo);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT *
     FROM integration_sync_logs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, normalizedLimit, offset],
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) as total
     FROM integration_sync_logs
     ${whereSql}`,
    params,
  );

  return {
    rows,
    total: Number(countRows[0]?.total || 0),
    page: Number(page) || 1,
    limit: normalizedLimit,
  };
}
