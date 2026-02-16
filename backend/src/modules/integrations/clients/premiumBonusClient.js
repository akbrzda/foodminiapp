import { createHttpClient, normalizeIntegrationError, requestWithRetry } from "./baseClient.js";

export function createPremiumBonusClient({ apiUrl, apiToken, salePointId }) {
  const client = createHttpClient({
    baseURL: apiUrl,
    token: apiToken,
    timeout: 20000,
    extraHeaders: {
      "X-Sale-Point-Id": salePointId || "",
    },
  });

  return {
    async ping() {
      try {
        const { data } = await client.post("/buyer-groups", {});
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка подключения к PremiumBonus");
      }
    },

    async buyerInfo(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-info", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения клиента PremiumBonus");
      }
    },

    async registerBuyer(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-register", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка регистрации клиента PremiumBonus");
      }
    },

    async editBuyer(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-edit", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка обновления профиля PremiumBonus");
      }
    },

    async purchaseRequest(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/purchase-request", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка расчета выгоды PremiumBonus");
      }
    },

    async createPurchase(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/purchase", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка создания покупки PremiumBonus");
      }
    },

    async changePurchaseStatus(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/change-purchase-status", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка обновления статуса покупки PremiumBonus");
      }
    },

    async cancelPurchase(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/cancel-purchase", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка отмены покупки PremiumBonus");
      }
    },

    async buyerGroups(payload = {}) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-groups", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения групп PremiumBonus");
      }
    },

    async activatePromocode(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/promocode/activate-promocode", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка активации промокода PremiumBonus");
      }
    },

    async transactionHistory(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-operations", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка истории транзакций PremiumBonus");
      }
    },
  };
}
