const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveLogLevel = () => {
  const fromEnv = String(process.env.BOT_LOG_LEVEL || "").trim().toLowerCase();
  if (LEVELS[fromEnv]) return fromEnv;
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") return "warn";
  return "info";
};

const ACTIVE_LEVEL = resolveLogLevel();

const formatMeta = (meta) => {
  if (!meta) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (error) {
    return "";
  }
};

const shouldLog = (level) => LEVELS[level] >= LEVELS[ACTIVE_LEVEL];

const writeLine = (level, line) => {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

const log = (level, message, meta = null) => {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const label = level.toUpperCase();
  const line = `[${timestamp}] [${label}] ${message}${formatMeta(meta)}`;
  writeLine(level, line);
};

export const logger = {
  debug: (message, meta = null) => log("debug", message, meta),
  info: (message, meta = null) => log("info", message, meta),
  warn: (message, meta = null) => log("warn", message, meta),
  error: (message, meta = null) => log("error", message, meta),
};

export default logger;
