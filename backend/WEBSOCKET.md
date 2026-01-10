# WebSocket Server Documentation

## Подключение

WebSocket сервер работает на том же порту, что и HTTP сервер (по умолчанию 3000).

### Аутентификация

Для подключения к WebSocket необходимо передать JWT токен в query параметре:

```javascript
const token = "your-jwt-token";
const ws = new WebSocket(`ws://localhost:3000?token=${token}`);
```

## События от сервера

### 1. connected

Отправляется сразу после успешного подключения.

```json
{
  "type": "connected",
  "data": {
    "userId": 123,
    "role": "admin"
  }
}
```

### 2. new-order

Новый заказ создан. Отправляется админам/CEO и менеджерам города.

```json
{
  "type": "new-order",
  "data": {
    "id": 456,
    "order_number": "1234",
    "user_id": 123,
    "city_id": 1,
    "status": "pending",
    "total": 1500,
    "bonuses_earned": 75,
    ...
  }
}
```

### 3. order-created

Заказ создан. Отправляется пользователю-создателю.

```json
{
  "type": "order-created",
  "data": {
    "id": 456,
    "order_number": "1234",
    ...
  }
}
```

### 4. order-status-updated

Статус заказа изменен.

```json
{
  "type": "order-status-updated",
  "data": {
    "orderId": 456,
    "newStatus": "preparing",
    "oldStatus": "confirmed",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 5. bonus-updated

Баланс бонусов изменен.

```json
{
  "type": "bonus-updated",
  "data": {
    "balance": 150.5,
    "operation": {
      "type": "earned", // или "used"
      "amount": 75,
      "orderId": 456
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 6. sync-success

Успешная синхронизация с Гуляшем.

```json
{
  "type": "sync-success",
  "data": {
    "entity": "order",
    "entityId": 456,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 7. sync-error

Ошибка синхронизации с Гуляшем.

```json
{
  "type": "sync-error",
  "data": {
    "entity": "order",
    "entityId": 456,
    "error": "Connection timeout",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## События от клиента

### 1. ping

Проверка соединения.

```json
{
  "type": "ping"
}
```

Ответ сервера:

```json
{
  "type": "pong"
}
```

### 2. join-room

Присоединение к комнате (опционально, происходит автоматически при подключении).

```json
{
  "type": "join-room",
  "data": {
    "roomId": "admin-orders"
  }
}
```

### 3. leave-room

Выход из комнаты.

```json
{
  "type": "leave-room",
  "data": {
    "roomId": "admin-orders"
  }
}
```

## Комнаты

### Автоматическое распределение

При подключении клиент автоматически добавляется в комнаты в зависимости от роли:

- **admin/ceo**: `admin-orders` - все заказы
- **manager**: `city-{cityId}-orders` - заказы конкретных городов
- **Все пользователи**: `user-{userId}` - личные уведомления

### Ручное управление

Клиент может вручную присоединяться/выходить из комнат с помощью событий `join-room` и `leave-room`.

## Keepalive

Сервер отправляет ping каждые 30 секунд. Если клиент не отвечает pong, соединение разрывается.

## Примеры использования

### Telegram Mini App

```javascript
// Подключение
const token = localStorage.getItem("jwt_token");
const ws = new WebSocket(`ws://localhost:3000?token=${token}`);

ws.onopen = () => {
  console.log("WebSocket connected");
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "order-status-updated":
      // Обновить UI статуса заказа
      updateOrderStatus(message.data.orderId, message.data.newStatus);
      break;

    case "bonus-updated":
      // Обновить баланс бонусов
      updateBonusBalance(message.data.balance);
      break;
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  console.log("WebSocket disconnected");
  // Попытка переподключения через 5 секунд
  setTimeout(() => reconnect(), 5000);
};
```

### Admin Panel

```javascript
// Подключение
const token = localStorage.getItem("admin_token");
const ws = new WebSocket(`ws://localhost:3000?token=${token}`);

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "new-order":
      // Показать уведомление о новом заказе
      showNotification("Новый заказ", message.data);
      // Обновить список заказов
      refreshOrdersList();
      break;

    case "sync-error":
      // Показать предупреждение об ошибке синхронизации
      showAlert(`Ошибка синхронизации ${message.data.entity} #${message.data.entityId}`);
      break;
  }
};
```

## Тестирование

### wscat (CLI)

```bash
npm install -g wscat

# Подключение
wscat -c "ws://localhost:3000?token=YOUR_JWT_TOKEN"

# Отправка ping
> {"type":"ping"}
< {"type":"pong"}
```

### Postman

1. New Request → WebSocket Request
2. URL: `ws://localhost:3000?token=YOUR_JWT_TOKEN`
3. Connect
4. Send messages: `{"type":"ping"}`
