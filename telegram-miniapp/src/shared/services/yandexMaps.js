import { settingsAPI } from "@/shared/api/endpoints.js";

let yandexMapsPromise = null;

const ensureYandexMapsScript = ({ apiKey, language }) => {
  if (window.ymaps) {
    return Promise.resolve(window.ymaps);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=${encodeURIComponent(language)}`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps API is not available"));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    script.onerror = () => reject(new Error("Failed to load Yandex Maps script"));
    document.head.appendChild(script);
  });
};

export const loadYandexMaps = async () => {
  if (yandexMapsPromise) return yandexMapsPromise;

  yandexMapsPromise = (async () => {
    const response = await settingsAPI.getMapsPublic();
    const data = response?.data?.data || {};
    const apiKey = String(data?.yandex_js_api_key || "").trim();
    const language = String(data?.language || "ru_RU").trim() || "ru_RU";

    if (!apiKey) {
      throw new Error("Yandex JS API key is not configured");
    }

    return ensureYandexMapsScript({ apiKey, language });
  })().catch((error) => {
    yandexMapsPromise = null;
    throw error;
  });

  return yandexMapsPromise;
};
