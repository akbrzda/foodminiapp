import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { promisify } from "util";
const jwtVerify = promisify(jwt.verify);
class WSServer {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.userConnections = new Map();
    this.rooms = new Map();
    this.connectionMeta = new WeakMap();
    this.setupWebSocketServer(server);
  }
  setupWebSocketServer(server) {
    server.on("upgrade", async (request, socket, head) => {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const token = url.searchParams.get("token");
        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const decoded = await jwtVerify(token, process.env.JWT_SECRET);
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
    } else if (role === "manager" && city_ids) {
      city_ids.forEach((cityId) => {
        this.joinRoom(ws, `city-${cityId}-orders`);
      });
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
    if (ws.readyState === ws.OPEN) {
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
    if (order.user_id) {
      this.sendToUser(order.user_id, {
        type: "order-created",
        data: order,
      });
    }
  }
  notifyOrderStatusUpdate(orderId, userId, newStatus, oldStatus) {
    const message = {
      type: "order-status-updated",
      data: {
        orderId,
        newStatus,
        oldStatus,
        timestamp: new Date().toISOString(),
      },
    };
    if (userId) {
      this.sendToUser(userId, message);
    }
    this.sendToRoom("admin-orders", message);
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
