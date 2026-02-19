import express from "express";
import {
  getLatestPublishedRelease,
  getPublicReleaseDetails,
  listPublicReleases,
} from "./service.js";

const publicRouter = express.Router();

publicRouter.get("/latest", async (req, res, next) => {
  try {
    const release = await getLatestPublishedRelease();
    return res.json({ release });
  } catch (error) {
    return next(error);
  }
});

publicRouter.get("/releases", async (req, res, next) => {
  try {
    const data = await listPublicReleases(req.query || {});
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

publicRouter.get("/releases/:id", async (req, res, next) => {
  try {
    const releaseId = Number(req.params.id);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: "Некорректный ID релиза" });
    }

    const release = await getPublicReleaseDetails(releaseId);
    if (!release) {
      return res.status(404).json({ error: "Релиз не найден" });
    }

    return res.json({ release });
  } catch (error) {
    return next(error);
  }
});

export { publicRouter };

export default {
  publicRouter,
};
