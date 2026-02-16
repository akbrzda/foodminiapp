import axios from "axios";

const DEFAULT_TIMEOUT = 15000;

export class IntegrationApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "IntegrationApiError";
    this.status = options.status || null;
    this.code = options.code || null;
    this.response = options.response || null;
  }
}

export function createHttpClient({ baseURL, token, timeout = DEFAULT_TIMEOUT, extraHeaders = {} }) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (token) {
    const normalizedToken = String(token).trim();
    headers.Authorization = /^Bearer\s+/i.test(normalizedToken) ? normalizedToken : `Bearer ${normalizedToken}`;
  }

  return axios.create({
    baseURL,
    timeout,
    headers,
  });
}

export async function requestWithRetry(executor, { retries = 2, baseDelayMs = 500 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await executor(attempt);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) break;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function normalizeIntegrationError(error, fallbackMessage) {
  if (error instanceof IntegrationApiError) return error;

  const status = error?.response?.status || null;
  const code = error?.code || null;
  const response = error?.response?.data || null;
  const responseMessage =
    response?.message ||
    response?.errorDescription ||
    response?.error ||
    response?.description ||
    null;
  const message = responseMessage || error?.message || fallbackMessage;

  return new IntegrationApiError(message, { status, code, response });
}
