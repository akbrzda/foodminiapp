const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const toPositiveInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const toNonZeroInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed === 0) return null;
  return parsed;
};

const toTrimmedString = (value) => String(value || "").trim();

export const schemaOk = (value) => ({ valid: true, value, error: null });
export const schemaFail = (error) => ({ valid: false, value: null, error });

export { isPlainObject, toPositiveInteger, toTrimmedString };
export { toNonZeroInteger };

export default {
  isPlainObject,
  toPositiveInteger,
  toNonZeroInteger,
  toTrimmedString,
  schemaOk,
  schemaFail,
};
