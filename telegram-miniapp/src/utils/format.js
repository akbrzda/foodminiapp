export function formatPrice(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "0";
  }

  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }

  return numberValue
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

export function normalizeImageUrl(url) {
  if (!url) return null;
  if (/^data:/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (!base) return url.startsWith("/") ? url : `/${url}`;
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}
