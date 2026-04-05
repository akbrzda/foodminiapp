import { devWarn } from "@/shared/utils/logger.js";

const METRIKA_SCRIPT_SRC = "https://mc.yandex.ru/metrika/tag.js";

const state = {
  enabled: false,
  initialized: false,
  counterId: null,
  scriptPromise: null,
  lastTrackedPageUrl: "",
  goals: {
    login_success: "login_success",
    login_failed: "login_failed",
    add_to_cart: "add_to_cart",
    begin_checkout: "begin_checkout",
    order_created: "order_created",
    order_create_failed: "order_create_failed",
  },
};

const hasWindow = () => typeof window !== "undefined";

const toCounterId = (value) => {
  const normalized = String(value || "").trim();
  if (!/^\d{3,20}$/.test(normalized)) return null;
  return Number(normalized);
};

const ensureYmBootstrap = () => {
  if (!hasWindow()) return;
  if (typeof window.ym === "function") return;

  window.ym =
    window.ym ||
    function ymProxy(...args) {
      (window.ym.a = window.ym.a || []).push(args);
    };
  window.ym.l = Number(new Date());
};

const loadMetrikaScript = async () => {
  if (!hasWindow()) return;
  if (state.scriptPromise) return state.scriptPromise;
  if (document.querySelector(`script[src="${METRIKA_SCRIPT_SRC}"]`)) return;

  ensureYmBootstrap();
  state.scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = METRIKA_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Не удалось загрузить скрипт Яндекс Метрики"));
    document.head.appendChild(script);
  });

  try {
    await state.scriptPromise;
  } catch (error) {
    state.scriptPromise = null;
    throw error;
  }
};

const canTrack = () => state.enabled && state.initialized && Number.isInteger(state.counterId);

const safeYmCall = (...args) => {
  if (!hasWindow()) return;
  try {
    window.ym?.(...args);
  } catch (error) {
    devWarn("Ошибка вызова Яндекс Метрики:", error);
  }
};

const buildAbsoluteUrl = (pathOrUrl) => {
  if (!hasWindow()) return "";
  if (!pathOrUrl) return window.location.href;
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch (error) {
    return window.location.href;
  }
};

export const configureMetrika = async (options = {}) => {
  const enabled = options.enabled === true;
  const counterId = toCounterId(options.counterId);

  if (!enabled || !counterId) {
    state.enabled = false;
    state.initialized = false;
    state.counterId = null;
    state.lastTrackedPageUrl = "";
    return false;
  }

  state.enabled = true;
  state.counterId = counterId;
  if (options.goals && typeof options.goals === "object" && !Array.isArray(options.goals)) {
    const normalizedGoals = {};
    for (const [eventKey, goalId] of Object.entries(options.goals)) {
      const normalizedKey = String(eventKey || "").trim();
      const normalizedGoal = String(goalId || "").trim();
      if (!normalizedKey || !normalizedGoal) continue;
      normalizedGoals[normalizedKey] = normalizedGoal;
    }
    if (Object.keys(normalizedGoals).length) {
      state.goals = normalizedGoals;
    }
  }

  if (state.initialized) {
    return true;
  }

  try {
    await loadMetrikaScript();
    safeYmCall(counterId, "init", {
      defer: true,
      webvisor: options.webvisor === true,
      clickmap: options.clickmap !== false,
      trackLinks: options.trackLinks !== false,
      accurateTrackBounce: options.accurateTrackBounce !== false,
    });
    state.initialized = true;
    return true;
  } catch (error) {
    state.enabled = false;
    state.initialized = false;
    state.counterId = null;
    devWarn("Не удалось инициализировать Яндекс Метрику:", error);
    return false;
  }
};

export const trackPageView = ({ path, title, referer } = {}) => {
  if (!canTrack()) return;
  const pageUrl = buildAbsoluteUrl(path);
  if (!pageUrl || pageUrl === state.lastTrackedPageUrl) return;
  safeYmCall(state.counterId, "hit", pageUrl, {
    title: title || (hasWindow() ? document.title : ""),
    referer: referer ? buildAbsoluteUrl(referer) : undefined,
  });
  state.lastTrackedPageUrl = pageUrl;
};

export const trackGoal = (goalName, params) => {
  if (!canTrack()) return;
  const normalizedGoal = String(goalName || "").trim();
  if (!normalizedGoal) return;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    safeYmCall(state.counterId, "reachGoal", normalizedGoal, params);
    return;
  }
  safeYmCall(state.counterId, "reachGoal", normalizedGoal);
};

export const trackGoalByKey = (eventKey, params) => {
  const normalizedKey = String(eventKey || "").trim();
  if (!normalizedKey) return;
  const goalName = state.goals[normalizedKey] || normalizedKey;
  trackGoal(goalName, params);
};

export const trackParams = (params) => {
  if (!canTrack()) return;
  if (!params || typeof params !== "object" || Array.isArray(params)) return;
  safeYmCall(state.counterId, "params", params);
};

export const trackUserParams = (params) => {
  if (!canTrack()) return;
  if (!params || typeof params !== "object" || Array.isArray(params)) return;
  safeYmCall(state.counterId, "userParams", params);
};

export const setMetrikaUserId = (userId) => {
  if (!canTrack()) return;
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;
  safeYmCall(state.counterId, "setUserID", normalizedUserId);
};
