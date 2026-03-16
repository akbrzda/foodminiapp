import { devWarn } from "@/shared/utils/logger.js";

const STORAGE_TYPE_LOCAL = "local";
const STORAGE_TYPE_SESSION = "session";

const resolveStorage = (type) => {
  if (typeof window === "undefined") {
    return null;
  }

  if (type === STORAGE_TYPE_LOCAL) {
    return window.localStorage;
  }

  if (type === STORAGE_TYPE_SESSION) {
    return window.sessionStorage;
  }

  return null;
};

const readString = (type, key, fallback = "") => {
  const storage = resolveStorage(type);
  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    devWarn("Не удалось прочитать значение из storage:", { type, key, error });
    return fallback;
  }
};

const readJson = (type, key, fallback = null) => {
  const raw = readString(type, key, "__EMPTY__");
  if (raw === "__EMPTY__") {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    devWarn("Не удалось распарсить JSON из storage:", { type, key, error });
    return fallback;
  }
};

const writeString = (type, key, value) => {
  const storage = resolveStorage(type);
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, String(value));
    return true;
  } catch (error) {
    devWarn("Не удалось записать значение в storage:", { type, key, error });
    return false;
  }
};

const writeJson = (type, key, value) => {
  const storage = resolveStorage(type);
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    devWarn("Не удалось сериализовать JSON в storage:", { type, key, error });
    return false;
  }
};

const removeItem = (type, key) => {
  const storage = resolveStorage(type);
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    devWarn("Не удалось удалить ключ из storage:", { type, key, error });
    return false;
  }
};

export const readLocalString = (key, fallback = "") =>
  readString(STORAGE_TYPE_LOCAL, key, fallback);
export const readLocalJson = (key, fallback = null) => readJson(STORAGE_TYPE_LOCAL, key, fallback);
export const writeLocalString = (key, value) => writeString(STORAGE_TYPE_LOCAL, key, value);
export const writeLocalJson = (key, value) => writeJson(STORAGE_TYPE_LOCAL, key, value);
export const removeLocalItem = (key) => removeItem(STORAGE_TYPE_LOCAL, key);

export const readSessionString = (key, fallback = "") =>
  readString(STORAGE_TYPE_SESSION, key, fallback);
export const readSessionJson = (key, fallback = null) =>
  readJson(STORAGE_TYPE_SESSION, key, fallback);
export const writeSessionString = (key, value) => writeString(STORAGE_TYPE_SESSION, key, value);
export const writeSessionJson = (key, value) => writeJson(STORAGE_TYPE_SESSION, key, value);
export const removeSessionItem = (key) => removeItem(STORAGE_TYPE_SESSION, key);

export const removeLocalItems = (keys = []) => {
  for (const key of keys) {
    removeLocalItem(key);
  }
};
