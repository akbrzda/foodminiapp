import db from "../../../config/database.js";
import { buildSegmentQuery } from "./segmentService.js";
import { buildPersonalizedText, getUsersBroadcastData, getUserBroadcastData } from "./personalizationService.js";
import { getCampaignById, updateCampaign } from "../models/broadcastCampaigns.js";
import { insertMessages, countPendingMessages } from "../models/broadcastMessages.js";
import { insertQueueItems } from "../models/broadcastQueue.js";
import { upsertCampaignStats, incrementTotalRecipients } from "../models/broadcastStats.js";

const DEFAULT_BATCH_SIZE = 1000;

const notifyCampaignStatus = async (campaign) => {
  if (!campaign) return;
  try {
    const { wsServer } = await import("../../../index.js");
    wsServer.notifyBroadcastStatusChange(campaign.id, campaign.status, {
      started_at: campaign.started_at,
      completed_at: campaign.completed_at,
    });
  } catch (error) {
    console.error("Broadcast WS status error:", error);
  }
};

const notifyCampaignCompleted = async (campaignId) => {
  try {
    const [{ wsServer }, { getCampaignStats }] = await Promise.all([
      import("../../../index.js"),
      import("./statisticsService.js"),
    ]);
    const stats = await getCampaignStats(campaignId);
    wsServer.notifyBroadcastCompleted(campaignId, { stats });
  } catch (error) {
    console.error("Broadcast WS completed error:", error);
  }
};

const getTimePartsInTimeZone = (timeZone, date) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
};

const buildUtcDateFromParts = (parts) => {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0));
};

const getNextScheduleAt = (timeZone, targetHour, baseDate = new Date()) => {
  let parts;
  try {
    parts = getTimePartsInTimeZone(timeZone, baseDate);
  } catch (error) {
    parts = getTimePartsInTimeZone("Europe/Moscow", baseDate);
  }
  const currentLocal = buildUtcDateFromParts(parts);
  const scheduledParts = { ...parts, hour: Number(targetHour), minute: 0, second: 0 };
  let scheduledAt = buildUtcDateFromParts(scheduledParts);
  if (currentLocal >= scheduledAt) {
    const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, targetHour, 0, 0));
    scheduledAt = nextDay;
  }
  return scheduledAt;
};

const normalizeScheduledAt = (campaign, userData, now) => {
  if (campaign.scheduled_at) {
    return new Date(campaign.scheduled_at);
  }
  if (campaign.target_hour !== null && campaign.target_hour !== undefined) {
    const timezone = campaign.use_user_timezone ? userData.timezone : "Europe/Moscow";
    return getNextScheduleAt(timezone || "Europe/Moscow", campaign.target_hour, now);
  }
  return now;
};

const mapMessageRows = (campaign, userRows, userDataMap, now) => {
  return userRows
    .map((row) => {
      const data = userDataMap[row.id];
      if (!data) return null;
      const personalized = buildPersonalizedText(campaign.content_text, data);
      const scheduledAt = normalizeScheduledAt(campaign, data, now);
      return {
        campaign_id: campaign.id,
        user_id: row.id,
        personalized_text: personalized,
        scheduled_at: scheduledAt,
        status: "pending",
      };
    })
    .filter(Boolean);
};

const createMessagesWithQueue = async (messages, executor = db) => {
  if (!messages.length) return { inserted: 0 };
  const result = await insertMessages(messages, executor);
  const insertId = result.insertId;
  const inserted = result.affectedRows || 0;
  if (!inserted) return { inserted: 0 };
  const queueItems = messages.map((message, index) => ({
    message_id: insertId + index,
    priority: 0,
    scheduled_at: message.scheduled_at,
  }));
  await insertQueueItems(queueItems, executor);
  return { inserted };
};

export async function enqueueCampaignMessages(campaignId, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    throw new Error("Рассылка не найдена");
  }
  if (!campaign.segment_config) {
    throw new Error("Для рассылки не задана конфигурация сегментации");
  }
  const { sql, params } = buildSegmentQuery(campaign.segment_config, { select: "u.id, u.telegram_id" });
  const now = new Date();
  let offset = 0;
  let totalInserted = 0;
  let earliestSchedule = null;

  while (true) {
    const [rows] = await db.query(
      `SELECT segment.id, segment.telegram_id
       FROM (${sql}) as segment
       WHERE segment.telegram_id IS NOT NULL
       LIMIT ? OFFSET ?`,
      [...params, batchSize, offset],
    );
    if (!rows.length) break;
    const userIds = rows.map((row) => row.id);
    const userDataMap = await getUsersBroadcastData(userIds);
    const messages = mapMessageRows(campaign, rows, userDataMap, now);
    if (!messages.length) {
      offset += batchSize;
      continue;
    }
    for (const message of messages) {
      if (!earliestSchedule || message.scheduled_at < earliestSchedule) {
        earliestSchedule = message.scheduled_at;
      }
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { inserted } = await createMessagesWithQueue(messages, connection);
      await connection.commit();
      totalInserted += inserted;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    offset += batchSize;
  }

  if (totalInserted > 0) {
    await upsertCampaignStats(campaign.id, totalInserted);
  }

  if (totalInserted > 0) {
    const hasFutureSchedule = earliestSchedule && earliestSchedule > now;
    const updated = await updateCampaign(campaign.id, {
      status: hasFutureSchedule ? "scheduled" : "sending",
      started_at: hasFutureSchedule ? null : now,
    });
    await notifyCampaignStatus(updated);
  }

  return { totalRecipients: totalInserted };
}

export async function enqueueUsersForCampaign(campaignId, userRows, { batchSize = DEFAULT_BATCH_SIZE, triggerDate = null } = {}) {
  if (!userRows.length) return { totalRecipients: 0 };
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    throw new Error("Рассылка не найдена");
  }
  const now = new Date();
  let totalInserted = 0;

  for (let i = 0; i < userRows.length; i += batchSize) {
    const batchRows = userRows.slice(i, i + batchSize);
    const userIds = batchRows.map((row) => row.id);
    const userDataMap = await getUsersBroadcastData(userIds);
    const messages = mapMessageRows(campaign, batchRows, userDataMap, now);
    if (!messages.length) continue;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { inserted } = await createMessagesWithQueue(messages, connection);
      await connection.commit();
      totalInserted += inserted;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  if (totalInserted > 0) {
    await incrementTotalRecipients(campaign.id, totalInserted);
    const updated = await updateCampaign(campaign.id, {
      status: "sending",
      started_at: now,
      is_active: campaign.is_active,
    });
    await notifyCampaignStatus(updated);
  }

  return { totalRecipients: totalInserted, triggerDate };
}

export async function previewCampaignForUser(campaignId, userId) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    throw new Error("Рассылка не найдена");
  }
  const userData = await getUserBroadcastData(userId);
  if (!userData) {
    throw new Error("Пользователь не найден");
  }
  const text = buildPersonalizedText(campaign.content_text, userData);
  return {
    campaign,
    user: userData,
    text,
  };
}

export async function checkCampaignCompletion(campaignId) {
  const pending = await countPendingMessages(campaignId);
  if (pending === 0) {
    const updated = await updateCampaign(campaignId, { status: "completed", completed_at: new Date() });
    await notifyCampaignStatus(updated);
    await notifyCampaignCompleted(campaignId);
    return true;
  }
  return false;
}

export default {
  enqueueCampaignMessages,
  enqueueUsersForCampaign,
  previewCampaignForUser,
  checkCampaignCompletion,
};
