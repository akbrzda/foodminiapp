import api from "@/shared/api/client.js";

let yandexMapsPromise = null;

const ensureYandexMapsScript = ({ apiKey, suggestApiKey, language }) => {
  if (window.ymaps) {
    return Promise.resolve(window.ymaps);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const url = new URL("https://api-maps.yandex.ru/2.1/");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("lang", language);
    if (suggestApiKey) {
      url.searchParams.set("suggest_apikey", suggestApiKey);
    }
    script.src = url.toString();
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
    const response = await api.get("/api/settings/maps-public");
    const data = response?.data?.data || {};
    const apiKey = String(data?.yandex_js_api_key || "").trim();
    const suggestApiKey = String(data?.yandex_suggest_api_key || "").trim();
    const language = String(data?.language || "ru_RU").trim() || "ru_RU";

    if (!apiKey) {
      throw new Error("Yandex JS API key is not configured");
    }

    return ensureYandexMapsScript({ apiKey, suggestApiKey, language });
  })().catch((error) => {
    yandexMapsPromise = null;
    throw error;
  });

  return yandexMapsPromise;
};
