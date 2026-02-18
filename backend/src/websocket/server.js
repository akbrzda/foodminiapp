import { WebSocket, WebSocketServer } from "ws";
import redis from "../config/redis.js";

const WS_TICKET_PREFIX = "ws_ticket";

// Rate limiting для WebSocket подключений
const connectionAttempts = new Map();
const MAX_ATTEMPTS = 10; // Максимум 10 попыток
const ATTEMPT_WINDOW = 60000; // За 1 минуту

function checkConnectionRateLimit(ip) {
  const now = Date.now();
  const attempts = connectionAttempts.get(ip) || [];

  // Удаляем старые попытки
  const recentAttempts = attempts.filter((time) => now - time < ATTEMPT_WINDOW);

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return false;
  }

  recentAttempts.push(now);
  connectionAttempts.set(ip, recentAttempts);
  return true;
}

function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
}
function getOriginHost(value) {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch (error) {
    return "";
  }
}
function isOriginAllowed(origin, allowedList) {
  if (!Array.isArray(allowedList) || allowedList.length === 0) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  const originHost = getOriginHost(normalizedOrigin);
  if (originHost === "panda.akbrzda.ru" || originHost.endsWith(".panda.akbrzda.ru")) {
    return true;
  }
  return allowedList.some((allowed) => {
    const normalizedAllowed = normalizeOrigin(allowed);
    if (!normalizedAllowed) return false;
    if (normalizedAllowed === "*") return true;
    if (normalizedAllowed === normalizedOrigin) return true;
    const allowedHost = getOriginHost(normalizedAllowed) || normalizedAllowed;
    if (originHost && allowedHost && originHost === allowedHost) return true;
    return false;
  });
}
function buildAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS || "";
  const fromEnv = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaultProductionOrigins = process.env.NODE_ENV === "production" ? ["https://app.panda.akbrzda.ru", "https://admin.panda.akbrzda.ru"] : [];
  return [...fromEnv, ...defaultProductionOrigins].filter((origin, index, arr) => arr.indexOf(origin) === index);
}

class WSServer {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.userConnections = new Map();
    this.rooms = new Map();
    this.connectionMeta = new WeakMap();
    this.maxConnectionsPerUser = 5; // Максимум 5 подключений на пользователя
    this.setupWebSocketServer(server);
  }

  setupWebSocketServer(server) {
    server.on("upgrade", async (request, socket, head) => {
      try {
        // Получаем IP для rate limiting
        const ip = request.headers["x-forwarded-for"]?.split(",")[0] || request.socket.remoteAddress;

        // Проверяем rate limit
        if (!checkConnectionRateLimit(ip)) {
          socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
          socket.destroy();
          return;
        }

        // Проверяем Origin для защиты от CSRF
        const origin = request.headers.origin;
        const allowedOrigins = buildAllowedOrigins();

        if (process.env.NODE_ENV === "production" && origin && !isOriginAllowed(origin, allowedOrigins)) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        const url = new URL(request.url, `http://${request.headers.host}`);
        const ticket = url.searchParams.get("ticket");

        if (!ticket) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        const redisKey = `${WS_TICKET_PREFIX}:${ticket}`;
        const ticketPayload = await redis.get(redisKey);
        if (!ticketPayload) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        await redis.del(redisKey);

        let decoded;
        try {
          decoded = JSON.parse(ticketPayload);
        } catch (parseError) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request, decoded);
        });
      } catch (error) {
        console.error("WebSocket authentication failed:", error.message);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      }
    });

    this.wss.on("connection", (ws, request, userData) => {
      this.handleConnection(ws, userData);
    });
  }

  handleConnection(ws, userData) {
    const userId = userData.userId ?? userData.id;
    const role = userData.role;
    const city_ids = userData.city_ids ?? userData.cities;

    // Проверяем лимит подключений на пользователя
    const userConns = this.userConnections.get(userId);
    if (userConns && userConns.size >= this.maxConnectionsPerUser) {
      ws.close(1008, "Too many connections");
      return;
    }

    console.log(`WebSocket connected: userId=${userId}, role=${role}`);
    this.connectionMeta.set(ws, {
      userId,
      role,
      cityIds: city_ids || [],
    });
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(ws);
    if (role === "admin" || role === "ceo") {
      this.joinRoom(ws, "admin-orders");
      this.joinRoom(ws, "admin-broadcasts");
    } else if (role === "manager") {
      if (city_ids) {
        city_ids.forEach((cityId) => {
          this.joinRoom(ws, `city-${cityId}-orders`);
        });
      }
      this.joinRoom(ws, "admin-broadcasts");
    }
    this.joinRoom(ws, `user-${userId}`);
    this.send(ws, {
      type: "connected",
      data: { userId, role },
    });
    ws.on("message", (message) => {
      this.handleMessage(ws, message);
    });
    ws.on("close", () => {
      this.handleDisconnect(ws);
    });
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
  }
  handleMessage(ws, rawMessage) {
    try {
      const message = JSON.parse(rawMessage.toString());
      const { type, data } = message;
      switch (type) {
        case "ping":
          this.send(ws, { type: "pong" });
          break;
        case "join-room":
          if (data.roomId) {
            this.joinRoom(ws, data.roomId);
          }
          break;
        case "leave-room":
          if (data.roomId) {
            this.leaveRoom(ws, data.roomId);
          }
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  }
  handleDisconnect(ws) {
    const meta = this.connectionMeta.get(ws);
    if (meta) {
      console.log(`WebSocket disconnected: userId=${meta.userId}`);
      const userConns = this.userConnections.get(meta.userId);
      if (userConns) {
        userConns.delete(ws);
        if (userConns.size === 0) {
          this.userConnections.delete(meta.userId);
        }
      }
      this.rooms.forEach((connections, roomId) => {
        connections.delete(ws);
        if (connections.size === 0) {
          this.rooms.delete(roomId);
        }
      });
    }
  }
  joinRoom(ws, roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(ws);
    const meta = this.connectionMeta.get(ws);
    console.log(`User ${meta?.userId} joined room: ${roomId}`);
  }
  leaveRoom(ws, roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }
  send(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
  sendToUser(userId, message) {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.forEach((ws) => {
        this.send(ws, message);
      });
    }
  }
  sendToRoom(roomId, message) {
    const connections = this.rooms.get(roomId);
    if (connections) {
      connections.forEach((ws) => {
        this.send(ws, message);
      });
    }
  }
  broadcast(message) {
    this.wss.clients.forEach((ws) => {
      this.send(ws, message);
    });
  }
  notifyNewOrder(order) {
    const message = {
      type: "new-order",
      data: order,
    };
    this.sendToRoom("admin-orders", message);
    if (order.city_id) {
      this.sendToRoom(`city-${order.city_id}-orders`, message);
    }
    if (order.branch_id) {
      this.sendToRoom(`branch-${order.branch_id}-orders`, message);
    }
    if (order.user_id) {
      this.sendToUser(order.user_id, {
        type: "order-created",
        data: order,
      });
    }
  }
  notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus, branchId = null) {
    const message = {
      type: "order-status-updated",
      data: {
        orderId,
        newStatus,
        oldStatus,
        branchId,
        timestamp: new Date().toISOString(),
      },
    };
    if (userId) {
      this.sendToUser(userId, message);
    }
    this.sendToRoom("admin-orders", message);
    if (branchId) {
      this.sendToRoom(`branch-${branchId}-orders`, message);
    }
  }
  notifyBonusUpdate(userId, bonusBalance, operation) {
    const message = {
      type: "bonus-updated",
      data: {
        balance: bonusBalance,
        operation,
        timestamp: new Date().toISOString(),
      },
    };
    this.sendToUser(userId, message);
  }
  notifyBroadcastStatsUpdate(campaignId, stats) {
    const message = {
      type: "broadcast:stats:update",
      data: {
        campaignId,
        stats,
        timestamp: new Date().toISOString(),
      },
    };
    this.sendToRoom("admin-broadcasts", message);
  }
  notifyBroadcastStatusChange(campaignId, status, extra = {}) {
    const message = {
      type: "broadcast:status:change",
      data: {
        campaignId,
        status,
        ...extra,
        timestamp: new Date().toISOString(),
      },
    };
    this.sendToRoom("admin-broadcasts", message);
  }
  notifyBroadcastCompleted(campaignId, summary = {}) {
    const message = {
      type: "broadcast:completed",
      data: {
        campaignId,
        summary,
        timestamp: new Date().toISOString(),
      },
    };
    this.sendToRoom("admin-broadcasts", message);
  }
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.clients.forEach((ws) => {
      ws.close();
    });
    this.wss.close();
  }
}
export default WSServer;
