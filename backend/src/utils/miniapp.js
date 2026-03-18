import crypto from "crypto";

const normalizeInitData = (initData) => {
  const rawValue = String(initData || "").trim();
  if (!rawValue) {
    return "";
  }

  const candidates = [rawValue];
  try {
    candidates.push(decodeURIComponent(rawValue));
  } catch (error) {
    // Игнорируем decode ошибки и продолжаем с исходным значением.
  }

  for (const candidate of candidates) {
    const params = new URLSearchParams(candidate);
    if (params.has("hash") && (params.has("user") || params.has("auth_date"))) {
      return candidate;
    }
  }

  return rawValue;
};

const hashInitData = (initData, botToken) => {
  const normalizedInitData = normalizeInitData(initData);
  const params = new URLSearchParams(normalizedInitData);
  const hash = params.get("hash");
  if (!hash) {
    return null;
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return {
    hash,
    calculatedHash,
  };
};

export const validateMiniAppInitData = (initData, botToken) => {
  try {
    if (!initData || !botToken) {
      return false;
    }

    const result = hashInitData(initData, botToken);
    if (!result) {
      return false;
    }

    return result.hash === result.calculatedHash;
  } catch (error) {
    console.error("MiniApp validation error:", error);
    return false;
  }
};

export const parseMiniAppUser = (initData) => {
  try {
    const normalizedInitData = normalizeInitData(initData);
    const params = new URLSearchParams(normalizedInitData);
    const userParam = params.get("user");
    if (!userParam) {
      return null;
    }

    const user = JSON.parse(userParam);
    if (!user || typeof user !== "object") {
      return null;
    }

    return {
      id: user.id ? String(user.id) : null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      languageCode: user.language_code || null,
    };
  } catch (error) {
    console.error("Parse MiniApp user error:", error);
    return null;
  }
};

export const getMiniAppAuthDate = (initData) => {
  const normalizedInitData = normalizeInitData(initData);
  const params = new URLSearchParams(normalizedInitData);
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    return null;
  }
  return authDate;
};
