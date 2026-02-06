const DAY_NAMES = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/**
 * Парсит время формата "10:00" в минуты от начала дня
 * @param {string} timeStr - Время в формате "HH:MM"
 * @returns {number|null} - Минуты от начала дня или null
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return null;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  if (hours === 24 && minutes === 0) return 1440; // Полночь следующего дня

  return hours * 60 + minutes;
};

/**
 * Парсит диапазон времени "10:00-23:00"
 * @param {string} rangeStr - Диапазон времени
 * @returns {Object|null} - { open: number, close: number } или null
 */
const parseTimeRange = (rangeStr) => {
  if (!rangeStr || typeof rangeStr !== "string") return null;

  const parts = rangeStr.split("-");
  if (parts.length !== 2) return null;

  const open = parseTimeToMinutes(parts[0].trim());
  let close = parseTimeToMinutes(parts[1].trim());

  if (open === null || close === null) return null;

  // Если закрытие "00:00", считаем как 24:00 (1440 минут)
  if (close === 0 && open > 0) {
    close = 1440;
  }

  return { open, close };
};

/**
 * Получает текущий день недели и время в указанном часовом поясе
 * @param {string} timezone - Часовой пояс (например, "Europe/Moscow")
 * @returns {Object} - { dayIndex: number, minutes: number }
 */
const getCurrentTimeInTimezone = (timezone = "Europe/Moscow") => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  if (hour === 24) hour = 0;

  const dayIndex = DAY_NAMES[weekday] ?? 0;
  const minutes = hour * 60 + minute;

  return { dayIndex, minutes };
};

/**
 * Проверяет, открыт ли филиал в данный момент
 * @param {Object|string} workingHours - График работы из БД
 * @param {string} timezone - Часовой пояс филиала
 * @returns {Object} - { isOpen: boolean, reason: string }
 */
export const checkBranchIsOpen = (workingHours, timezone = "Europe/Moscow") => {
  if (!workingHours) {
    return { isOpen: false, reason: "График работы не задан" };
  }

  // Парсим JSON если это строка
  let schedule = workingHours;
  if (typeof workingHours === "string") {
    try {
      schedule = JSON.parse(workingHours);
    } catch (error) {
      return { isOpen: false, reason: "Некорректный формат графика работы" };
    }
  }

  const { dayIndex, minutes } = getCurrentTimeInTimezone(timezone);
  const dayNames = Object.keys(DAY_NAMES);
  const currentDayName = dayNames[dayIndex];

  if (!currentDayName || !schedule[currentDayName]) {
    return { isOpen: false, reason: "Филиал закрыт" };
  }

  const daySchedule = schedule[currentDayName];
  const range = parseTimeRange(daySchedule);

  if (!range) {
    return { isOpen: false, reason: "Некорректное расписание для текущего дня" };
  }

  const { open, close } = range;

  // Обработка графика через полночь (например, 22:00-02:00)
  if (close < open) {
    const isOpen = minutes >= open || minutes < close;
    return { isOpen, reason: isOpen ? "" : "Филиал закрыт" };
  }

  // Обычный график в пределах одного дня
  const isOpen = minutes >= open && minutes < close;
  return { isOpen, reason: isOpen ? "" : "Филиал закрыт" };
};

/**
 * Форматирует график работы для отображения
 * @param {Object|string} workingHours - График работы
 * @returns {string} - Форматированная строка
 */
export const formatWorkingHours = (workingHours) => {
  if (!workingHours) return "Не указано";

  let schedule = workingHours;
  if (typeof workingHours === "string") {
    try {
      schedule = JSON.parse(workingHours);
    } catch (error) {
      return "Некорректный формат";
    }
  }

  const days = {
    monday: "Пн",
    tuesday: "Вт",
    wednesday: "Ср",
    thursday: "Чт",
    friday: "Пт",
    saturday: "Сб",
    sunday: "Вс",
  };

  const lines = [];
  for (const [day, hours] of Object.entries(schedule)) {
    const label = days[day] || day;
    lines.push(`${label}: ${hours}`);
  }

  return lines.join(", ");
};
