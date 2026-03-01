import express from "express";
import db from "../../config/database.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import { logger } from "../../utils/logger.js";
import { answerCallbackQueryViaBot, sendBroadcastMessageViaBot } from "../../utils/botService.js";
import {
  createCampaign,
  updateCampaign,
  getCampaignById,
  listCampaigns,
} from "./models/broadcastCampaigns.js";
import {
  createSegmentWithEstimate,
  updateSegmentWithEstimate,
  deleteSegmentWithCache,
  getSegmentById,
  listSegments,
  calculateSegmentSize,
} from "./services/segmentService.js";
import {
  enqueueCampaignMessages,
  previewCampaignForUser,
} from "./services/broadcastService.js";
import {
  getCampaignStats,
  getCampaignMessages,
  getCampaignConversions,
  getDashboardStats,
  recordClick,
} from "./services/statisticsService.js";
import { listActiveTriggers } from "./services/triggerService.js";

const router = express.Router();

const ensureAdmin = [authenticateToken, requireRole("admin", "manager", "ceo")];
const ALLOWED_CAMPAIGN_TYPES = new Set(["manual", "trigger", "subscription_campaign"]);
const ALLOWED_CAMPAIGN_STATUSES = new Set(["draft", "scheduled", "sending", "completed", "cancelled", "failed"]);
const ALLOWED_TRIGGER_TYPES = new Set(["inactive_users", "birthday", "new_registration"]);

const parseJsonField = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const buildInlineKeyboard = (buttons, campaignId, messageId) => {
  if (!Array.isArray(buttons) || !buttons.length) return null;
  const rows = [];
  const perRow = 2;
  for (let i = 0; i < buttons.length; i += perRow) {
    const rowButtons = buttons.slice(i, i + perRow).map((button, index) => {
      const type = (button?.type || "url").toLowerCase();
      const text = button?.text || button?.label || "Перейти";
      if (type === "callback" || type === "callback_query") {
        return {
          text,
          callback_data: `broadcast:${campaignId}:${messageId}:${i + index}`,
        };
      }
      return {
        text,
        url: button?.url || "",
      };
    });
    rows.push(rowButtons);
  }
  return { inline_keyboard: rows };
};

const sendTestMessage = async ({ telegramId, text, imageUrl, buttons, campaignId }) => {
  const keyboard = buildInlineKeyboard(buttons, campaignId, `test-${Date.now()}`);
  const response = await sendBroadcastMessageViaBot({
    telegramId,
    text,
    imageUrl: imageUrl || null,
    parseMode: "Markdown",
    replyMarkup: keyboard || undefined,
  });
  return { message_id: response?.data?.message_id || null };
};

const resolveUserIdByTelegram = async (telegramId) => {
  if (!telegramId) return null;
  const [rows] = await db.query("SELECT id FROM users WHERE telegram_id = ? LIMIT 1", [telegramId]);
  return rows[0]?.id || null;
};

router.post("/telegram/callback", async (req, res) => {
  try {
    const callback = req.body?.callback_query;
    if (!callback?.data || !callback?.from?.id) {
      return res.json({ ok: true });
    }
    const parts = String(callback.data).split(":");
    if (parts.length < 4 || parts[0] !== "broadcast") {
      return res.json({ ok: true });
    }
    const campaignId = Number(parts[1]);
    const messageId = Number(parts[2]);
    const buttonIndex = Number(parts[3]);
    if (!campaignId || !messageId) {
      return res.json({ ok: true });
    }
    const [messages] = await db.query("SELECT user_id FROM broadcast_messages WHERE id = ?", [messageId]);
    const userId = messages[0]?.user_id;
    if (!userId) {
      return res.json({ ok: true });
    }
    const buttonUrl = null;
    await recordClick({ campaignId, messageId, userId, buttonIndex, buttonUrl });
    await answerCallbackQueryViaBot({
      callbackQueryId: callback.id,
      text: "Спасибо!",
      showAlert: false,
    }).catch(() => null);
    res.json({ ok: true });
  } catch (error) {
    logger.system.dbError(`Broadcast callback error: ${error.message}`);
    res.json({ ok: true });
  }
});

router.get("/dashboard", ensureAdmin, async (req, res, next) => {
  try {
    const { period = "all", date_from, date_to } = req.query;
    const data = await getDashboardStats({
      period,
      dateFrom: date_from,
      dateTo: date_to,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/triggers", ensureAdmin, async (req, res, next) => {
  try {
    const triggers = await listActiveTriggers({ useCache: false });
    res.json({ success: true, data: { items: triggers } });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/toggle", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { is_active } = req.body;
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Рассылка не найдена" });
    }
    if (campaign.type !== "trigger") {
      return res.status(400).json({ error: "Можно переключать только триггерные рассылки" });
    }
    const updated = await updateCampaign(campaignId, { is_active: Boolean(is_active) });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.get("/segments", ensureAdmin, async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const items = await listSegments({ limit: Number(limit), offset: Number(offset) });
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

router.post("/segments", ensureAdmin, async (req, res, next) => {
  try {
    const { name, description, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ error: "Укажите название и условия сегментации" });
    }
    const segmentPayload = {
      name,
      description: description || null,
      config: parseJsonField(config, config),
      created_by: req.user.id,
    };
    const created = await createSegmentWithEstimate(segmentPayload);
    const segment = await getSegmentById(created.id);
    res.status(201).json({ success: true, data: segment });
  } catch (error) {
    next(error);
  }
});

router.get("/segments/:id", ensureAdmin, async (req, res, next) => {
  try {
    const segment = await getSegmentById(Number(req.params.id));
    if (!segment) return res.status(404).json({ error: "Сегмент не найден" });
    res.json({ success: true, data: segment });
  } catch (error) {
    next(error);
  }
});

router.put("/segments/:id", ensureAdmin, async (req, res, next) => {
  try {
    const segmentId = Number(req.params.id);
    const payload = {
      name: req.body.name,
      description: req.body.description,
      config: parseJsonField(req.body.config, req.body.config),
    };
    const updated = await updateSegmentWithEstimate(segmentId, payload);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/segments/:id", ensureAdmin, async (req, res, next) => {
  try {
    const segmentId = Number(req.params.id);
    await deleteSegmentWithCache(segmentId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/segments/calculate", ensureAdmin, async (req, res, next) => {
  try {
    const config = parseJsonField(req.body.config, req.body.config);
    if (!config) {
      return res.status(400).json({ error: "Необходимо указать config" });
    }
    const estimatedSize = await calculateSegmentSize(config, { useCache: false });
    res.json({ success: true, data: { estimated_size: estimatedSize } });
  } catch (error) {
    next(error);
  }
});

router.get("/", ensureAdmin, async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const items = await listCampaigns({ limit: Number(limit), offset: Number(offset) });
    const ids = items.map((item) => item.id);
    let statsMap = {};
    if (ids.length) {
      const [statsRows] = await db.query(
        `SELECT campaign_id, total_recipients, sent_count, failed_count, click_count, conversion_count
         FROM broadcast_stats
         WHERE campaign_id IN (?)`,
        [ids],
      );
      statsMap = statsRows.reduce((acc, row) => {
        acc[row.campaign_id] = row;
        return acc;
      }, {});
    }
    const enriched = items.map((item) => ({
      ...item,
      stats: statsMap[item.id] || {
        total_recipients: 0,
        sent_count: 0,
        failed_count: 0,
        click_count: 0,
        conversion_count: 0,
      },
    }));
    res.json({ success: true, data: { items: enriched } });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAdmin, async (req, res, next) => {
  try {
    const type = req.body.type || "manual";
    const status = req.body.status || "draft";
    if (!ALLOWED_CAMPAIGN_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: "Некорректный тип кампании" });
    }
    if (!ALLOWED_CAMPAIGN_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: "Некорректный статус кампании" });
    }
    if (type === "trigger" && req.body.trigger_type && !ALLOWED_TRIGGER_TYPES.has(req.body.trigger_type)) {
      return res.status(400).json({ success: false, error: "Некорректный тип триггера" });
    }
    const payload = {
      name: req.body.name,
      description: req.body.description,
      type,
      status,
      trigger_type: type === "trigger" ? req.body.trigger_type || null : null,
      trigger_config: parseJsonField(req.body.trigger_config, req.body.trigger_config),
      segment_id: req.body.segment_id || null,
      segment_config: parseJsonField(req.body.segment_config, req.body.segment_config),
      content_text: req.body.content_text || "",
      content_image_url: req.body.content_image_url || null,
      content_buttons: parseJsonField(req.body.content_buttons, req.body.content_buttons),
      scheduled_at: req.body.scheduled_at || null,
      use_user_timezone: req.body.use_user_timezone ?? 1,
      target_hour: req.body.target_hour ?? null,
      is_active: req.body.is_active ?? 1,
      created_by: req.user.id,
    };
    if (!payload.name) {
      return res.status(400).json({ success: false, error: "Укажите название кампании" });
    }
    if (payload.type !== "subscription_campaign" && !payload.segment_config) {
      return res.status(400).json({ error: "Укажите название и условия сегментации" });
    }
    const campaignId = await createCampaign(payload);
    const campaign = await getCampaignById(campaignId);
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaign = await getCampaignById(Number(req.params.id));
    if (!campaign) return res.status(404).json({ error: "Рассылка не найдена" });
    const stats = await getCampaignStats(campaign.id);
    res.json({ success: true, data: { campaign, stats } });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (req.body.type !== undefined && !ALLOWED_CAMPAIGN_TYPES.has(req.body.type)) {
      return res.status(400).json({ success: false, error: "Некорректный тип кампании" });
    }
    if (req.body.status !== undefined && !ALLOWED_CAMPAIGN_STATUSES.has(req.body.status)) {
      return res.status(400).json({ success: false, error: "Некорректный статус кампании" });
    }
    if (req.body.trigger_type !== undefined && req.body.trigger_type && !ALLOWED_TRIGGER_TYPES.has(req.body.trigger_type)) {
      return res.status(400).json({ success: false, error: "Некорректный тип триггера" });
    }
    const nextType = req.body.type;
    const payload = {
      name: req.body.name,
      description: req.body.description,
      type: nextType,
      status: req.body.status,
      trigger_type:
        nextType === "trigger"
          ? req.body.trigger_type
          : nextType !== undefined
            ? null
            : req.body.trigger_type === undefined
              ? undefined
              : null,
      trigger_config:
        nextType !== undefined && nextType !== "trigger"
          ? null
          : parseJsonField(req.body.trigger_config, req.body.trigger_config),
      segment_id: req.body.segment_id,
      segment_config: parseJsonField(req.body.segment_config, req.body.segment_config),
      content_text: req.body.content_text,
      content_image_url: req.body.content_image_url,
      content_buttons: parseJsonField(req.body.content_buttons, req.body.content_buttons),
      scheduled_at: req.body.scheduled_at,
      use_user_timezone: req.body.use_user_timezone,
      target_hour: req.body.target_hour,
      is_active: req.body.is_active,
    };
    const updated = await updateCampaign(campaignId, payload);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/send", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const result = await enqueueCampaignMessages(campaignId);
    const campaign = await getCampaignById(campaignId);
    res.json({ success: true, data: { ...campaign, total_recipients: result.totalRecipients } });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/cancel", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const campaign = await getCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ error: "Рассылка не найдена" });
    if (!['scheduled','sending'].includes(campaign.status)) {
      return res.status(400).json({ error: "Нельзя отменить рассылку в текущем статусе" });
    }
    const updated = await updateCampaign(campaignId, { status: "cancelled", is_active: 0 });
    try {
      const { wsServer } = await import("../../index.js");
      wsServer.notifyBroadcastStatusChange(updated.id, updated.status, {
        started_at: updated.started_at,
        completed_at: updated.completed_at,
      });
    } catch (wsError) {
      console.error("Failed to send broadcast WS update:", wsError);
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/preview", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "user_id обязателен" });
    }
    const preview = await previewCampaignForUser(campaignId, user_id);
    res.json({ success: true, data: { text: preview.text, image_url: preview.campaign.content_image_url, buttons: preview.campaign.content_buttons } });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/test", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { telegram_id, test_user_id } = req.body;
    const campaign = await getCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ error: "Рассылка не найдена" });
    const resolvedUserId = test_user_id || (telegram_id ? await resolveUserIdByTelegram(telegram_id) : null);
    const preview = resolvedUserId ? await previewCampaignForUser(campaignId, resolvedUserId) : null;
    const text = preview ? preview.text : campaign.content_text;
    const targetTelegramId = telegram_id || preview?.user?.telegram_id;
    if (!targetTelegramId) {
      return res.status(400).json({ error: "telegram_id обязателен" });
    }
    if (!preview) {
      return res.status(400).json({ error: "Не удалось найти пользователя для подстановки. Укажите ID пользователя." });
    }
    await sendTestMessage({
      telegramId: targetTelegramId,
      text,
      imageUrl: campaign.content_image_url,
      buttons: campaign.content_buttons,
      campaignId,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/stats", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const stats = await getCampaignStats(campaignId);
    res.json({ success: true, data: { overview: stats } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/messages", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { status, limit = 50, offset = 0 } = req.query;
    const items = await getCampaignMessages(campaignId, { status, limit: Number(limit), offset: Number(offset) });
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/conversions", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { limit = 50, offset = 0 } = req.query;
    const items = await getCampaignConversions(campaignId, { limit: Number(limit), offset: Number(offset) });
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

export default router;
