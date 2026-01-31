import { defineStore } from "pinia";
import api from "../api/client.js";
import { useAuthStore } from "./auth.js";
export const useOrdersStore = defineStore("orders", {
  state: () => ({
    newOrdersCount: 0,
    lastEvent: null,
    lastBonusEvent: null,
    lastBroadcastEvent: null,
    statusById: {},
    ws: null,
    connecting: false,
    rooms: [],
  }),
  actions: {
    setNewOrdersCount(value) {
      const normalized = Number(value);
      this.newOrdersCount = Number.isFinite(normalized) ? Math.max(0, Math.trunc(normalized)) : 0;
    },
    async refreshNewOrdersCount() {
      try {
        const response = await api.get("/api/orders/admin/count", { params: { status: "pending" } });
        this.setNewOrdersCount(response.data?.total || 0);
      } catch (error) {
        console.error("Ошибка загрузки количества новых заказов:", error);
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
    connectWebSocket() {
      if (this.ws || this.connecting) return;
      const authStore = useAuthStore();
      const token = authStore.token;
      if (!token) return;
      const apiBase = api.defaults.baseURL || "http://localhost:3000";
      const wsBase = import.meta.env.VITE_WS_URL || apiBase;
      let wsUrl;
      try {
        wsUrl = new URL(wsBase);
      } catch (error) {
        console.error("Некорректный WS URL:", error);
        return;
      }
      const isSecure = window.location.protocol === "https:" || wsUrl.protocol === "https:";
      wsUrl.protocol = isSecure ? "wss:" : "ws:";
      wsUrl.searchParams.set("token", token);
      this.connecting = true;
      this.ws = new WebSocket(wsUrl.toString());
      this.ws.onopen = () => {
        this.connecting = false;
        this.syncRooms();
      };
      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.applyOrderEvent(payload);
        } catch (error) {
          console.error("Ошибка обработки WS-сообщения:", error);
        }
      };
      this.ws.onclose = () => {
        this.ws = null;
        this.connecting = false;
        setTimeout(() => this.connectWebSocket(), 5000);
      };
      this.ws.onerror = () => {
        this.connecting = false;
      };
    },
    disconnectWebSocket() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.connecting = false;
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
