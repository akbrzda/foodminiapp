export {
  getWebApp,
  hasWebAppContext,
  isDesktop,
} from "@/shared/services/telegram/telegram-client.js";

export {
  ensureReady,
  initializeTelegramSession,
  getInitData,
  getStartParam,
  getTelegramUser,
  getCloudStorageItem,
  setCloudStorageItem,
  removeCloudStorageItem,
  getColorScheme,
} from "@/shared/services/telegram/telegram-session.js";

export {
  showBackButton,
  hideBackButton,
  setMainButton,
  hideMainButton,
  showMainButtonProgress,
  hideMainButtonProgress,
  showAlert,
  showConfirm,
  hapticFeedback,
  requestContact,
  enableClosingConfirmation,
  disableClosingConfirmation,
} from "@/shared/services/telegram/telegram-ui.js";
