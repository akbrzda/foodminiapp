import axios from "axios";

/**
 * Клиент для API системы "Гуляш"
 *
 * Режимы работы:
 * - mock: Заглушка для демо/разработки (по умолчанию)
 * - real: Реальный API Гуляш (когда будет готов)
 *
 * Для демо-версии рекомендуется ENABLE_SYNC=false в .env
 */
class GulyashClient {
  constructor() {
    this.baseURL = process.env.GULYASH_API_URL || "https://api.gulyash.example.com";
    this.apiKey = process.env.GULYASH_API_KEY || "";

    // Режим работы: 'mock' (заглушка) или 'real' (реальный API)
    // По умолчанию mock, пока не настроен реальный API
    this.mode = process.env.GULYASH_MODE || "mock";

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
    });

    if (this.mode === "mock") {
      console.log("⚠️  Gulyash API в режиме MOCK (заглушка). Для включения реального API установите GULYASH_MODE=real");
    }
  }

  /**
   * Проверка доступности API
   */
  async healthCheck() {
    if (this.mode === "mock") {
      return { available: true, mode: "mock", message: "Mock mode enabled" };
    }

    try {
      await this.client.get("/health");
      return { available: true, mode: "real" };
    } catch (error) {
      return { available: false, mode: "real", error: error.message };
    }
  }

  // ==================== Заказы ====================

  /**
   * Отправить заказ в систему "Гуляш"
   */
  async createOrder(orderData) {
    // Mock режим - имитация успешного создания заказа
    if (this.mode === "mock") {
      // Имитация задержки сети
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        success: true,
        gulyash_order_id: `MOCK-${Date.now()}`,
        mode: "mock",
      };
    }

    // Реальный режим
    try {
      const response = await this.client.post("/orders", {
        order_number: orderData.order_number,
        client: {
          phone: orderData.client_phone,
          name: orderData.client_name,
          gulyash_client_id: orderData.gulyash_client_id,
        },
        order_type: orderData.order_type,
        branch_id: orderData.gulyash_branch_id,
        items: orderData.items.map((item) => ({
          gulyash_item_id: item.gulyash_item_id,
          quantity: item.quantity,
          modifiers: item.modifiers.map((m) => m.gulyash_modifier_id),
        })),
        delivery_address: orderData.delivery_address,
        payment_method: orderData.payment_method,
        total: orderData.total,
        comment: orderData.comment,
        desired_time: orderData.desired_time,
      });

      return {
        success: true,
        gulyash_order_id: response.data.order_id,
        mode: "real",
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }

  /**
   * Обновить статус заказа
   */
  async updateOrderStatus(gulyashOrderId, status) {
    if (this.mode === "mock") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { success: true, mode: "mock" };
    }

    try {
      await this.client.put(`/orders/${gulyashOrderId}/status`, {
        status,
      });

      return { success: true, mode: "real" };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }

  /**
   * Получить информацию о заказе
   */
  async getOrder(gulyashOrderId) {
    try {
      const response = await this.client.get(`/orders/${gulyashOrderId}`);

      return {
        success: true,
        order: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==================== Клиенты ====================

  /**
   * Синхронизировать клиента
   */
  async syncClient(clientData) {
    if (this.mode === "mock") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        success: true,
        gulyash_client_id: `MOCK-CLIENT-${Date.now()}`,
        mode: "mock",
      };
    }

    try {
      const response = await this.client.post("/clients", {
        phone: clientData.phone,
        first_name: clientData.first_name,
        last_name: clientData.last_name,
        email: clientData.email,
        date_of_birth: clientData.date_of_birth,
      });

      return {
        success: true,
        gulyash_client_id: response.data.client_id,
        mode: "real",
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }

  /**
   * Обновить данные клиента
   */
  async updateClient(gulyashClientId, clientData) {
    try {
      await this.client.put(`/clients/${gulyashClientId}`, clientData);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==================== Бонусы ====================

  /**
   * Получить баланс бонусов клиента
   */
  async getClientBonusBalance(gulyashClientId) {
    try {
      const response = await this.client.get(`/clients/${gulyashClientId}/bonuses`);

      return {
        success: true,
        balance: response.data.balance,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Синхронизировать бонусную транзакцию
   */
  async syncBonusTransaction(transactionData) {
    if (this.mode === "mock") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        gulyash_transaction_id: `MOCK-BONUS-${Date.now()}`,
        mode: "mock",
      };
    }

    try {
      const response = await this.client.post("/bonuses/transactions", {
        gulyash_client_id: transactionData.gulyash_client_id,
        type: transactionData.type,
        amount: transactionData.amount,
        order_number: transactionData.order_number,
        description: transactionData.description,
      });

      return {
        success: true,
        gulyash_transaction_id: response.data.transaction_id,
        mode: "real",
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }

  // ==================== Меню ====================

  /**
   * Получить меню города
   */
  async getMenu(gulyashCityId) {
    if (this.mode === "mock") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        menu: [],
        mode: "mock",
        message: "Меню хранится локально в БД",
      };
    }

    try {
      const response = await this.client.get(`/cities/${gulyashCityId}/menu`);

      return {
        success: true,
        menu: response.data,
        mode: "real",
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }

  // ==================== Полигоны ====================

  /**
   * Получить полигоны доставки филиала
   */
  async getDeliveryPolygons(gulyashBranchId) {
    if (this.mode === "mock") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        success: true,
        polygons: [],
        mode: "mock",
        message: "Полигоны хранятся локально в БД",
      };
    }

    try {
      const response = await this.client.get(`/branches/${gulyashBranchId}/polygons`);

      return {
        success: true,
        polygons: response.data,
        mode: "real",
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        mode: "real",
      };
    }
  }
}

// Экспортируем singleton instance
export default new GulyashClient();
