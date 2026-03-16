import { devWarn } from "@/shared/utils/logger.js";

const DESKTOP_PLATFORMS = new Set([
  "web",
  "desktop",
  "unknown",
  "weba",
  "webk",
  "tdesktop",
  "macos",
]);

let cachedWebApp = null;
let isMissingWebAppWarned = false;

const resolveWebApp = () => {
  if (cachedWebApp) {
    return cachedWebApp;
  }

  if (typeof window !== "undefined" && window.Telegram?.WebApp) {
    cachedWebApp = window.Telegram.WebApp;
  }

  return cachedWebApp;
};

export const getWebApp = () => resolveWebApp();

export const hasWebAppContext = () => Boolean(resolveWebApp());

export const warnMissingWebAppContext = () => {
  if (isMissingWebAppWarned) {
    return;
  }

  isMissingWebAppWarned = true;
  devWarn("Telegram WebApp context не найден. Приложение работает в fallback-режиме браузера.");
};

export const isVersionAtLeast = (webApp, version) => {
  if (!webApp) {
    return false;
  }

  if (typeof webApp.isVersionAtLeast === "function") {
    return webApp.isVersionAtLeast(version);
  }

  const currentVersion = parseFloat(webApp.version || "0");
  const requiredVersion = parseFloat(version);
  return (
    Number.isFinite(currentVersion) &&
    Number.isFinite(requiredVersion) &&
    currentVersion >= requiredVersion
  );
};

export const isDesktop = () => {
  const webApp = resolveWebApp();
  if (!webApp) {
    return true;
  }

  const platform = String(webApp.platform || "").toLowerCase();
  return DESKTOP_PLATFORMS.has(platform);
};
