const normalizeClass = (value) => {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(normalizeClass);
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className);
  }
  return [String(value)];
};

// Нормализуем классы, чтобы поддерживать строки, массивы и объекты.
export function cn(...classes) {
  return classes.flatMap(normalizeClass).filter(Boolean).join(" ");
}
