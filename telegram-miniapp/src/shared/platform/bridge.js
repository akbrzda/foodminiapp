export const PLATFORM_IDS = {
  TELEGRAM: "telegram",
  MAX: "max",
  WEB: "web",
};

export const createNoopBridge = (platform = PLATFORM_IDS.WEB) => ({
  platform,
  init() {
    return null;
  },
  getInitData() {
    return "";
  },
  getUser() {
    return null;
  },
  showBackButton() {
    return () => {};
  },
  hideBackButton() {},
  setMainButton() {
    return () => {};
  },
  hideMainButton() {},
  hapticFeedback() {},
  requestContact() {
    return Promise.resolve(null);
  },
  storage: {
    get() {
      return Promise.resolve(null);
    },
    set() {
      return Promise.resolve(false);
    },
    remove() {
      return Promise.resolve(false);
    },
  },
  openLink(url) {
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  },
});

