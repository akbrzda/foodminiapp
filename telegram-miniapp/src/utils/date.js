/**
 * Утилиты для работы с датами и часовыми поясами
 *
 * Важно:
 * - В БД все даты хранятся в UTC
 * - На клиенте даты преобразуются в локальный часовой пояс пользователя
 * - По умолчанию используется Asia/Almaty (UTC+6) для отображения
 */

const TIMEZONE_OFFSET = 6 * 60; // +6 часов в минутах

/**
 * Получить текущее время в часовом поясе пользователя
 */
export function getCurrentTime() {
  return new Date();
}

/**
 * Форматировать дату в локальный формат
 */
export function formatDate(date, options = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ru-KZ", {
    timeZone: "Asia/Almaty",
    ...options,
  }).format(d);
}

/**
 * Форматировать дату и время
 */
export function formatDateTime(date) {
  return formatDate(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Форматировать только время
 */
export function formatTime(date) {
  return formatDate(date, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Форматировать только дату
 */
export function formatDateOnly(date) {
  return formatDate(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Получить относительное время (например, "2 минуты назад")
 */
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

/**
 * Проверить, сегодня ли дата
 */
export function isToday(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

/**
 * Проверить, вчера ли дата
 */
export function isYesterday(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
}
