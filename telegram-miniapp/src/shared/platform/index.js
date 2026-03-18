import { PLATFORM_IDS, createNoopBridge } from "@/shared/platform/bridge.js";
import { telegramBridge } from "@/shared/platform/telegramBridge.js";
import { maxBridge } from "@/shared/platform/maxBridge.js";

const hasTelegramInitData = () => {
  if (typeof window === "undefined") return false;
  const initData = String(window.Telegram?.WebApp?.initData || "").trim();
  if (initData) {
    return true;
  }

  const queryId = String(window.Telegram?.WebApp?.initDataUnsafe?.query_id || "").trim();
  if (queryId) {
    return true;
  }

  return Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user);
};

const hasMaxInitData = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(
    String(
      window.WebApp?.InitData ||
        window.WebApp?.initData ||
        window.MAX?.WebApp?.InitData ||
        window.MAX?.WebApp?.initData ||
        window.Max?.WebApp?.InitData ||
        window.Max?.WebApp?.initData ||
        window.WebAppData ||
        window.MAX?.WebAppData ||
        window.Max?.WebAppData ||
        params.get("initData") ||
        params.get("webAppData") ||
        params.get("webapp_data") ||
        ""
    ).trim()
  );
};

const resolveByQuery = () => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const forcedPlatform = String(params.get("platform") || "")
    .trim()
    .toLowerCase();
  if (forcedPlatform === PLATFORM_IDS.TELEGRAM || forcedPlatform === PLATFORM_IDS.MAX) {
    return forcedPlatform;
  }
  return null;
};

export const resolvePlatform = () => {
  const forcedPlatform = resolveByQuery();
  if (forcedPlatform) {
    return forcedPlatform;
  }

  if (typeof window === "undefined") {
    return PLATFORM_IDS.WEB;
  }

  if (hasTelegramInitData()) {
    return PLATFORM_IDS.TELEGRAM;
  }

  if (hasMaxInitData()) {
    return PLATFORM_IDS.MAX;
  }

  return PLATFORM_IDS.WEB;
};

export const getPlatformBridge = () => {
  const platform = resolvePlatform();

  if (platform === PLATFORM_IDS.TELEGRAM) {
    return telegramBridge;
  }

  if (platform === PLATFORM_IDS.MAX) {
    return maxBridge;
  }

  return createNoopBridge(PLATFORM_IDS.WEB);
};

export { PLATFORM_IDS };
