const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "").replace(/\/api$/i, "");

let csrfTokenCache = "";
let csrfTokenPromise = null;

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

export const setCsrfToken = (token) => {
  csrfTokenCache = isNonEmptyString(token) ? token.trim() : "";
  return csrfTokenCache;
};

export const getCachedCsrfToken = () => csrfTokenCache;

export const clearCsrfToken = () => {
  csrfTokenCache = "";
};

export const fetchCsrfToken = async ({ force = false } = {}) => {
  if (!force && csrfTokenCache) {
    return csrfTokenCache;
  }

  if (!force && csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = fetch(`${apiBase}/api/auth/csrf`, {
    method: "GET",
    headers: {
      Accept: "application/json; charset=utf-8",
    },
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) {
        return "";
      }
      const payload = await response.json();
      return setCsrfToken(payload?.csrfToken || "");
    })
    .catch(() => "")
    .finally(() => {
      csrfTokenPromise = null;
    });

  return csrfTokenPromise;
};

export const withCsrfHeader = async (headers = {}, options = {}) => {
  const token = getCachedCsrfToken() || (await fetchCsrfToken(options));
  if (!token) return headers;
  return {
    ...headers,
    "X-CSRF-Token": token,
  };
};
