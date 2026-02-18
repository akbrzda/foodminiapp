import { devLog, devWarn } from "@/shared/utils/logger.js";

const normalizeApiBase = (value) => {
  const raw = String(value || "").trim().replace(/\/$/, "");
  return raw.replace(/\/api$/i, "");
};

class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.listeners = new Map();
    this.isConnecting = false;
  }
  async requestTicket(token) {
    const apiBase = normalizeApiBase(import.meta.env.VITE_API_URL);
    const response = await fetch(`${apiBase}/api/auth/ws-ticket`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Не удалось получить WS ticket");
    }
    const payload = await response.json();
    if (!payload?.ticket) {
      throw new Error("WS ticket отсутствует в ответе");
    }
    return payload.ticket;
  }
  async connect(token) {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }
    if (!token) {
      return;
    }
    this.isConnecting = true;
    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const normalizedApiBase = normalizeApiBase(import.meta.env.VITE_API_URL);
      const host = normalizedApiBase ? new URL(normalizedApiBase).host : "localhost:3000";
      wsUrl = `${protocol}//${host}/socket`;
    }
    try {
      const normalized = new URL(wsUrl, window.location.origin);
      if (normalized.pathname.startsWith("/api") || normalized.pathname === "/" || normalized.pathname === "") {
        normalized.pathname = "/socket";
      }
      wsUrl = normalized.toString();
    } catch (error) {
      // если URL некорректный, оставляем как есть
    }
    try {
      const ticket = await this.requestTicket(token);
      this.ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`);
      this.ws.onopen = () => {
        devLog("WebSocket подключен");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit("connected");
      };
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          devLog("Сообщение WebSocket:", data);
          if (data.type) {
            this.emit(data.type, data.data);
          }
        } catch (error) {
          console.error("Не удалось разобрать сообщение WebSocket:", error);
        }
      };
      this.ws.onerror = (error) => {
        console.error("Ошибка WebSocket:", error);
        this.isConnecting = false;
        this.emit("error", error);
      };
      this.ws.onclose = () => {
        devLog("WebSocket отключен");
        this.isConnecting = false;
        this.emit("disconnected");
        this.scheduleReconnect(token);
      };
    } catch (error) {
      console.error("Не удалось создать WebSocket:", error);
      this.isConnecting = false;
      this.scheduleReconnect(token);
    }
  }
  scheduleReconnect(token) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Достигнут максимум попыток переподключения");
      this.emit("max-reconnect-attempts");
      return;
    }
    this.reconnectAttempts++;
    devLog(`Переподключение через ${this.reconnectDelay}мс (попытка ${this.reconnectAttempts})`);
    setTimeout(() => {
      this.connect(token);
    }, this.reconnectDelay);
  }
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
  }
  send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data: payload }));
    } else {
      devWarn("WebSocket не подключен");
    }
  }
  on(event, callback) {
    if (typeof callback !== "function") return;
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const callbacks = this.listeners.get(event);
    if (callbacks.includes(callback)) return;
    callbacks.push(callback);
  }
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
    if (callbacks.length === 0) {
      this.listeners.delete(event);
    }
  }
  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Ошибка обработчика WebSocket для события ${event}:`, error);
      }
    });
  }
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
export const wsService = new WebSocketService();
