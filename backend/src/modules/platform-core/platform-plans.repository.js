import { getPlatformCorePool } from "../tenancy/platform-core.db.js";

export const platformPlansRepository = {
  async list() {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, code, name, description, monthly_price, annual_price, currency, limits_json, is_active, created_at, updated_at
       FROM subscription_plans
       ORDER BY id DESC`
    );
    return rows;
  },

  async getById(id) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, code, name, description, monthly_price, annual_price, currency, limits_json, is_active, created_at, updated_at
       FROM subscription_plans
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(payload) {
    const [result] = await getPlatformCorePool().query(
      `INSERT INTO subscription_plans (code, name, description, monthly_price, annual_price, currency, limits_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.monthly_price,
        payload.annual_price,
        payload.currency,
        payload.limits_json,
        payload.is_active,
      ]
    );
    return this.getById(result.insertId);
  },

  async update(id, payload) {
    await getPlatformCorePool().query(
      `UPDATE subscription_plans
       SET code = ?,
           name = ?,
           description = ?,
           monthly_price = ?,
           annual_price = ?,
           currency = ?,
           limits_json = ?,
           is_active = ?
       WHERE id = ?`,
      [
        payload.code,
        payload.name,
        payload.description,
        payload.monthly_price,
        payload.annual_price,
        payload.currency,
        payload.limits_json,
        payload.is_active,
        id,
      ]
    );
    return this.getById(id);
  },

  async remove(id) {
    const [result] = await getPlatformCorePool().query("DELETE FROM subscription_plans WHERE id = ?", [id]);
    return (result?.affectedRows || 0) > 0;
  },
};
