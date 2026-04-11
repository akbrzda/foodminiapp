import { getPlatformCorePool } from "../tenancy/platform-core.db.js";

export const platformSubscriptionsRepository = {
  async list() {
    const [rows] = await getPlatformCorePool().query(
      `SELECT s.id, s.tenant_id, t.slug AS tenant_slug, s.plan_id, p.code AS plan_code, s.status, s.billing_cycle,
              s.trial_ends_at, s.current_period_starts_at, s.current_period_ends_at, s.cancelled_at, s.suspended_at,
              s.created_at, s.updated_at
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN subscription_plans p ON p.id = s.plan_id
       ORDER BY s.id DESC`
    );
    return rows;
  },

  async getById(id) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, plan_id, status, billing_cycle, trial_ends_at, current_period_starts_at, current_period_ends_at,
              cancelled_at, suspended_at, created_at, updated_at
       FROM subscriptions
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(payload) {
    const [result] = await getPlatformCorePool().query(
      `INSERT INTO subscriptions (
         tenant_id, plan_id, status, billing_cycle, trial_ends_at, current_period_starts_at, current_period_ends_at,
         cancelled_at, suspended_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.tenant_id,
        payload.plan_id,
        payload.status,
        payload.billing_cycle,
        payload.trial_ends_at,
        payload.current_period_starts_at,
        payload.current_period_ends_at,
        payload.cancelled_at,
        payload.suspended_at,
      ]
    );
    return this.getById(result.insertId);
  },

  async updateStatus(id, payload) {
    await getPlatformCorePool().query(
      `UPDATE subscriptions
       SET status = ?,
           cancelled_at = ?,
           suspended_at = ?
       WHERE id = ?`,
      [payload.status, payload.cancelled_at, payload.suspended_at, id]
    );
    return this.getById(id);
  },
};
