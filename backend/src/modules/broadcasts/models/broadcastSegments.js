import db from "../../../config/database.js";

const toJson = (value) => (value === null || value === undefined ? null : JSON.stringify(value));
const fromJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

export async function createSegment(payload, executor = db) {
  const [result] = await executor.query(
    `INSERT INTO broadcast_segments
     (name, description, config, estimated_size, estimated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.description || null,
      toJson(payload.config),
      payload.estimated_size ?? null,
      payload.estimated_at || null,
      payload.created_by,
    ],
  );
  return result.insertId;
}

export async function updateSegment(segmentId, payload, executor = db) {
  const updates = [];
  const values = [];
  if (payload.name !== undefined) {
    updates.push("name = ?");
    values.push(payload.name);
  }
  if (payload.description !== undefined) {
    updates.push("description = ?");
    values.push(payload.description || null);
  }
  if (payload.config !== undefined) {
    updates.push("config = ?");
    values.push(toJson(payload.config));
  }
  if (payload.estimated_size !== undefined) {
    updates.push("estimated_size = ?");
    values.push(payload.estimated_size);
  }
  if (payload.estimated_at !== undefined) {
    updates.push("estimated_at = ?");
    values.push(payload.estimated_at);
  }
  if (!updates.length) {
    return null;
  }
  values.push(segmentId);
  await executor.query(`UPDATE broadcast_segments SET ${updates.join(", ")} WHERE id = ?`, values);
  return getSegmentById(segmentId, executor);
}

export async function updateSegmentEstimate(segmentId, estimatedSize, estimatedAt = new Date(), executor = db) {
  await executor.query(
    "UPDATE broadcast_segments SET estimated_size = ?, estimated_at = ? WHERE id = ?",
    [estimatedSize, estimatedAt, segmentId],
  );
}

export async function deleteSegment(segmentId, executor = db) {
  await executor.query("DELETE FROM broadcast_segments WHERE id = ?", [segmentId]);
}

export async function getSegmentById(segmentId, executor = db) {
  const [rows] = await executor.query(
    `SELECT id, name, description, config, estimated_size, estimated_at, created_by, created_at, updated_at
     FROM broadcast_segments
     WHERE id = ?`,
    [segmentId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...row,
    config: fromJson(row.config),
  };
}

export async function listSegments({ limit = 50, offset = 0 } = {}, executor = db) {
  const [rows] = await executor.query(
    `SELECT id, name, description, config, estimated_size, estimated_at, created_by, created_at, updated_at
     FROM broadcast_segments
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    config: fromJson(row.config),
  }));
}

export default {
  createSegment,
  updateSegment,
  updateSegmentEstimate,
  deleteSegment,
  getSegmentById,
  listSegments,
};
