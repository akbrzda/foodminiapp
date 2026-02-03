export function formatDate(date, options = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ru-KZ", {
    timeZone: "Asia/Almaty",
    ...options,
  }).format(d);
}
export function formatDateTime(date) {
  return formatDate(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
    month: "2-digit",
    day: "2-digit",
  });
}
