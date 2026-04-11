import { platformTenantMigrationsRepository } from "./platform-tenant-migrations.repository.js";

const ALLOWED_MIGRATION_STATUS = new Set([
  "pending",
  "running",
  "success",
  "failed",
  "dry_run_failed",
]);

const normalizeDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const platformTenantMigrationsService = {
  list(limit) {
    const normalizedLimit = Number(limit);
    return platformTenantMigrationsRepository.list(
      Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? Math.min(normalizedLimit, 1000) : 200
    );
  },

  async upsert(payload = {}) {
    const tenantId = Number(payload.tenant_id);
    const migrationName = String(payload.migration_name || "").trim();
    const status = String(payload.status || "pending")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      const error = new Error("Некорректный tenant_id");
      error.status = 400;
      throw error;
    }
    if (!migrationName) {
      const error = new Error("migration_name обязателен");
      error.status = 400;
      throw error;
    }
    if (!ALLOWED_MIGRATION_STATUS.has(status)) {
      const error = new Error("Некорректный статус tenant migration");
      error.status = 400;
      throw error;
    }

    return platformTenantMigrationsRepository.upsert({
      tenant_id: tenantId,
      migration_name: migrationName,
      status,
      error_message: payload.error_message ? String(payload.error_message) : null,
      started_at: normalizeDateOrNull(payload.started_at),
      finished_at: normalizeDateOrNull(payload.finished_at),
      metadata:
        payload.metadata === undefined || payload.metadata === null
          ? null
          : JSON.stringify(payload.metadata),
    });
  },
};
