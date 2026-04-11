const KNOWN_TENANT_STATUSES = new Set([
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "deleted",
]);

const BLOCKED_TENANT_STATUSES = new Set(["suspended", "cancelled", "deleted"]);

export const normalizeTenantStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (!KNOWN_TENANT_STATUSES.has(normalized)) return "unknown";
  return normalized;
};

export const isTenantStatusBlocked = (status) => {
  const normalized = normalizeTenantStatus(status);
  return BLOCKED_TENANT_STATUSES.has(normalized);
};

export const getTenantStatusCode = (status) => {
  const normalized = normalizeTenantStatus(status);

  if (normalized === "deleted") return "TENANT_DELETED";
  if (normalized === "suspended" || normalized === "cancelled") return "TENANT_SUSPENDED";
  if (!normalized || normalized === "unknown") return "TENANT_STATUS_UNKNOWN";
  return "TENANT_ACTIVE";
};

