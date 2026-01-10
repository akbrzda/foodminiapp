# Интеграция с API Гуляш

## Текущее состояние

Система работает в **MOCK режиме** (заглушка). Все заказы, клиенты и бонусные операции сохраняются локально в базе данных, синхронизация с внешним API имитируется.

### Преимущества mock режима:
- ✅ Система полностью работоспособна без внешних зависимостей
- ✅ Можно тестировать и разрабатывать frontend
- ✅ Все данные сохраняются локально
- ✅ Нет риска случайно повлиять на реальные данные в продакшене
- ✅ Быстрая разработка без ожидания API

### Что происходит в mock режиме:

1. **Заказы**: Создаются с mock ID (`MOCK-1234567890`), статус синхронизации = `synced`
2. **Клиенты**: Синхронизация возвращает mock ID (`MOCK-CLIENT-1234567890`)
3. **Бонусы**: Транзакции получают mock ID (`MOCK-BONUS-1234567890`)
4. **Меню и полигоны**: Работают из локальной БД
5. **Очередь синхронизации**: Задания обрабатываются успешно с имитацией сетевой задержки

---

## Переход на реальный API

Когда у вас будет готов реальный API Гуляш, выполните следующие шаги:

### Шаг 1: Получите данные для подключения

От поставщика API Гуляш вам потребуется:
- **Base URL**: адрес API (например, `https://api.gulyash.ru`)
- **API Key**: ключ авторизации
- **Документация**: описание endpoints и формата данных

### Шаг 2: Проверьте соответствие структуры данных

Наша текущая реализация предполагает следующие endpoints:

```
POST   /orders                        - создание заказа
PUT    /orders/:id/status             - обновление статуса
GET    /orders/:id                    - получение заказа

POST   /clients                       - создание клиента
PUT    /clients/:id                   - обновление клиента
GET    /clients/:id/bonuses           - баланс бонусов

POST   /bonuses/transactions          - бонусная транзакция

GET    /cities/:id/menu               - меню города
GET    /branches/:id/polygons         - полигоны доставки

GET    /health                        - проверка доступности
```

Если структура API отличается, нужно будет адаптировать методы в файле `src/services/gulyash.js`.

### Шаг 3: Настройте переменные окружения

В файле `.env` установите:

```env
# Включаем реальный режим
GULYASH_MODE=real

# URL и ключ от реального API
GULYASH_API_URL=https://api.gulyash.ru
GULYASH_API_KEY=your_real_api_key_here
```

### Шаг 4: Протестируйте подключение

Выполните проверку доступности API:

```bash
# Через API
curl http://localhost:3000/api/sync/gulyash/health

# Ответ должен быть:
{
  "available": true,
  "mode": "real"
}
```

Если API недоступен, вы увидите:

```json
{
  "available": false,
  "mode": "real",
  "error": "connect ECONNREFUSED..."
}
```

### Шаг 5: Адаптируйте структуру данных (если нужно)

Если формат данных API Гуляш отличается от текущего, откройте файл `src/services/gulyash.js` и адаптируйте методы:

**Пример**: Если API требует другие имена полей

```javascript
// Было:
async createOrder(orderData) {
  const response = await this.client.post("/orders", {
    order_number: orderData.order_number,
    client: {
      phone: orderData.client_phone,
      ...
    }
  });
  ...
}

// Стало (если API требует другие поля):
async createOrder(orderData) {
  const response = await this.client.post("/orders", {
    orderNum: orderData.order_number,  // другое название
    customer: {                        // другое название
      phoneNumber: orderData.client_phone,
      ...
    }
  });
  ...
}
```

### Шаг 6: Протестируйте синхронизацию

1. Создайте тестовый заказ через API
2. Проверьте очередь синхронизации:

```bash
curl http://localhost:3000/api/sync/queue/status
```

3. Если возникают ошибки, посмотрите лог:

```bash
curl http://localhost:3000/api/sync/errors
```

4. Для повторной отправки неуспешных заказов:

```bash
curl -X POST http://localhost:3000/api/sync/retry-failed
```

---

## Постепенная миграция

Если у вас уже есть данные в mock режиме, и вы хотите перейти на реальный API:

### Вариант 1: Плавный переход

1. Оставьте `GULYASH_MODE=mock` для существующих заказов
2. Включите `GULYASH_MODE=real` только для новых заказов
3. Вручную перенесите критичные данные через админ-панель

### Вариант 2: Полная миграция

1. Экспортируйте данные из БД:
   ```sql
   SELECT * FROM orders WHERE gulyash_order_id LIKE 'MOCK-%';
   ```

2. Включите `GULYASH_MODE=real`

3. Используйте API повторной синхронизации:
   ```bash
   curl -X POST http://localhost:3000/api/sync/sync-now \
     -H "Content-Type: application/json" \
     -d '{"entity": "order", "entityId": 123}'
   ```

---

## Мониторинг синхронизации

### Проверка статуса очереди

```bash
curl http://localhost:3000/api/sync/queue/status
```

Ответ:
```json
{
  "pending": [
    {
      "id": 1,
      "entity_type": "order",
      "entity_id": 123,
      "status": "pending",
      "attempts": 0
    }
  ],
  "failed": [],
  "completed": 15
}
```

### WebSocket уведомления

Подключитесь к WebSocket для real-time мониторинга:

```javascript
const ws = new WebSocket('ws://localhost:3000?token=YOUR_TOKEN');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'sync-error') {
    console.error('Ошибка синхронизации:', msg.data);
  }
  
  if (msg.type === 'sync-success') {
    console.log('Успешная синхронизация:', msg.data);
  }
};
```

---

## Отладка проблем

### Проблема: Все синхронизации падают с ошибкой

**Решение**:
1. Проверьте доступность API: `curl http://localhost:3000/api/sync/gulyash/health`
2. Проверьте правильность `GULYASH_API_KEY`
3. Проверьте логи сервера: `docker logs miniapp-panda-backend`

### Проблема: API возвращает ошибки валидации

**Решение**:
1. Сравните структуру данных в документации API
2. Адаптируйте методы в `src/services/gulyash.js`
3. Проверьте маппинг ID (gulyash_item_id, gulyash_branch_id и т.д.)

### Проблема: Нужно временно отключить синхронизацию

**Решение**:
```env
# Временно вернуться в mock режим
GULYASH_MODE=mock
```

Все новые заказы будут сохраняться локально без попыток синхронизации с реальным API.

---

## FAQ

**Q: Можно ли использовать систему вообще без Гуляша?**
A: Да! В mock режиме система полностью автономна.

**Q: Что произойдет, если API Гуляш временно недоступен?**
A: Заказы сохранятся локально, BullMQ будет пытаться синхронизировать с экспоненциальной задержкой (5 попыток).

**Q: Потеряются ли данные при переключении режимов?**
A: Нет, все данные хранятся в локальной БД независимо от режима.

**Q: Как узнать, в каком режиме работает система?**
A: Проверьте API: `GET /api/sync/gulyash/health` - в ответе будет поле `mode: 'mock'` или `mode: 'real'`.

**Q: Можно ли использовать разные режимы для разных городов?**
A: В текущей реализации нет, режим один для всей системы. Но это можно реализовать при необходимости.

---

## Контакты поддержки

При возникновении проблем с интеграцией:
1. Проверьте логи: `docker logs miniapp-panda-backend`
2. Проверьте очередь ошибок: `GET /api/sync/errors`
3. Обратитесь к документации API Гуляш
