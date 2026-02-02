import { computed, ref } from "vue";

const THEME_STORAGE_KEY = "admin-theme-preference";
const allowedThemes = ["system", "light", "dark"];

const theme = ref("system");
const systemTheme = ref("light");
let initialized = false;
let mediaQuery = null;

const getSystemPreference = () => {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (value) => {
  if (typeof document === "undefined") return;
  const resolved = value === "system" ? systemTheme.value || "light" : value;
  document.documentElement.classList.toggle("dark", resolved === "dark");
};

const handleSystemChange = (event) => {
  systemTheme.value = event?.matches ? "dark" : "light";
  if (theme.value === "system") {
    applyTheme("system");
  }
};

const initTheme = () => {
  if (initialized) return;
  initialized = true;

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (allowedThemes.includes(stored)) {
      theme.value = stored;
    }
  }

  systemTheme.value = getSystemPreference() || "light";
  applyTheme(theme.value);

  if (typeof window !== "undefined" && window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemChange);
    }
  }
};

const setTheme = (value) => {
  if (!allowedThemes.includes(value)) return;
  theme.value = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  }
  systemTheme.value = getSystemPreference() || "light";
  applyTheme(value);
};

const resolvedTheme = computed(() => (theme.value === "system" ? systemTheme.value : theme.value));

export function useTheme() {
  return {
    theme,
    resolvedTheme,
    initTheme,
    setTheme,
  };
}
