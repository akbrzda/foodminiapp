import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { promisify } from "util";

const jwtVerify = promisify(jwt.verify);

/**
 * WebSocket сервер для real-time обновлений
 * Поддерживает аутентификацию через JWT и комнаты для групповых обновлений
 */
class WSServer {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });

    // Map для хранения подключений: userId -> Set<WebSocket>
    this.userConnections = new Map();

    // Map для хранения комнат: roomId -> Set<WebSocket>
    this.rooms = new Map();

    // Map для хранения метаданных подключения: WebSocket -> { userId, roles, cityIds }
    this.connectionMeta = new WeakMap();

    this.setupWebSocketServer(server);
  }

  /**
   * Настройка WebSocket сервера
   */
  setupWebSocketServer(server) {
    // Обработка upgrade запросов
    server.on("upgrade", async (request, socket, head) => {
      try {
        // Извлечение токена из query string
        const url = new URL(request.url, `http://${request.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Верификация токена
        const decoded = await jwtVerify(token, process.env.JWT_SECRET);

        // Upgrade соединения
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request, decoded);
        });
      } catch (error) {
        console.error("WebSocket authentication failed:", error.message);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      }
    });

    // Обработка новых подключений
    this.wss.on("connection", (ws, request, userData) => {
      this.handleConnection(ws, userData);
    });
  }

  /**
   * Обработка нового подключения
   */
  handleConnection(ws, userData) {
    const { userId, role, city_ids } = userData;

    console.log(`WebSocket connected: userId=${userId}, role=${role}`);

    // Сохранение метаданных подключения
    this.connectionMeta.set(ws, {
      userId,
      role,
      cityIds: city_ids || [],
    });

    // Добавление в userConnections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(ws);

    // Автоматическое добавление в комнаты на основе роли
    if (role === "admin" || role === "ceo") {
      // Админы и CEO видят все заказы
      this.joinRoom(ws, "admin-orders");
    } else if (role === "manager" && city_ids) {
      // Менеджеры видят заказы своих городов
      city_ids.forEach((cityId) => {
        this.joinRoom(ws, `city-${cityId}-orders`);
      });
    }

    // Пользовательская комната для личных уведомлений
    this.joinRoom(ws, `user-${userId}`);

    // Отправка приветственного сообщения
    this.send(ws, {
      type: "connected",
      data: { userId, role },
    });

    // Обработка входящих сообщений
    ws.on("message", (message) => {
      this.handleMessage(ws, message);
    });

    // Обработка закрытия соединения
    ws.on("close", () => {
      this.handleDisconnect(ws);
    });

    // Обработка ошибок
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    // Ping-pong для keepalive
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
  }

  /**
   * Обработка входящих сообщений от клиента
   */
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

  /**
   * Обработка отключения
   */
  handleDisconnect(ws) {
    const meta = this.connectionMeta.get(ws);
    if (meta) {
      console.log(`WebSocket disconnected: userId=${meta.userId}`);

      // Удаление из userConnections
      const userConns = this.userConnections.get(meta.userId);
      if (userConns) {
        userConns.delete(ws);
        if (userConns.size === 0) {
          this.userConnections.delete(meta.userId);
        }
      }

      // Удаление из всех комнат
      this.rooms.forEach((connections, roomId) => {
        connections.delete(ws);
        if (connections.size === 0) {
          this.rooms.delete(roomId);
        }
      });
    }
  }

  /**
   * Добавление подключения в комнату
   */
  joinRoom(ws, roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(ws);

    const meta = this.connectionMeta.get(ws);
    console.log(`User ${meta?.userId} joined room: ${roomId}`);
  }

  /**
   * Удаление подключения из комнаты
   */
  leaveRoom(ws, roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  /**
   * Отправка сообщения одному клиенту
   */
  send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Отправка сообщения конкретному пользователю (всем его подключениям)
   */
  sendToUser(userId, message) {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.forEach((ws) => {
        this.send(ws, message);
      });
    }
  }

  /**
   * Отправка сообщения в комнату
   */
  sendToRoom(roomId, message) {
    const connections = this.rooms.get(roomId);
    if (connections) {
      connections.forEach((ws) => {
        this.send(ws, message);
      });
    }
  }

  /**
   * Broadcast сообщения всем подключенным клиентам
   */
  broadcast(message) {
    this.wss.clients.forEach((ws) => {
      this.send(ws, message);
    });
  }

  /**
   * Отправка уведомления о новом заказе
   * Отправляется в комнату admin-orders (админы/CEO) или city-{cityId}-orders (менеджеры)
   */
  notifyNewOrder(order) {
    const message = {
      type: "new-order",
      data: order,
    };

    // Отправка админам и CEO
    this.sendToRoom("admin-orders", message);

    // Отправка менеджерам города
    if (order.city_id) {
      this.sendToRoom(`city-${order.city_id}-orders`, message);
    }

    // Отправка пользователю-создателю
    if (order.user_id) {
      this.sendToUser(order.user_id, {
        type: "order-created",
        data: order,
      });
    }
  }

  /**
   * Отправка обновления статуса заказа
   */
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

    // Отправка пользователю
    if (userId) {
      this.sendToUser(userId, message);
    }

    // Отправка в админ-панель
    this.sendToRoom("admin-orders", message);
  }

  /**
   * Отправка обновления баланса бонусов
   */
  notifyBonusUpdate(userId, bonusBalance, operation) {
    const message = {
      type: "bonus-updated",
      data: {
        balance: bonusBalance,
        operation, // { type: 'earned'|'used', amount, orderId }
        timestamp: new Date().toISOString(),
      },
    };

    this.sendToUser(userId, message);
  }

  /**
   * Отправка уведомления об ошибке синхронизации
   */
  notifySyncError(entity, entityId, errorMessage, cityId) {
    const message = {
      type: "sync-error",
      data: {
        entity,
        entityId,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    };

    // Отправка в админ-панель
    this.sendToRoom("admin-orders", message);

    // Отправка менеджерам города, если указан
    if (cityId) {
      this.sendToRoom(`city-${cityId}-orders`, message);
    }
  }

  /**
   * Отправка уведомления об успешной синхронизации
   */
  notifySyncSuccess(entity, entityId, cityId) {
    const message = {
      type: "sync-success",
      data: {
        entity,
        entityId,
        timestamp: new Date().toISOString(),
      },
    };

    // Отправка в админ-панель
    this.sendToRoom("admin-orders", message);

    // Отправка менеджерам города, если указан
    if (cityId) {
      this.sendToRoom(`city-${cityId}-orders`, message);
    }
  }

  /**
   * Запуск периодического ping для keepalive
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Остановка сервера
   */
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
