export const normalizeMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "webhook") return "webhook";
  return "polling";
};

export const normalizeCommand = ({ text, botName }) => {
  if (!text || !text.startsWith("/")) return "";
  const [raw] = text.trim().split(/\s+/);
  const [cmd, mention] = raw.split("@");
  if (mention && botName && mention.toLowerCase() !== botName.toLowerCase()) {
    return "";
  }
  return cmd.toLowerCase();
};

export const parseStartArgument = (text) => {
  const parts = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return "";
  return String(parts[1] || "").trim();
};

export default {
  normalizeMode,
  normalizeCommand,
  parseStartArgument,
};
