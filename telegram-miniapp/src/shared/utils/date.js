const APP_LOCALE = "ru-KZ";
const FALLBACK_TIME_ZONE = "UTC";

export function getCurrentTime() {
  return new Date();
}

function getDeviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim() ? tz.trim() : "";
  } catch {
    return "";
  }
}

function getSelectedCityTimeZone() {
  try {
    if (typeof localStorage === "undefined") return "";
    const raw = localStorage.getItem("selectedCity");
    if (!raw) return "";
    const city = JSON.parse(raw);
    const tz = String(city?.timezone || "").trim();
    return tz || "";
  } catch {
    return "";
  }
}

function normalizeTimeZone(candidate) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "";
  }
}

export function getAppTimeZone() {
  const cityTz = normalizeTimeZone(getSelectedCityTimeZone());
  if (cityTz) return cityTz;
  const deviceTz = normalizeTimeZone(getDeviceTimeZone());
  if (deviceTz) return deviceTz;
  return FALLBACK_TIME_ZONE;
}

function getDateKeyInAppTimeZone(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const timeZone = getAppTimeZone();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

export function formatDate(date, options = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const timeZone = getAppTimeZone();
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone,
    ...options,
  }).format(d);
}
export function formatDateTime(date) {
  return formatDate(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function formatTime(date) {
  return formatDate(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function formatDateOnly(date) {
  return formatDate(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatCalendarDateTime(
  date,
  {
    todayPrefix = "Сегодня",
    yesterdayPrefix = "Вчера",
    separator = " в ",
  } = {},
) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return `${todayPrefix}${separator}${formatTime(d)}`;
  if (isYesterday(d)) return `${yesterdayPrefix}${separator}${formatTime(d)}`;
  return formatDateOnly(d);
}
export function formatRelativeTime(date) {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;
  return formatDateOnly(d);
}
export function isToday(date) {
  const currentKey = getDateKeyInAppTimeZone(getCurrentTime());
  const dateKey = getDateKeyInAppTimeZone(date);
  return Boolean(currentKey) && currentKey === dateKey;
}
export function isYesterday(date) {
  const yesterday = new Date(getCurrentTime());
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKeyInAppTimeZone(yesterday);
  const dateKey = getDateKeyInAppTimeZone(date);
  return Boolean(yesterdayKey) && yesterdayKey === dateKey;
}
