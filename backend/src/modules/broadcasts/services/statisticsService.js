import db from "../../../config/database.js";
import { incrementCampaignStat, upsertCampaignStats } from "../models/broadcastStats.js";

const DEFAULT_CONVERSION_WINDOW_DAYS = Number(process.env.BROADCAST_CONVERSION_WINDOW_DAYS || 7);

const notifyCampaignStatsUpdate = async (campaignId) => {
  try {
    const { wsServer } = await import("../../../index.js");
    const stats = await getCampaignStats(campaignId);
    wsServer.notifyBroadcastStatsUpdate(campaignId, stats);
  } catch (error) {
    console.error("Broadcast WS stats error:", error);
  }
};

export async function getCampaignStats(campaignId) {
  const [statsRows] = await db.query(
    `SELECT campaign_id, total_recipients, sent_count, failed_count, click_count, unique_clicks,
            conversion_count, conversion_amount, avg_send_time_seconds, updated_at
     FROM broadcast_stats
     WHERE campaign_id = ?`,
    [campaignId],
  );
  const stats = statsRows[0] || {
    campaign_id: campaignId,
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    click_count: 0,
    unique_clicks: 0,
    conversion_count: 0,
    conversion_amount: 0,
    avg_send_time_seconds: null,
    updated_at: null,
  };
  return stats;
}

export async function getCampaignMessages(campaignId, { status, limit = 50, offset = 0 } = {}) {
  const params = [campaignId];
  let statusSql = "";
  if (status) {
    statusSql = "AND m.status = ?";
    params.push(status);
  }
  params.push(Number(limit) || 50, Number(offset) || 0);
  const [rows] = await db.query(
    `SELECT m.id, m.user_id, m.status, m.telegram_message_id, m.sent_at, m.error_message, m.retry_count,
            u.first_name, u.last_name, u.phone
     FROM broadcast_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.campaign_id = ? ${statusSql}
     ORDER BY m.id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

export async function getCampaignConversions(campaignId, { limit = 50, offset = 0 } = {}) {
  const [rows] = await db.query(
    `SELECT bc.id, bc.user_id, bc.order_id, bc.order_total, bc.order_created_at, bc.days_after_broadcast,
            u.first_name, u.last_name, u.phone,
            o.order_number
     FROM broadcast_conversions bc
     JOIN users u ON u.id = bc.user_id
     JOIN orders o ON o.id = bc.order_id
     WHERE bc.campaign_id = ?
     ORDER BY bc.id DESC
     LIMIT ? OFFSET ?`,
    [campaignId, Number(limit) || 50, Number(offset) || 0],
  );
  return rows;
}

const normalizeDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPeriodWhere = ({ period, dateFrom, dateTo }) => {
  if (period === "custom") {
    const normalizedFrom = normalizeDateOnly(dateFrom);
    const normalizedTo = normalizeDateOnly(dateTo);
    if (!normalizedFrom || !normalizedTo) {
      const error = new Error("Для произвольного периода требуется дата начала и окончания");
      error.statusCode = 400;
      throw error;
    }
    if (normalizedFrom > normalizedTo) {
      const error = new Error("Дата окончания не может быть раньше даты начала");
      error.statusCode = 400;
      throw error;
    }
    return {
      where: "WHERE DATE(c.created_at) BETWEEN ? AND ?",
      params: [normalizedFrom, normalizedTo],
    };
  }
  if (!period || period === "all") return { where: "", params: [] };
  const now = new Date();
  let start;
  if (period === "week") {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "quarter") {
    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (period === "year") {
    start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
  if (!start) return { where: "", params: [] };
  return { where: "WHERE c.created_at >= ?", params: [start] };
};

export async function getDashboardStats({ period = "all", dateFrom = null, dateTo = null } = {}) {
  const { where, params } = getPeriodWhere({ period, dateFrom, dateTo });
  const [rows] = await db.query(
    `SELECT
        COUNT(c.id) as total_campaigns,
        SUM(CASE WHEN c.type = 'trigger' AND c.is_active = 1 THEN 1 ELSE 0 END) as active_triggers,
        COALESCE(SUM(s.sent_count), 0) as total_sent,
        COALESCE(SUM(s.conversion_count), 0) as total_conversions,
        COALESCE(SUM(s.conversion_amount), 0) as total_revenue
     FROM broadcast_campaigns c
     LEFT JOIN broadcast_stats s ON s.campaign_id = c.id
     ${where}`,
    params,
  );
  const stats = rows[0] || {
    total_campaigns: 0,
    active_triggers: 0,
    total_sent: 0,
    total_conversions: 0,
    total_revenue: 0,
  };
  const avgConversionRate = stats.total_sent ? (Number(stats.total_conversions || 0) / Number(stats.total_sent || 0)) * 100 : 0;
  return {
    ...stats,
    avg_conversion_rate: Number(avgConversionRate.toFixed(2)),
  };
}

export async function recordClick({ campaignId, messageId, userId, buttonIndex, buttonUrl }) {
  const safeUrl = buttonUrl || "";
  const [result] = await db.query(
    `INSERT IGNORE INTO broadcast_clicks (campaign_id, message_id, user_id, button_index, button_url, clicked_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [campaignId, messageId, userId, buttonIndex, safeUrl],
  );
  if (result.affectedRows > 0) {
    await upsertCampaignStats(campaignId, 0);
    await incrementCampaignStat(campaignId, "click_count", 1);
    await incrementCampaignStat(campaignId, "unique_clicks", 1);
    await notifyCampaignStatsUpdate(campaignId);
    return true;
  }
  return false;
}

export async function recordConversionForOrder(order) {
  const orderId = order?.id;
  const userId = order?.user_id;
  if (!orderId || !userId) return null;
  const [exists] = await db.query("SELECT id FROM broadcast_conversions WHERE order_id = ?", [orderId]);
  if (exists.length) return null;
  const [messages] = await db.query(
    `SELECT id, campaign_id, sent_at
     FROM broadcast_messages
     WHERE user_id = ?
       AND status = 'sent'
       AND sent_at IS NOT NULL
       AND sent_at >= DATE_SUB(?, INTERVAL ? DAY)
       AND sent_at <= ?
     ORDER BY sent_at DESC
     LIMIT 1`,
    [userId, order.created_at, DEFAULT_CONVERSION_WINDOW_DAYS, order.created_at],
  );
  if (!messages.length) return null;
  const message = messages[0];
  const daysAfter = Math.max(0, Math.floor((new Date(order.created_at).getTime() - new Date(message.sent_at).getTime()) / (24 * 60 * 60 * 1000)));
  await db.query(
    `INSERT INTO broadcast_conversions
     (campaign_id, message_id, user_id, order_id, order_total, order_created_at, days_after_broadcast, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [message.campaign_id, message.id, userId, orderId, order.total || 0, order.created_at, daysAfter],
  );
  await upsertCampaignStats(message.campaign_id, 0);
  await incrementCampaignStat(message.campaign_id, "conversion_count", 1);
  await incrementCampaignStat(message.campaign_id, "conversion_amount", Number(order.total || 0));
  await notifyCampaignStatsUpdate(message.campaign_id);
  return message.campaign_id;
}

export default {
  getCampaignStats,
  getCampaignMessages,
  getCampaignConversions,
  getDashboardStats,
  recordClick,
  recordConversionForOrder,
};
