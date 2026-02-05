import { getInitData } from "@/shared/services/telegram.js";

let erudaActive = false;
let loadPromise = null;
const ERUDA_SCRIPT_ID = "eruda-script";
const ERUDA_SRC = "https://cdn.jsdelivr.net/npm/eruda@3.4.2/eruda.min.js";

const loadErudaScript = () => {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.eruda) return Promise.resolve(window.eruda);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(ERUDA_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.eruda));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = ERUDA_SCRIPT_ID;
    script.src = ERUDA_SRC;
    script.async = true;
    script.onload = () => resolve(window.eruda);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loadPromise;
};

const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const ERUDA_ENDPOINT = `${apiBase}/api/auth/eruda`;

export const initErudaForAdmin = async () => {
  if (typeof window === "undefined" || erudaActive) return;
  const initData = getInitData();
  if (!initData) return;
  try {
    const response = await fetch(ERUDA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
      body: JSON.stringify({ initData }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.enabled) return;
    const eruda = await loadErudaScript();
    if (eruda?.init) {
      eruda.init();
      erudaActive = true;
    }
  } catch (error) {
    console.error("Не удалось инициализировать Eruda:", error);
  }
};
