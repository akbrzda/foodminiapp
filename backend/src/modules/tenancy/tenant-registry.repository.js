import { getPlatformCorePool } from "./platform-core.db.js";

export const tenantRegistryRepository = {
  async getBySlug(slug) {
    const pool = getPlatformCorePool();
    const [rows] = await pool.query(
      `SELECT id, slug, db_name, status
       FROM tenants
       WHERE slug = ?
       LIMIT 1`,
      [slug]
    );
    return rows?.[0] || null;
  },
};

