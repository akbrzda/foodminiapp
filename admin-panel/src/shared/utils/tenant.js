const DEFAULT_OWNER_HOST = "owner.example.com";
const DEFAULT_ROOT_DOMAIN = "example.com";

export const resolveTenantSlugFromHostname = (hostname) => {
  const normalizedHost = String(hostname || "")
    .trim()
    .toLowerCase();
  if (!normalizedHost || normalizedHost === "localhost") return null;

  const ownerHost = String(import.meta.env.VITE_TENANCY_OWNER_HOST || DEFAULT_OWNER_HOST)
    .trim()
    .toLowerCase();
  const rootDomain = String(import.meta.env.VITE_TENANCY_ROOT_DOMAIN || DEFAULT_ROOT_DOMAIN)
    .trim()
    .toLowerCase();
  if (normalizedHost === ownerHost) return null;

  if (rootDomain && normalizedHost.endsWith(`.${rootDomain}`)) {
    const hostPrefix = normalizedHost.slice(0, -(rootDomain.length + 1));
    if (!hostPrefix) return null;
    if (hostPrefix.startsWith("app.")) {
      const slug = hostPrefix.slice(4);
      return slug || null;
    }
    return hostPrefix;
  }

  return null;
};

export const getTenantSlug = () => {
  if (typeof window === "undefined") return null;
  const override = String(window.localStorage?.getItem("tenant_slug_override") || "").trim();
  if (override) return override.toLowerCase();
  return resolveTenantSlugFromHostname(window.location.hostname);
};
