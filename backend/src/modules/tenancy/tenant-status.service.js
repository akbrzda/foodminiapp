const BLOCKED_TENANT_STATUSES = new Set(["suspended", "cancelled", "deleted"]);

export const isTenantStatusBlocked = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  return BLOCKED_TENANT_STATUSES.has(normalized);
};

export const getTenantStatusCode = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "TENANT_STATUS_UNKNOWN";
  return `TENANT_${normalized.toUpperCase()}`;
};

