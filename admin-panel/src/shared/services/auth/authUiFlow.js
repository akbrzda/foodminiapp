import { useNavigationContextStore } from "@/shared/stores/navigationContext.js";

const POST_LOGIN_REDIRECT_KEY = "admin_post_login_redirect";
let logoutInProgress = false;

export const rememberPostLoginRedirect = () => {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
  if (!currentPath || currentPath === "/login" || currentPath.startsWith("/login?")) return;

  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, currentPath);
  } catch {
    // Игнорируем ошибки сохранения redirect.
  }
};

export const clearNavigationAfterLogout = () => {
  const navigationStore = useNavigationContextStore();
  navigationStore.clearAllContexts();
};

export const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};

export const redirectFromLoginToRoot = () => {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") {
    window.location.assign("/");
  }
};

export const runLogoutFlow = async (
  authStore,
  { notifyServer = true, sync = true, redirect = true } = {}
) => {
  if (!authStore || logoutInProgress) return;

  logoutInProgress = true;
  try {
    rememberPostLoginRedirect();
    await authStore.logout({ notifyServer, sync });
    clearNavigationAfterLogout();
    if (redirect) {
      redirectToLogin();
    }
  } finally {
    logoutInProgress = false;
  }
};
