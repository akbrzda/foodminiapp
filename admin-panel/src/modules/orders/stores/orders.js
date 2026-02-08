import { defineStore } from "pinia";
import api from "@/shared/api/client.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { devError } from "@/shared/utils/logger";
export const useOrdersStore = defineStore("orders", {
  state: () => ({
    newOrdersCount: 0,
    lastEvent: null,
    lastBonusEvent: null,
    lastBroadcastEvent: null,
    statusById: {},
    breadcrumbs: {
      items: [],
      owner: null,
    },
    ws: null,
    connecting: false,
    rooms: [],
    reconnectTimer: null,
    reconnectAttempts: 0,
  }),
  actions: {
    setBreadcrumbs(items = [], owner = null) {
      this.breadcrumbs = {
        items: Array.isArray(items) ? items : [],
        owner,
      };
    },
    clearBreadcrumbs(owner = null) {
      if (owner && this.breadcrumbs.owner !== owner) return;
      this.breadcrumbs = { items: [], owner: null };
    },
    setNewOrdersCount(value) {
      const normalized = Number(value);
      this.newOrdersCount = Number.isFinite(normalized) ? Math.max(0, Math.trunc(normalized)) : 0;
    },
    async refreshNewOrdersCount() {
      try {
        const response = await api.get("/api/orders/admin/count", { params: { status: "pending" } });
        this.setNewOrdersCount(response.data?.total || 0);
      } catch (error) {
        devError("Ошибка загрузки количества новых заказов:", error);
      }
    },
    applyOrderEvent(payload) {
      this.lastEvent = payload ? { ...payload, receivedAt: Date.now() } : null;
      if (!payload?.type) return;
      if (payload.type.startsWith("broadcast:")) {
        this.lastBroadcastEvent = { ...payload, receivedAt: Date.now() };
        return;
      }
      if (payload.type === "bonus-updated") {
        this.lastBonusEvent = { ...payload, receivedAt: Date.now() };
        return;
      }
      if (payload.type === "new-order") {
        const order = payload.data || {};
        const status = order.status || "pending";
        if (order.id) {
          this.statusById[order.id] = status;
        }
        if (status === "pending") {
          this.setNewOrdersCount(this.newOrdersCount + 1);
        }
        return;
      }
      if (payload.type === "order-status-updated") {
        const { orderId, newStatus } = payload.data || {};
        if (!orderId) return;
        const previousStatus = this.statusById[orderId];
        this.statusById[orderId] = newStatus;
        if (!previousStatus) {
          this.refreshNewOrdersCount();
          return;
        }
        if (previousStatus === "pending" && newStatus !== "pending") {
          this.setNewOrdersCount(this.newOrdersCount - 1);
          return;
        }
        if (previousStatus !== "pending" && newStatus === "pending") {
          this.setNewOrdersCount(this.newOrdersCount + 1);
        }
      }
    },
    trackOrders(orders = []) {
      if (!Array.isArray(orders)) return;
      orders.forEach((order) => {
        if (order?.id) {
          this.statusById[order.id] = order.status || this.statusById[order.id];
        }
      });
    },
    async connectWebSocket() {
      if (this.ws || this.connecting) return;
      const authStore = useAuthStore();
      const token = authStore.token;
      if (!token) return;
      this.connecting = true;
      const apiBase = api.defaults.baseURL || "http://localhost:3000";
      const wsBase = import.meta.env.VITE_WS_URL || apiBase;
      let wsUrl;
      try {
        wsUrl = new URL(wsBase, window.location.origin);
      } catch (error) {
        devError("Некорректный WS URL:", error);
        this.connecting = false;
        return;
      }
      if (wsUrl.pathname.startsWith("/api") || wsUrl.pathname === "/" || wsUrl.pathname === "") {
        wsUrl.pathname = "/socket";
      }
      const isSecure = window.location.protocol === "https:" || wsUrl.protocol === "https:";
      wsUrl.protocol = isSecure ? "wss:" : "ws:";
      let ticket = "";
      try {
        const ticketResponse = await api.post("/api/auth/ws-ticket");
        ticket = ticketResponse.data?.ticket || "";
      } catch (error) {
        devError("Не удалось получить WS ticket:", error);
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
      if (!ticket) {
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
      wsUrl.searchParams.set("ticket", ticket);
      this.ws = new WebSocket(wsUrl.toString());
      this.ws.onopen = () => {
        this.connecting = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.syncRooms();
      };
      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.applyOrderEvent(payload);
        } catch (error) {
          devError("Ошибка обработки WS-сообщения:", error);
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        this.connecting = false;
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.connecting = false;
      };
    },
    scheduleReconnect() {
      if (this.reconnectTimer) return;
      const delay = Math.min(30000, 2000 * (this.reconnectAttempts + 1));
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectWebSocket();
      }, delay);
    },
    disconnectWebSocket() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.connecting = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    },
    syncRooms() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.rooms.forEach((roomId) => {
        this.ws.send(JSON.stringify({ type: "join-room", data: { roomId } }));
      });
    },
    joinRoom(roomId) {
      if (!roomId) return;
      if (!this.rooms.includes(roomId)) {
        this.rooms.push(roomId);
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "join-room", data: { roomId } }));
      }
    },
    leaveRoom(roomId) {
      if (!roomId) return;
      this.rooms = this.rooms.filter((existing) => existing !== roomId);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "leave-room", data: { roomId } }));
      }
    },
  },
});
