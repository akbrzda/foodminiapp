import express from "express";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import {
  getAdminStoriesList,
  getAdminStoriesDashboard,
  getAdminStoriesMenuReferences,
  getAdminStoryById,
  createAdminStory,
  updateAdminStory,
  toggleAdminStory,
  getActiveStories,
  trackStoryImpression,
  trackStoryClick,
  completeStory,
} from "./services/storiesService.js";

const router = express.Router();
const ensureAdmin = [authenticateToken, requirePermission("marketing.stories.manage")];

router.get("/active", authenticateToken, async (req, res, next) => {
  try {
    const data = await getActiveStories({ userId: req.user.id, query: req.query });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", ensureAdmin, async (req, res, next) => {
  try {
    const data = await getAdminStoriesDashboard();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/references/menu", ensureAdmin, async (req, res, next) => {
  try {
    const data = await getAdminStoriesMenuReferences();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/impression", authenticateToken, async (req, res, next) => {
  try {
    await trackStoryImpression({ req, userId: req.user.id, payload: req.body || {} });
    res.status(201).json({ success: true, data: { tracked: true } });
  } catch (error) {
    next(error);
  }
});

router.post("/click", authenticateToken, async (req, res, next) => {
  try {
    await trackStoryClick({ req, userId: req.user.id, payload: req.body || {} });
    res.status(201).json({ success: true, data: { tracked: true } });
  } catch (error) {
    next(error);
  }
});

router.post("/complete", authenticateToken, async (req, res, next) => {
  try {
    await completeStory({ userId: req.user.id, payload: req.body || {} });
    res.status(201).json({ success: true, data: { tracked: true } });
  } catch (error) {
    next(error);
  }
});

router.get("/", ensureAdmin, async (req, res, next) => {
  try {
    const result = await getAdminStoriesList(req.query || {});
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

router.post("/", ensureAdmin, async (req, res, next) => {
  try {
    const created = await createAdminStory(req.body || {}, req.user.id);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор stories-кампании" });
    }

    const campaign = await getAdminStoryById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Stories-кампания не найдена" });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор stories-кампании" });
    }

    const existing = await getAdminStoryById(campaignId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Stories-кампания не найдена" });
    }

    const updated = await updateAdminStory(campaignId, req.body || {});
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/toggle", ensureAdmin, async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return res.status(400).json({ success: false, error: "Некорректный идентификатор stories-кампании" });
    }

    const existing = await getAdminStoryById(campaignId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Stories-кампания не найдена" });
    }

    const toggled = await toggleAdminStory(campaignId, Boolean(req.body?.is_active));
    res.json({ success: true, data: toggled });
  } catch (error) {
    next(error);
  }
});

export default router;
