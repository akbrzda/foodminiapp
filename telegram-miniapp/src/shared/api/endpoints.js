import api from "./index.js";
import { getPlatformBridge } from "@/shared/platform/index.js";

const unwrapResponsePayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (payload.success === true && payload.data && typeof payload.data === "object") {
    return payload.data;
  }

  return payload;
};

const normalizeResponse = (response) => ({
  ...response,
  data: unwrapResponsePayload(response?.data),
});

const withNormalizedResponse = (requestPromise) => requestPromise.then(normalizeResponse);
const getStoriesRequestConfig = () => ({
  headers: {
    "X-Miniapp-Platform": getPlatformBridge().platform,
  },
});

export const authAPI = {
  loginWithMiniApp({ platform, initData, phone }) {
    return withNormalizedResponse(
      api.post("/auth/miniapp", {
        platform,
        initData,
        ...(phone ? { phone } : {}),
      })
    );
  },
  getProfile() {
    return withNormalizedResponse(api.get("/users/profile"));
  },
  updateProfile(data) {
    return withNormalizedResponse(api.put("/users/profile", data));
  },
  deleteAccount() {
    return api.delete("/users/me");
  },
};

export const userStateAPI = {
  getState() {
    return api.get("/users/state");
  },
  updateState(state) {
    return api.put("/users/state", state);
  },
};

export const citiesAPI = {
  getCities() {
    return api.get("/cities");
  },
  getBranches(cityId) {
    return api.get(`/cities/${cityId}/branches`);
  },
};

export const menuAPI = {
  getMenu(cityId, { branchId, fulfillmentType } = {}) {
    const params = { city_id: cityId };
    if (branchId) params.branch_id = branchId;
    if (fulfillmentType) params.fulfillment_type = fulfillmentType;
    return api.get(`/menu`, { params });
  },
  getCategories(cityId) {
    return api.get(`/menu/categories`, { params: { city_id: cityId } });
  },
  getItems(categoryId) {
    return api.get(`/menu/categories/${categoryId}/products`);
  },
  getItemDetails(itemId, { cityId, branchId, fulfillmentType } = {}) {
    const params = {};
    if (cityId) params.city_id = cityId;
    if (branchId) params.branch_id = branchId;
    if (fulfillmentType) params.fulfillment_type = fulfillmentType;
    return api.get(`/menu/products/${itemId}`, { params });
  },
  getModifiers(itemId) {
    return api.get(`/menu/products/${itemId}/modifiers`);
  },
  getUpsell(payload) {
    return api.post("/menu/upsell", payload);
  },
};

export const ordersAPI = {
  createOrder(orderData) {
    return api.post("/orders", orderData);
  },
  getMyOrders() {
    return api.get("/orders");
  },
  getOrderById(orderId) {
    return api.get(`/orders/${orderId}`);
  },
  repeatOrder(orderId) {
    return api.post(`/orders/${orderId}/repeat`);
  },
};

export const bonusesAPI = {
  getBalance() {
    return withNormalizedResponse(api.get("/client/loyalty/balance"));
  },
  getHistory(params = {}) {
    return withNormalizedResponse(api.get("/client/loyalty/history", { params }));
  },
  calculateMaxSpend(orderTotal, deliveryCost = 0) {
    return withNormalizedResponse(
      api.get("/client/loyalty/calculate-max-spend", {
        params: { orderTotal, deliveryCost },
      })
    );
  },
  getLevels() {
    return withNormalizedResponse(api.get("/client/loyalty/levels"));
  },
};

export const addressesAPI = {
  getAddresses() {
    return api.get("/users/me/addresses");
  },
  addAddress(addressData) {
    return api.post("/users/me/addresses", addressData);
  },
  deleteAddress(addressId) {
    return api.delete(`/users/me/addresses/${addressId}`);
  },
  checkDeliveryZone(lat, lng, cityId, cartAmount) {
    const payload = { latitude: lat, longitude: lng, city_id: cityId };
    if (Number.isFinite(Number(cartAmount))) {
      payload.cart_amount = cartAmount;
    }
    return api.post("/polygons/check-delivery", payload);
  },
  searchAddress(payload, config = {}) {
    return api.post("/polygons/geocode", payload, config);
  },
  reverseGeocode(lat, lng, config = {}) {
    return api.post("/polygons/reverse", { latitude: lat, longitude: lng }, config);
  },
  getCityPolygons(cityId) {
    return api.get(`/polygons/city/${cityId}`);
  },
  searchStreetDirectory(cityId, query, limit = 10, config = {}) {
    return api.get("/polygons/address-directory/streets", {
      ...config,
      params: {
        city_id: cityId,
        q: query,
        limit,
        ...(config?.params || {}),
      },
    });
  },
};

export const settingsAPI = {
  getSettings() {
    return api.get("/settings");
  },
  getMapsPublic() {
    return api.get("/settings/maps-public");
  },
};

export const storiesAPI = {
  getActive({ placement = "home", cityId = null, branchId = null } = {}) {
    const params = { placement };
    if (cityId) params.city_id = cityId;
    if (branchId) params.branch_id = branchId;
    return withNormalizedResponse(api.get("/stories/active", { params, ...getStoriesRequestConfig() }));
  },
  trackImpression({ campaignId, slideId = null, placement = "home" }) {
    return api.post(
      "/stories/impression",
      {
        campaign_id: campaignId,
        slide_id: slideId,
        placement,
      },
      getStoriesRequestConfig()
    );
  },
  trackClick({ campaignId, slideId = null, placement = "home", ctaType = "none", ctaValue = null }) {
    return api.post(
      "/stories/click",
      {
        campaign_id: campaignId,
        slide_id: slideId,
        placement,
        cta_type: ctaType,
        cta_value: ctaValue,
      },
      getStoriesRequestConfig()
    );
  },
  trackComplete({ campaignId, lastSlideIndex = 0 }) {
    return api.post(
      "/stories/complete",
      {
        campaign_id: campaignId,
        last_slide_index: lastSlideIndex,
      },
      getStoriesRequestConfig()
    );
  },
};
