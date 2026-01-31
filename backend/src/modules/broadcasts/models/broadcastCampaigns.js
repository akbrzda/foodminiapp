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

export async function createCampaign(payload, executor = db) {
  const [result] = await executor.query(
    `INSERT INTO broadcast_campaigns
     (name, description, type, status, trigger_type, trigger_config, segment_id, segment_config, content_text,
      content_image_url, content_buttons, scheduled_at, use_user_timezone, target_hour, is_active, created_by,
      started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.description || null,
      payload.type,
      payload.status,
      payload.trigger_type || null,
      toJson(payload.trigger_config),
      payload.segment_id || null,
      toJson(payload.segment_config),
      payload.content_text,
      payload.content_image_url || null,
      toJson(payload.content_buttons),
      payload.scheduled_at || null,
      payload.use_user_timezone ?? 1,
      payload.target_hour ?? null,
      payload.is_active ?? 1,
      payload.created_by,
      payload.started_at || null,
      payload.completed_at || null,
    ],
  );
  return result.insertId;
}

export async function updateCampaign(campaignId, payload, executor = db) {
  const updates = [];
  const values = [];
  const addUpdate = (field, value) => {
    updates.push(`${field} = ?`);
    values.push(value);
  };
  if (payload.name !== undefined) addUpdate("name", payload.name);
  if (payload.description !== undefined) addUpdate("description", payload.description || null);
  if (payload.type !== undefined) addUpdate("type", payload.type);
  if (payload.status !== undefined) addUpdate("status", payload.status);
  if (payload.trigger_type !== undefined) addUpdate("trigger_type", payload.trigger_type || null);
  if (payload.trigger_config !== undefined) addUpdate("trigger_config", toJson(payload.trigger_config));
  if (payload.segment_id !== undefined) addUpdate("segment_id", payload.segment_id || null);
  if (payload.segment_config !== undefined) addUpdate("segment_config", toJson(payload.segment_config));
  if (payload.content_text !== undefined) addUpdate("content_text", payload.content_text);
  if (payload.content_image_url !== undefined) addUpdate("content_image_url", payload.content_image_url || null);
  if (payload.content_buttons !== undefined) addUpdate("content_buttons", toJson(payload.content_buttons));
  if (payload.scheduled_at !== undefined) addUpdate("scheduled_at", payload.scheduled_at || null);
  if (payload.use_user_timezone !== undefined) addUpdate("use_user_timezone", payload.use_user_timezone ? 1 : 0);
  if (payload.target_hour !== undefined) addUpdate("target_hour", payload.target_hour ?? null);
  if (payload.is_active !== undefined) addUpdate("is_active", payload.is_active ? 1 : 0);
  if (payload.created_by !== undefined) addUpdate("created_by", payload.created_by);
  if (payload.started_at !== undefined) addUpdate("started_at", payload.started_at || null);
  if (payload.completed_at !== undefined) addUpdate("completed_at", payload.completed_at || null);

  if (!updates.length) return null;
  values.push(campaignId);
  await executor.query(`UPDATE broadcast_campaigns SET ${updates.join(", ")} WHERE id = ?`, values);
  return getCampaignById(campaignId, executor);
}

export async function getCampaignById(campaignId, executor = db) {
  const [rows] = await executor.query(
    `SELECT id, name, description, type, status, trigger_type, trigger_config, segment_id, segment_config,
            content_text, content_image_url, content_buttons, scheduled_at, use_user_timezone, target_hour,
            is_active, created_by, started_at, completed_at, created_at, updated_at
     FROM broadcast_campaigns
     WHERE id = ?`,
    [campaignId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...row,
    trigger_config: fromJson(row.trigger_config),
    segment_config: fromJson(row.segment_config),
    content_buttons: fromJson(row.content_buttons),
  };
}

export async function listCampaigns({ limit = 50, offset = 0 } = {}, executor = db) {
  const [rows] = await executor.query(
    `SELECT id, name, description, type, status, trigger_type, trigger_config, segment_id, segment_config,
            content_text, content_image_url, content_buttons, scheduled_at, use_user_timezone, target_hour,
            is_active, created_by, started_at, completed_at, created_at, updated_at
     FROM broadcast_campaigns
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    trigger_config: fromJson(row.trigger_config),
    segment_config: fromJson(row.segment_config),
    content_buttons: fromJson(row.content_buttons),
  }));
}

export default {
  createCampaign,
  updateCampaign,
  getCampaignById,
  listCampaigns,
};
