import express from "express";
import { authenticateToken, requireRole } from "../../middleware/auth.js";
import {
  createSubscriptionCampaign,
  getSubscriptionCampaignById,
  updateSubscriptionCampaign,
  deleteSubscriptionCampaign,
  listSubscriptionCampaigns,
  getSubscriptionCampaignStats,
  listSubscriptionCampaignParticipants,
  exportSubscriptionCampaignParticipants,
} from "./services/subscriptionCampaignService.js";

const router = express.Router();
const ensureAdmin = [authenticateToken, requireRole("admin", "manager", "ceo")];

const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

router.get("/", ensureAdmin, async (req, res, next) => {
  try {
    const data = await listSubscriptionCampaigns({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      is_active: req.query.is_active,
    });
    res.json({ success: true, data: data.items, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAdmin, async (req, res, next) => {
  try {
    const created = await createSubscriptionCampaign(req.body || {});
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/stats", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const campaign = await getSubscriptionCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }
    const stats = await getSubscriptionCampaignStats(campaignId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/participants/export", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const campaign = await getSubscriptionCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }

    const participants = await exportSubscriptionCampaignParticipants(campaignId, {
      search: req.query.search,
      is_currently_subscribed: req.query.is_currently_subscribed,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    });

    const headers = [
      "ID попытки",
      "ID пользователя",
      "Telegram ID",
      "Имя",
      "Фамилия",
      "Телефон",
      "Первая попытка",
      "Последняя проверка",
      "Первая подписка",
      "Последняя выдача приза",
      "Попыток проверки",
      "Получено наград",
      "Подписан сейчас",
    ];
    const rows = participants.map((item) => [
      item.id,
      item.user_id,
      item.telegram_id,
      item.first_name,
      item.last_name,
      item.phone,
      formatDate(item.first_click_at),
      formatDate(item.last_check_at),
      formatDate(item.first_subscribed_at),
      formatDate(item.last_reward_claimed_at),
      item.attempts_count,
      item.rewards_claimed_count,
      item.is_currently_subscribed ? "Да" : "Нет",
    ]);
    const csv = [headers, ...rows].map((line) => line.map(escapeCsv).join(",")).join("\n");

    const fileSafeTag = String(campaign.tag || "campaign").replace(/[^\w-]/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"subscription-campaign-${fileSafeTag}.csv\"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/participants", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const campaign = await getSubscriptionCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }

    const data = await listSubscriptionCampaignParticipants(campaignId, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      is_currently_subscribed: req.query.is_currently_subscribed,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    });
    res.json({ success: true, data: data.items, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const campaign = await getSubscriptionCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const updated = await updateSubscriptionCampaign(campaignId, req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор кампании" });
    }
    const deleted = await deleteSubscriptionCampaign(campaignId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Кампания не найдена" });
    }
    res.json({ success: true, data: { id: campaignId } });
  } catch (error) {
    next(error);
  }
});

export default router;
