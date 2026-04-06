const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export const normalizeTenantSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const isValidTenantSlug = (value) => SLUG_REGEX.test(String(value || "").trim().toLowerCase());

export const assertValidTenantSlug = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!isValidTenantSlug(normalized)) {
    const error = new Error("Invalid tenant slug format");
    error.code = "TENANT_SLUG_INVALID";
    error.status = 400;
    throw error;
  }
  return normalized;
};

export const buildTenantDbName = (slug) => `tenant_${assertValidTenantSlug(slug)}_db`;

export const parseTenantSlugFromHost = ({ host, ownerHost, rootDomain }) => {
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!normalizedHost) return null;
  if (normalizedHost === ownerHost) return null;
  if (normalizedHost === rootDomain) return null;
  if (!normalizedHost.endsWith(`.${rootDomain}`)) return null;

  const subdomainPart = normalizedHost.slice(0, -1 * (`.${rootDomain}`.length));
  if (!subdomainPart) return null;

  const appPrefix = "app.";
  if (subdomainPart.startsWith(appPrefix)) {
    const slugCandidate = subdomainPart.slice(appPrefix.length);
    return isValidTenantSlug(slugCandidate) ? slugCandidate : null;
  }

  return isValidTenantSlug(subdomainPart) ? subdomainPart : null;
};

export { SLUG_REGEX };

