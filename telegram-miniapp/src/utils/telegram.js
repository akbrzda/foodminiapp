import {
  init,
  retrieveLaunchParams,
  mountMiniAppSync,
  miniAppReady,
  setMiniAppHeaderColor,
  setMiniAppBackgroundColor,
  mountBackButton,
  showBackButton as showBackButtonSdk,
  hideBackButton as hideBackButtonSdk,
  onBackButtonClick,
  isBackButtonMounted,
  mountMainButton,
  setMainButtonParams,
  onMainButtonClick,
  isMainButtonMounted,
  hapticFeedbackImpactOccurred,
  hapticFeedbackNotificationOccurred,
} from "@telegram-apps/sdk";

let launchParams = null;
let isInitialized = false;

export function initTelegramSDK() {
  try {
    if (!isInitialized) {
      init();
      isInitialized = true;
    }

    mountMiniAppSync();
    launchParams = retrieveLaunchParams();

    setMiniAppHeaderColor("#FFFFFF");
    setMiniAppBackgroundColor("#F5F5F5");
    miniAppReady();

    return { launchParams };
  } catch (error) {
    console.error("Failed to initialize Telegram SDK:", error);
    return { launchParams: null };
  }
}

export function getLaunchParams() {
  return launchParams;
}

export function getInitData() {
  return launchParams?.initDataRaw || "";
}

export function getTelegramUser() {
  return launchParams?.initData?.user || null;
}

export function showBackButton(onClick) {
  try {
    if (!isBackButtonMounted()) {
      mountBackButton();
    }
    showBackButtonSdk();
    if (onClick) {
      onBackButtonClick(onClick);
    }
  } catch (error) {
    console.error("Failed to show back button:", error);
  }
}

export function hideBackButton() {
  try {
    if (isBackButtonMounted()) {
      hideBackButtonSdk();
    }
  } catch (error) {
    console.error("Failed to hide back button:", error);
  }
}

export function showMainButton(text, onClick) {
  try {
    if (!isMainButtonMounted()) {
      mountMainButton();
    }
    setMainButtonParams({ text, isVisible: true });
    if (onClick) {
      onMainButtonClick(onClick);
    }
  } catch (error) {
    console.error("Failed to show main button:", error);
  }
}

export function hideMainButton() {
  try {
    if (isMainButtonMounted()) {
      setMainButtonParams({ isVisible: false });
    }
  } catch (error) {
    console.error("Failed to hide main button:", error);
  }
}

export function hapticFeedback(type = "light") {
  try {
    switch (type) {
      case "light":
        hapticFeedbackImpactOccurred("light");
        break;
      case "medium":
        hapticFeedbackImpactOccurred("medium");
        break;
      case "heavy":
        hapticFeedbackImpactOccurred("heavy");
        break;
      case "success":
        hapticFeedbackNotificationOccurred("success");
        break;
      case "error":
        hapticFeedbackNotificationOccurred("error");
        break;
      case "warning":
        hapticFeedbackNotificationOccurred("warning");
        break;
      default:
        hapticFeedbackImpactOccurred("light");
    }
  } catch (error) {
    console.error("Failed to trigger haptic feedback:", error);
  }
}
