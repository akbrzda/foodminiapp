import {
  getCloudStorageItem,
  getInitData,
  getTelegramUser,
  hideBackButton,
  hideMainButton,
  hapticFeedback,
  initializeTelegramSession,
  requestContact,
  setCloudStorageItem,
  setMainButton,
  showBackButton,
  removeCloudStorageItem,
  getWebApp,
} from "@/shared/services/telegram.js";
import { PLATFORM_IDS } from "@/shared/platform/bridge.js";

export const telegramBridge = {
  platform: PLATFORM_IDS.TELEGRAM,
  init() {
    return initializeTelegramSession();
  },
  getInitData() {
    return getInitData();
  },
  getUser() {
    return getTelegramUser();
  },
  showBackButton(handler) {
    return showBackButton(handler);
  },
  hideBackButton() {
    hideBackButton();
  },
  setMainButton(params) {
    return setMainButton(params);
  },
  hideMainButton() {
    hideMainButton();
  },
  hapticFeedback(style) {
    hapticFeedback(style);
  },
  requestContact(options) {
    return requestContact(options);
  },
  storage: {
    get(key) {
      return getCloudStorageItem(key);
    },
    set(key, value) {
      return setCloudStorageItem(key, value);
    },
    remove(key) {
      return removeCloudStorageItem(key);
    },
  },
  openLink(url) {
    if (!url) return;
    const webApp = getWebApp();
    if (typeof webApp?.openLink === "function") {
      webApp.openLink(url);
      return;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  },
};

