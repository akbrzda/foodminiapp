import { createHttpClient, normalizeIntegrationError, requestWithRetry } from "./baseClient.js";

export function createIikoClient({ apiUrl, apiLogin, apiKey, organizationId }) {
  const normalizedApiUrl = String(apiUrl || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/1$/i, "");
  let runtimeBearerToken = "";
  let organizationsCache = null;

  const plainClient = createHttpClient({
    baseURL: normalizedApiUrl,
    timeout: 20000,
  });

  const buildAuthorizedClient = (token) =>
    createHttpClient({
      baseURL: normalizedApiUrl,
      token,
      timeout: 20000,
    });

  const resolveBearerToken = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh && runtimeBearerToken) {
      return runtimeBearerToken;
    }

    const normalizedLogin = String(apiLogin || "").trim();
    const normalizedKey = String(apiKey || "").trim();
    const hasLogin = Boolean(normalizedLogin);
    const hasKey = Boolean(normalizedKey);

    if (!hasLogin) {
      throw new Error("Не заполнен iiko_api_login");
    }

    // Совместимость с iiko-профилями, где используется только apiLogin.
    const requestPayloads = [];
    if (hasKey) {
      requestPayloads.push({ apiLogin: normalizedLogin, apiKey: normalizedKey });
    }
    requestPayloads.push({ apiLogin: normalizedLogin });

    try {
      let lastError = null;
      for (const requestPayload of requestPayloads) {
        try {
          const { data } = await plainClient.post("/api/1/access_token", requestPayload);
          const token = data?.token || data?.access_token || (typeof data === "string" ? data : null);
          if (!token) {
            throw new Error("iiko не вернул access token");
          }
          runtimeBearerToken = token;
          return runtimeBearerToken;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Не удалось получить access token iiko");
    } catch (tokenError) {
      throw tokenError;
    }
  };

  const withAuthorizedRequest = async (executor) => {
    try {
      const token = await resolveBearerToken();
      const client = buildAuthorizedClient(token);
      return await executor(client);
    } catch (error) {
      const status = error?.response?.status || null;
      if (status === 401) {
        const token = await resolveBearerToken({ forceRefresh: true });
        const client = buildAuthorizedClient(token);
        return executor(client);
      }
      throw error;
    }
  };

  const extractOrganizations = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.organizations)) return payload.organizations;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  };

  const extractTerminalGroups = (payload) => {
    const flattenTerminalGroups = (rows = []) => {
      const result = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const hasDirectId = row.id || row.terminalGroupId || row.terminal_group_id;
        if (hasDirectId) {
          result.push(row);
          continue;
        }

        const orgId = row.organizationId || row.organization_id || row.orgId || null;
        const items = Array.isArray(row.items) ? row.items : [];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          result.push({
            ...item,
            organizationId: item.organizationId || item.organization_id || orgId,
          });
        }
      }
      return result;
    };

    if (Array.isArray(payload)) return flattenTerminalGroups(payload);
    if (Array.isArray(payload?.terminalGroups)) return flattenTerminalGroups(payload.terminalGroups);
    if (Array.isArray(payload?.terminal_groups)) return flattenTerminalGroups(payload.terminal_groups);
    if (Array.isArray(payload?.items)) return flattenTerminalGroups(payload.items);

    if (Array.isArray(payload?.organizations)) {
      const groups = [];
      for (const organization of payload.organizations) {
        const organizationIdValue = normalizeOrganizationId(organization);
        const orgGroups = Array.isArray(organization?.terminalGroups)
          ? organization.terminalGroups
          : Array.isArray(organization?.terminal_groups)
            ? organization.terminal_groups
            : Array.isArray(organization?.items)
              ? organization.items
              : [];
        for (const group of orgGroups) {
          groups.push({
            ...group,
            organizationId: group?.organizationId || group?.organization_id || organizationIdValue,
          });
        }
      }
      return groups;
    }

    return [];
  };

  const extractExternalMenus = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.externalMenus)) return payload.externalMenus;
    if (Array.isArray(payload?.menus)) return payload.menus;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  };
  const extractPriceCategories = (payload) => {
    if (Array.isArray(payload?.priceCategories)) return payload.priceCategories;
    if (Array.isArray(payload?.price_categories)) return payload.price_categories;
    if (Array.isArray(payload?.prices)) return payload.prices;
    return [];
  };

  const normalizeOrganizationId = (org) => org?.id || org?.organizationId || org?.organization_id || null;

  const getOrganizations = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh && Array.isArray(organizationsCache) && organizationsCache.length > 0) {
      return organizationsCache;
    }

    const { data } = await withAuthorizedRequest((client) => client.post("/api/1/organizations", {}));
    organizationsCache = extractOrganizations(data);
    return organizationsCache;
  };

  const getOrganizationIds = async ({ useConfiguredOrganization = true } = {}) => {
    const organizations = await getOrganizations();
    const availableIds = organizations.map((org) => normalizeOrganizationId(org)).filter(Boolean);
    if (!useConfiguredOrganization || !organizationId) {
      return availableIds;
    }

    const requestedIds = String(organizationId)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (requestedIds.length === 0) {
      return availableIds;
    }

    const requestedSet = new Set(requestedIds);
    const filtered = availableIds.filter((id) => requestedSet.has(id));
    if (filtered.length === 0) {
      throw new Error("Выбранная организация iiko не найдена среди доступных");
    }
    return filtered;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchNomenclatureForOrganizations = async (organizationIds = [], lastRevisions = {}) => {
    const responses = [];
    const errors = [];
    const stats = [];

    for (let index = 0; index < organizationIds.length; index += 1) {
      const orgId = organizationIds[index];
      try {
        const startRevision = lastRevisions[orgId] || 0;
        const { data } = await requestWithRetry(
          async (attempt) => {
            try {
              return await withAuthorizedRequest((client) =>
                client.post("/api/1/nomenclature", {
                  organizationId: orgId,
                  startRevision,
                }),
              );
            } catch (error) {
              const status = error?.response?.status || null;
              if (status === 429) {
                const retryDelayMs = Math.min(6000, 1500 * 2 ** attempt);
                await sleep(retryDelayMs);
              }
              throw error;
            }
          },
          { retries: 3, baseDelayMs: 1500 },
        );
        stats.push({
          organizationId: orgId,
          groups: Array.isArray(data?.groups) ? data.groups.length : 0,
          productCategories: Array.isArray(data?.productCategories) ? data.productCategories.length : 0,
          products: Array.isArray(data?.products) ? data.products.length : 0,
          revision: data?.revision ?? null,
        });
        responses.push(data);
      } catch (error) {
        errors.push({
          organizationId: orgId,
          status: error?.response?.status || error?.status || null,
          message: error?.response?.data?.errorDescription || error?.response?.data?.error || error?.message || "Ошибка запроса",
        });
      }

      // Небольшая пауза между организациями снижает риск 429.
      if (index < organizationIds.length - 1) {
        await sleep(700);
      }
    }

    return { responses, errors, stats };
  };

  const mergeNomenclatureResponses = (responses = []) => {
    if (responses.length === 1) {
      return responses[0];
    }

    const merged = { organizations: responses };
    const categories = [];
    const items = [];
    const modifierGroups = [];
    const modifiers = [];

    for (const response of responses) {
      if (Array.isArray(response?.categories)) categories.push(...response.categories);
      if (Array.isArray(response?.items)) items.push(...response.items);
      if (Array.isArray(response?.modifier_groups)) modifierGroups.push(...response.modifier_groups);
      if (Array.isArray(response?.modifiers)) modifiers.push(...response.modifiers);
      if (Array.isArray(response?.groups)) categories.push(...response.groups);
      if (Array.isArray(response?.productCategories)) categories.push(...response.productCategories);
      if (Array.isArray(response?.products)) items.push(...response.products);
    }

    if (categories.length) merged.categories = categories;
    if (items.length) merged.items = items;
    if (modifierGroups.length) merged.modifier_groups = modifierGroups;
    if (modifiers.length) merged.modifiers = modifiers;

    return merged;
  };

  const getPrimaryOrganizationId = async () => {
    const ids = await getOrganizationIds();
    if (!ids.length) {
      throw new Error("Не найдено доступных организаций iiko");
    }
    return ids[0];
  };

  return {
    async ping() {
      try {
        const { data } = await withAuthorizedRequest((client) => client.post("/api/1/organizations", {}));
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка подключения к iiko");
      }
    },

    async getNomenclature(options = {}) {
      try {
        const organizations = await getOrganizations();
        const allOrganizationIds = organizations.map((org) => normalizeOrganizationId(org)).filter(Boolean);
        if (!allOrganizationIds.length) {
          throw new Error("Не найдено доступных организаций iiko");
        }

        const useConfiguredOrganization = options?.useConfiguredOrganization !== false;
        const selectedOrganizationIds = await getOrganizationIds({ useConfiguredOrganization });
        const primaryIds = selectedOrganizationIds.length > 0 ? selectedOrganizationIds : allOrganizationIds;
        const hasExplicitOrganizationSelection =
          String(organizationId || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean).length > 0;

        const lastRevisions = options?.lastRevisions || {};
        let { responses, errors, stats } = await fetchNomenclatureForOrganizations(primaryIds, lastRevisions);
        let merged = mergeNomenclatureResponses(responses);
        let mergedItemsCount = Array.isArray(merged?.items) ? merged.items.length : Array.isArray(merged?.products) ? merged.products.length : 0;

        // Если в выбранных организациях нет продуктов, пробуем все доступные.
        if (
          useConfiguredOrganization &&
          !hasExplicitOrganizationSelection &&
          mergedItemsCount === 0 &&
          primaryIds.length < allOrganizationIds.length
        ) {
          const remainingIds = allOrganizationIds.filter((id) => !primaryIds.includes(id));
          if (remainingIds.length > 0) {
            const fallbackResult = await fetchNomenclatureForOrganizations(remainingIds, lastRevisions);
            responses = [...responses, ...fallbackResult.responses];
            errors = [...errors, ...fallbackResult.errors];
            stats = [...stats, ...fallbackResult.stats];
            merged = mergeNomenclatureResponses(responses);
            mergedItemsCount = Array.isArray(merged?.items) ? merged.items.length : Array.isArray(merged?.products) ? merged.products.length : 0;
          }
        }

        if (!responses.length) {
          const firstError = errors[0];
          const message =
            firstError?.message || (firstError?.status ? `iiko вернул ошибку ${firstError.status}` : "Не удалось получить номенклатуру iiko");
          throw new Error(message);
        }

        if (errors.length > 0) {
          merged.partialErrors = errors;
        }
        if (stats.length > 0) {
          merged.organizationStats = stats;
        }

        return merged;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения номенклатуры iiko");
      }
    },

    async getNomenclatureByOrganization(organizationIdValue, startRevision = 0) {
      try {
        const orgId = String(organizationIdValue || "").trim();
        if (!orgId) {
          throw new Error("Не передан organizationId");
        }
        const { data } = await requestWithRetry(
          async (attempt) => {
            try {
              return await withAuthorizedRequest((client) =>
                client.post("/api/1/nomenclature", {
                  organizationId: orgId,
                  startRevision,
                }),
              );
            } catch (error) {
              if ((error?.response?.status || null) === 429) {
                const retryDelayMs = Math.min(6000, 1500 * 2 ** attempt);
                await sleep(retryDelayMs);
              }
              throw error;
            }
          },
          { retries: 2, baseDelayMs: 1500 },
        );
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения номенклатуры iiko по организации");
      }
    },

    async getExternalMenus(payload = {}) {
      try {
        const useConfiguredOrganization = payload?.useConfiguredOrganization !== false;
        const organizationIds =
          Array.isArray(payload?.organizationIds) && payload.organizationIds.length > 0
            ? payload.organizationIds
            : await getOrganizationIds({ useConfiguredOrganization });

        const requestPayload = {
          organizationIds,
          ...payload,
        };

        const { data } = await requestWithRetry(() => withAuthorizedRequest((client) => client.post("/api/2/menu", requestPayload)), {
          retries: 2,
          baseDelayMs: 1200,
        });
        return {
          externalMenus: extractExternalMenus(data),
          priceCategories: extractPriceCategories(data),
        };
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения списка внешних меню iiko");
      }
    },

    async getMenuById(payload = {}) {
      try {
        const externalMenuId = String(payload.externalMenuId || payload.external_menu_id || "").trim();
        if (!externalMenuId) {
          throw new Error("Не передан externalMenuId");
        }

        const useConfiguredOrganization = payload?.useConfiguredOrganization !== false;
        const organizationIds =
          Array.isArray(payload?.organizationIds) && payload.organizationIds.length > 0
            ? payload.organizationIds
            : await getOrganizationIds({ useConfiguredOrganization });
        if (!organizationIds.length) {
          throw new Error("Не найдено доступных организаций iiko");
        }

        const requestPayload = {
          organizationIds,
          externalMenuId,
          version: Number(payload?.version) || 2,
          language: String(payload?.language || "ru").trim() || "ru",
        };

        const priceCategoryId = String(payload?.priceCategoryId || payload?.price_category_id || "").trim();
        if (priceCategoryId) {
          requestPayload.priceCategoryId = priceCategoryId;
        }

        const { data } = await requestWithRetry(
          async (attempt) => {
            try {
              return await withAuthorizedRequest((client) => client.post("/api/2/menu/by_id", requestPayload));
            } catch (error) {
              if ((error?.response?.status || null) === 429) {
                const retryDelayMs = Math.min(6000, 1200 * 2 ** attempt);
                await sleep(retryDelayMs);
              }
              throw error;
            }
          },
          { retries: 2, baseDelayMs: 1200 },
        );
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения внешнего меню iiko по ID");
      }
    },

    async getStopList(payload = {}) {
      try {
        const organizationIds = await getOrganizationIds();
        if (!organizationIds.length) {
          throw new Error("Не найдено доступных организаций iiko");
        }
        const requestPayload = {
          organizationIds,
          ...payload,
        };
        const { data } = await requestWithRetry(() => withAuthorizedRequest((client) => client.post("/api/1/stop_lists", requestPayload)), {
          retries: 2,
        });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения стоп-листа iiko");
      }
    },

    async getDeliveryZones(payload = {}) {
      try {
        const organizationIds = await getOrganizationIds();
        if (!organizationIds.length) {
          throw new Error("Не найдено доступных организаций iiko");
        }
        const requestPayload = {
          organizationIds,
          ...payload,
        };
        const { data } = await requestWithRetry(
          () => withAuthorizedRequest((client) => client.post("/api/1/delivery_restrictions", requestPayload)),
          { retries: 2 },
        );
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения зон доставки iiko");
      }
    },

    async createOrder(payload) {
      try {
        const requestPayload = { ...payload };
        if (!requestPayload.organizationId) {
          requestPayload.organizationId = await getPrimaryOrganizationId();
        }
        const { data } = await requestWithRetry(() => withAuthorizedRequest((client) => client.post("/api/1/deliveries/create", requestPayload)), {
          retries: 2,
        });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка отправки заказа в iiko");
      }
    },

    async getOrderStatus(payload) {
      try {
        const requestPayload = { ...payload };
        if (!requestPayload.organizationId) {
          requestPayload.organizationId = await getPrimaryOrganizationId();
        }
        const { data } = await requestWithRetry(() => withAuthorizedRequest((client) => client.post("/api/1/deliveries/by_id", requestPayload)), {
          retries: 1,
        });
        return data;
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения статуса заказа iiko");
      }
    },

    async getOrganizations() {
      try {
        return await getOrganizations();
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения списка организаций iiko");
      }
    },

    async getTerminalGroups(payload = {}) {
      try {
        const useConfiguredOrganization = payload?.useConfiguredOrganization !== false;
        const organizationIds =
          Array.isArray(payload?.organizationIds) && payload.organizationIds.length > 0
            ? payload.organizationIds
            : await getOrganizationIds({ useConfiguredOrganization });
        if (!organizationIds.length) {
          throw new Error("Не найдено доступных организаций iiko");
        }
        const requestPayload = {
          organizationIds,
          ...payload,
        };

        const { data } = await requestWithRetry(() => withAuthorizedRequest((client) => client.post("/api/1/terminal_groups", requestPayload)), {
          retries: 2,
        });
        return extractTerminalGroups(data);
      } catch (error) {
        throw normalizeIntegrationError(error, "Ошибка получения списка филиалов iiko");
      }
    },
  };
}
