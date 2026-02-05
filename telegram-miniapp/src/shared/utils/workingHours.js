const DAY_ALIASES = {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
  пн: "monday",
  вт: "tuesday",
  ср: "wednesday",
  чт: "thursday",
  пт: "friday",
  сб: "saturday",
  вс: "sunday",
  понедельник: "monday",
  вторник: "tuesday",
  среда: "wednesday",
  четверг: "thursday",
  пятница: "friday",
  суббота: "saturday",
  воскресенье: "sunday",
};

const DAY_LABELS = {
  monday: "Пн",
  tuesday: "Вт",
  wednesday: "Ср",
  thursday: "Чт",
  friday: "Пт",
  saturday: "Сб",
  sunday: "Вс",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const OFF_DAY_LABEL = "выходной";

const normalizeDayKey = (value) => {
  if (!value) return "";
  const key = String(value).trim().toLowerCase();
  return DAY_ALIASES[key] || key;
};

const parseTimeToMinutes = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isFinite(value)) {
    const minutes = Math.max(0, Math.floor(Number(value)));
    if (minutes === 1440) return 1440;
    return minutes;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(":").map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h === 24 && m === 0) return 1440;
    return h * 60 + m;
  }
  if (/^\d{1,2}$/.test(text)) {
    const h = Number(text);
    if (!Number.isFinite(h)) return null;
    if (h === 24) return 1440;
    return h * 60;
  }
  return null;
};

const formatMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) return "";
  if (minutes === 1440) return "24:00";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const parseRangeString = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parts = text.split(/[–—-]/).map((part) => part.trim());
  if (parts.length === 1) {
    const open = parseTimeToMinutes(parts[0]);
    return open === null ? null : { open, close: null };
  }
  const open = parseTimeToMinutes(parts[0]);
  let close = parseTimeToMinutes(parts[1]);
  if (open === null || close === null) return null;
  // Если закрытие указано как "00:00" после начала дня, трактуем как 24:00.
  if (close === 0 && open > 0) {
    close = 1440;
  }
  return { open, close };
};

export const normalizeWorkHours = (value) => {
  if (!value) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }
  return value;
};

const buildScheduleMap = (value) => {
  const normalized = normalizeWorkHours(value);
  const map = new Map();
  if (!normalized) return map;
  if (Array.isArray(normalized)) {
    normalized.forEach((entry) => {
      const dayKey = normalizeDayKey(entry?.day || entry?.weekday);
      if (!dayKey) return;
      const range = entry?.hours ? parseRangeString(entry.hours) : null;
      const open = range?.open ?? parseTimeToMinutes(entry?.open || entry?.from || entry?.start);
      const close = range?.close ?? parseTimeToMinutes(entry?.close || entry?.to || entry?.end);
      if (open === null || close === null) return;
      map.set(dayKey, { open, close });
    });
    return map;
  }
  if (typeof normalized === "object") {
    Object.entries(normalized).forEach(([dayKeyRaw, data]) => {
      const dayKey = normalizeDayKey(dayKeyRaw);
      if (!dayKey) return;
      if (typeof data === "string") {
        const range = parseRangeString(data);
        if (!range || range.open === null || range.close === null) return;
        map.set(dayKey, range);
        return;
      }
      if (typeof data === "object" && data) {
        const open = parseTimeToMinutes(data.open || data.from || data.start);
        const close = parseTimeToMinutes(data.close || data.to || data.end);
        if (open === null || close === null) return;
        map.set(dayKey, { open, close });
      }
    });
  }
  return map;
};

const getCityNowParts = (timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Europe/Moscow",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  let hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (hour === 24) {
    hour = 0;
  }
  const minutes = Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  return { weekday: normalizeDayKey(weekday), minutes };
};

export const getBranchOpenState = (workingHours, timeZone) => {
  const schedule = buildScheduleMap(workingHours);
  if (!schedule || schedule.size === 0) {
    return { isOpen: false, reason: "График работы не задан" };
  }
  const { weekday, minutes } = getCityNowParts(timeZone);
  if (!weekday || minutes === null) {
    return { isOpen: false, reason: "Не удалось определить время" };
  }
  const daySchedule = schedule.get(weekday);
  if (!daySchedule) {
    return { isOpen: false, reason: "Филиал закрыт" };
  }
  const { open, close } = daySchedule;
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === close) {
    return { isOpen: false, reason: "Филиал закрыт" };
  }
  if (close < open) {
    const isOpen = minutes >= open || minutes < close;
    return { isOpen, reason: isOpen ? "" : "Филиал закрыт" };
  }
  const isOpen = minutes >= open && minutes < close;
  return { isOpen, reason: isOpen ? "" : "Филиал закрыт" };
};

export const formatWorkHours = (value) => {
  const normalized = normalizeWorkHours(value);
  if (!normalized) return "";
  if (typeof normalized === "string") return normalized;
  const lines = formatWorkHoursLines(normalized);
  return lines.join(", ");
};

export const formatWorkHoursLines = (value) => {
  const normalized = normalizeWorkHours(value);
  if (!normalized) return [];
  if (typeof normalized === "string") return [normalized];
  const schedule = buildScheduleMap(normalized);
  if (!schedule || schedule.size === 0) return [];
  const ranges = [];
  DAY_ORDER.forEach((dayKey) => {
    const entry = schedule.get(dayKey);
    const label = DAY_LABELS[dayKey] || dayKey;
    if (!entry) {
      ranges.push({ dayKey, label, time: OFF_DAY_LABEL });
      return;
    }
    const openText = formatMinutes(entry.open);
    const closeText = formatMinutes(entry.close);
    if (!openText || !closeText || entry.open === entry.close) {
      ranges.push({ dayKey, label, time: OFF_DAY_LABEL });
      return;
    }
    ranges.push({ dayKey, label, time: `${openText}-${closeText}` });
  });
  if (ranges.length === 0) return [];
  const groupedMap = new Map();
  ranges.forEach((entry) => {
    if (!groupedMap.has(entry.time)) {
      groupedMap.set(entry.time, []);
    }
    groupedMap.get(entry.time).push(entry);
  });
  const formatDayRange = (days) => {
    if (!days.length) return "";
    if (days.length === 1) return days[0].label;
    const indices = days.map((d) => DAY_ORDER.indexOf(d.dayKey)).filter((idx) => idx >= 0).sort((a, b) => a - b);
    const parts = [];
    let start = indices[0];
    let prev = indices[0];
    for (let i = 1; i < indices.length; i += 1) {
      const idx = indices[i];
      if (idx === prev + 1) {
        prev = idx;
        continue;
      }
      parts.push({ start, end: prev });
      start = idx;
      prev = idx;
    }
    parts.push({ start, end: prev });
    return parts
      .map((part) => {
        if (part.start === part.end) {
          return DAY_LABELS[DAY_ORDER[part.start]] || DAY_ORDER[part.start];
        }
        return `${DAY_LABELS[DAY_ORDER[part.start]] || DAY_ORDER[part.start]}-${DAY_LABELS[DAY_ORDER[part.end]] || DAY_ORDER[part.end]}`;
      })
      .join(", ");
  };
  return Array.from(groupedMap.entries())
    .map(([time, days]) => {
      const minIndex = Math.min(...days.map((d) => DAY_ORDER.indexOf(d.dayKey)).filter((idx) => idx >= 0));
      return { time, days, minIndex };
    })
    .sort((a, b) => a.minIndex - b.minIndex)
    .map((group) => `${formatDayRange(group.days)}: ${group.time}`);
};
