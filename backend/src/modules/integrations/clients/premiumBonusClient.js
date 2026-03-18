import { createHttpClient, normalizeIntegrationError, requestWithRetry } from "./baseClient.js";

export function createPremiumBonusClient({ apiUrl, apiToken, salePointId }) {
  const normalizedApiUrl = String(apiUrl || "").trim().replace(/\/+$/, "");
  const normalizedSalePointId = String(salePointId || "").trim();
  const client = createHttpClient({
    baseURL: normalizedApiUrl,
    token: apiToken,
    timeout: 20000,
    authMode: "raw",
    extraHeaders: {
      "X-Sale-Point-Id": salePointId || "",
    },
  });

  const withSalePoint = (payload = {}) => {
    if (!normalizedSalePointId) return payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload) && !payload.sale_point_id) {
      return {
        ...payload,
        sale_point_id: normalizedSalePointId,
      };
    }
    return payload;
  };

  const normalizePhoneForPremiumBonus = (value) => {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (digits.length === 11 && digits.startsWith("7")) return digits;
    if (digits.length === 10) return `7${digits}`;
    return digits;
  };

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
        const { data } = await requestWithRetry(() => client.post("/buyer-info", withSalePoint(payload)), { retries: 2 });
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
        const { data } = await requestWithRetry(() => client.post("/purchase-request", withSalePoint(payload)), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка расчета выгоды PremiumBonus");
      }
    },

    async createPurchase(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/purchase", withSalePoint(payload)), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка создания покупки PremiumBonus");
      }
    },

    async changePurchaseStatus(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/change-purchase-status", withSalePoint(payload)), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка обновления статуса покупки PremiumBonus");
      }
    },

    async setPurchaseExternalId(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/purchase-set-external-id", withSalePoint(payload)), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка обновления external_purchase_id в PremiumBonus");
      }
    },

    async cancelPurchase(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/cancel-purchase", withSalePoint(payload)), { retries: 2 });
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

    async buyerBonus(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer-bonus", withSalePoint(payload)), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения бонусных пакетов PremiumBonus");
      }
    },

    async statusTransitionInfo(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/buyer/status-transition-info", withSalePoint(payload)), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения переходов статусов PremiumBonus");
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

    async trigger(payload) {
      try {
        // По спецификации /trigger принимает поля события и идентификатора покупателя
        // (phone или email). sale_point_id для этого метода не используется.
        const { data } = await requestWithRetry(() => client.post("/trigger", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка запуска триггера PremiumBonus");
      }
    },

    async getSalePoints(payload = {}) {
      try {
        const { data } = await requestWithRetry(() => client.post("/cashbox-list", payload), { retries: 2 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения точек продаж PremiumBonus");
      }
    },

    async sendRegisterCode(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/send-register-code", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка отправки кода регистрации PremiumBonus");
      }
    },

    async sendWriteOffConfirmationCode(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/send-write-off-confirmation-code", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка отправки кода подтверждения списания PremiumBonus");
      }
    },

    async verifyConfirmationCode(payload) {
      try {
        const { data } = await requestWithRetry(() => client.post("/verify-confirmation-code", payload), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка проверки кода подтверждения PremiumBonus");
      }
    },

    async transactionHistory(payload) {
      try {
        const source = payload && typeof payload === "object" ? payload : {};
        let phone = normalizePhoneForPremiumBonus(source.phone);

        if (!phone) {
          const identificator = String(source.identificator || "").trim();
          if (/^\+?\d{10,15}$/.test(identificator)) {
            phone = normalizePhoneForPremiumBonus(identificator);
          } else if (identificator) {
            const info = await requestWithRetry(() => client.post("/buyer-info", withSalePoint({ identificator })), { retries: 1 });
            phone = normalizePhoneForPremiumBonus(info?.data?.phone || info?.phone);
          }
        }

        if (!phone || phone.length !== 11) {
          throw new Error("Не удалось определить телефон для запроса истории PremiumBonus");
        }

        const { data } = await requestWithRetry(() => client.post("/buyer/purchase-list", withSalePoint({ phone })), { retries: 1 });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка истории транзакций PremiumBonus");
      }
    },
  };
}
