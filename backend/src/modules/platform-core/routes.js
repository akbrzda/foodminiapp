import express from "express";
import { platformPlansService } from "./platform-plans.service.js";
import { platformSubscriptionsService } from "./platform-subscriptions.service.js";
import { platformBillingService } from "./platform-billing.service.js";
import { platformTenantMigrationsService } from "./platform-tenant-migrations.service.js";

const router = express.Router();

router.get("/plans", async (req, res, next) => {
  try {
    const plans = await platformPlansService.list();
    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

router.post("/plans", async (req, res, next) => {
  try {
    const plan = await platformPlansService.create(req.body || {});
    res.status(201).json({ plan });
  } catch (error) {
    next(error);
  }
});

router.put("/plans/:id", async (req, res, next) => {
  try {
    const plan = await platformPlansService.update(Number(req.params.id), req.body || {});
    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.delete("/plans/:id", async (req, res, next) => {
  try {
    await platformPlansService.remove(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/subscriptions", async (req, res, next) => {
  try {
    const subscriptions = await platformSubscriptionsService.list();
    res.json({ subscriptions });
  } catch (error) {
    next(error);
  }
});

router.post("/subscriptions", async (req, res, next) => {
  try {
    const subscription = await platformSubscriptionsService.create(req.body || {});
    res.status(201).json({ subscription });
  } catch (error) {
    next(error);
  }
});

router.patch("/subscriptions/:id/status", async (req, res, next) => {
  try {
    const subscription = await platformSubscriptionsService.updateStatus(req.params.id, req.body || {});
    res.json({ subscription });
  } catch (error) {
    next(error);
  }
});

router.get("/billing/transactions", async (req, res, next) => {
  try {
    const transactions = await platformBillingService.listTransactions(req.query?.limit);
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

router.post("/billing/transactions", async (req, res, next) => {
  try {
    const transaction = await platformBillingService.createTransaction(req.body || {});
    res.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
});

router.post("/billing/webhook", async (req, res, next) => {
  try {
    const result = await platformBillingService.ingestBillingWebhook(req.body || {});
    res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/billing/events/:id/status", async (req, res, next) => {
  try {
    await platformBillingService.setBillingEventStatus(
      req.params.id,
      req.body?.processing_status,
      req.body?.processing_error
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/tenant-migrations", async (req, res, next) => {
  try {
    const migrations = await platformTenantMigrationsService.list(req.query?.limit);
    res.json({ migrations });
  } catch (error) {
    next(error);
  }
});

router.post("/tenant-migrations", async (req, res, next) => {
  try {
    const migration = await platformTenantMigrationsService.upsert(req.body || {});
    res.status(201).json({ migration });
  } catch (error) {
    next(error);
  }
});

export { router };
