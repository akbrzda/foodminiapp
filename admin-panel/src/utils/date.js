/**
 * Утилиты для работы с датами и часовыми поясами
 *
 * Важно:
 * - В БД все даты хранятся в UTC
 * - На клиенте даты преобразуются в локальный часовой пояс пользователя
 * - По умолчанию используется Asia/Almaty (UTC+6) для отображения
 */

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
    month: "2-digit",
    day: "2-digit",
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
    month: "2-digit",
    day: "2-digit",
  });
}
