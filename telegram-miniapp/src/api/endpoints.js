import api from "./index";

export const authAPI = {
  // Авторизация через Telegram
  loginWithTelegram(initData) {
    return api.post("/auth/telegram", { initData });
  },

  // Получение профиля пользователя
  getProfile() {
    return api.get("/users/profile");
  },

  // Обновление данных профиля
  updateProfile(data) {
    return api.put("/users/profile", data);
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
  // Получить все города
  getCities() {
    return api.get("/cities");
  },

  // Получить филиалы города
  getBranches(cityId) {
    return api.get(`/cities/${cityId}/branches`);
  },
};

export const menuAPI = {
  // Получить полное меню города
  getMenu(cityId, { branchId, fulfillmentType } = {}) {
    const params = { city_id: cityId };
    if (branchId) params.branch_id = branchId;
    if (fulfillmentType) params.fulfillment_type = fulfillmentType;
    return api.get(`/menu`, { params });
  },

  // Получить категории меню
  getCategories(cityId) {
    return api.get(`/menu/categories`, { params: { city_id: cityId } });
  },

  // Получить позиции меню
  getItems(categoryId) {
    return api.get(`/menu/categories/${categoryId}/items`);
  },

  // Получить детали позиции с вариантами и модификаторами
  getItemDetails(itemId) {
    return api.get(`/menu/items/${itemId}`);
  },

  // Получить модификаторы позиции (старая система)
  getModifiers(itemId) {
    return api.get(`/menu/items/${itemId}/modifiers`);
  },
};

export const ordersAPI = {
  // Создать заказ
  createOrder(orderData) {
    return api.post("/orders", orderData);
  },

  // Получить список заказов пользователя
  getMyOrders() {
    return api.get("/orders");
  },

  // Получить детали заказа
  getOrderById(orderId) {
    return api.get(`/orders/${orderId}`);
  },

  // Повторить заказ
  repeatOrder(orderId) {
    return api.post(`/orders/${orderId}/repeat`);
  },
};

export const bonusesAPI = {
  // Получить баланс бонусов
  getBalance() {
    return api.get("/bonuses/balance");
  },

  // Получить историю бонусов
  getHistory() {
    return api.get("/bonuses/history").then((response) => ({
      ...response,
      data: {
        transactions: response.data.history || [],
      },
    }));
  },
};

export const addressesAPI = {
  // Получить адреса пользователя
  getAddresses() {
    return api.get("/users/me/addresses");
  },

  // Добавить адрес
  addAddress(addressData) {
    return api.post("/users/me/addresses", addressData);
  },

  // Удалить адрес
  deleteAddress(addressId) {
    return api.delete(`/users/me/addresses/${addressId}`);
  },

  // Проверить адрес в зоне доставки
  checkDeliveryZone(lat, lng, cityId) {
    return api.post("/polygons/check-delivery", { latitude: lat, longitude: lng, city_id: cityId });
  },
};

export const geocodeAPI = {
  // Геокодирование адреса
  geocode(address) {
    return api.post("/geocode", { address });
  },
};
