import { getPlatformCorePool } from "../tenancy/platform-core.db.js";

export const platformTenantMigrationsRepository = {
  async list(limit = 200) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT m.id, m.tenant_id, t.slug AS tenant_slug, m.migration_name, m.status, m.error_message, m.started_at, m.finished_at, m.metadata, m.created_at, m.updated_at
       FROM tenant_db_migrations m
       JOIN tenants t ON t.id = m.tenant_id
       ORDER BY m.id DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  },

  async getByTenantAndName(tenantId, migrationName) {
    const [rows] = await getPlatformCorePool().query(
      `SELECT id, tenant_id, migration_name, status, error_message, started_at, finished_at, metadata, created_at, updated_at
       FROM tenant_db_migrations
       WHERE tenant_id = ? AND migration_name = ?
       LIMIT 1`,
      [tenantId, migrationName]
    );
    return rows[0] || null;
  },

  async upsert(payload) {
    await getPlatformCorePool().query(
      `INSERT INTO tenant_db_migrations (
         tenant_id, migration_name, status, error_message, started_at, finished_at, metadata
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         error_message = VALUES(error_message),
         started_at = VALUES(started_at),
         finished_at = VALUES(finished_at),
         metadata = VALUES(metadata)`,
      [
        payload.tenant_id,
        payload.migration_name,
        payload.status,
        payload.error_message,
        payload.started_at,
        payload.finished_at,
        payload.metadata,
      ]
    );
    return this.getByTenantAndName(payload.tenant_id, payload.migration_name);
  },
};
