# Унифицированная обработка ошибок

## Описание

В проекте реализована централизованная обработка ошибок через middleware `errorHandler`. Все контроллеры должны использовать функцию `next(error)` вместо прямого вызова `res.status().json()`.

## Утилиты для создания ошибок

Файл: `/backend/src/utils/errors.js`

```javascript
import { badRequest, notFound, forbidden, conflict } from "../utils/errors.js";

// Создание ошибки 400 Bad Request
throw badRequest("Некорректные данные");

// Создание ошибки 404 Not Found
throw notFound("Товар не найден");

// Создание ошибки 403 Forbidden
throw forbidden("Доступ запрещен");

// Создание ошибки 409 Conflict
throw conflict("Ресурс уже существует");
```

## Доступные функции

- `badRequest(message)` - 400 Bad Request
- `unauthorized(message)` - 401 Unauthorized
- `forbidden(message)` - 403 Forbidden
- `notFound(message)` - 404 Not Found
- `conflict(message)` - 409 Conflict
- `unprocessableEntity(message)` - 422 Unprocessable Entity
- `internalError(message)` - 500 Internal Server Error
- `createError(status, message)` - Кастомный статус

## Примеры использования

### ❌ Неправильно (старый способ)

```javascript
export const getItem = async (req, res, next) => {
  try {
    const [items] = await db.query("SELECT * FROM items WHERE id = ?", [req.params.id]);

    if (items.length === 0) {
      return res.status(404).json({ error: "Item not found" }); // ❌
    }

    res.json(items[0]);
  } catch (error) {
    next(error);
  }
};
```

### ✅ Правильно (новый способ)

```javascript
import { notFound, badRequest } from "../utils/errors.js";

export const getItem = async (req, res, next) => {
  try {
    const [items] = await db.query("SELECT * FROM items WHERE id = ?", [req.params.id]);

    if (items.length === 0) {
      throw notFound("Item not found"); // ✅
    }

    res.json(items[0]);
  } catch (error) {
    next(error); // ErrorHandler обработает
  }
};
```

### Валидация данных

```javascript
import { badRequest } from "../utils/errors.js";

export const createItem = async (req, res, next) => {
  try {
    const { name, price } = req.body;

    if (!name) {
      throw badRequest("Name is required");
    }

    if (!price || price <= 0) {
      throw badRequest("Price must be greater than 0");
    }

    // Создание товара...
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
};
```

### Проверка прав доступа

```javascript
import { forbidden } from "../utils/errors.js";

export const updateOrder = async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);

    if (order.user_id !== req.user.id) {
      throw forbidden("You do not have access to this order");
    }

    // Обновление заказа...
    res.json({ order });
  } catch (error) {
    next(error);
  }
};
```

## ErrorHandler Middleware

Файл: `/backend/src/middleware/errorHandler.js`

Автоматически обрабатывает все ошибки:

1. Логирует ошибку через logger
2. Определяет HTTP статус (по error.status или 500)
3. Скрывает технические детали в production
4. Возвращает JSON с ошибкой клиенту

### Формат ответа

```json
{
  "error": "Resource not found",
  "message": "Item not found",
  "stack": "..." // только в development
}
```

## Преимущества

✅ **Единый стиль кода** - все контроллеры используют одинаковый подход  
✅ **Централизованное логирование** - все ошибки логируются в одном месте  
✅ **Безопасность** - скрывает технические детали в production  
✅ **Удобство** - не нужно дублировать код `res.status().json()`  
✅ **Поддержка** - проще добавить новые типы ошибок

## Миграция существующего кода

### Шаг 1: Добавить импорт

```javascript
import { badRequest, notFound, forbidden } from "../utils/errors.js";
```

### Шаг 2: Заменить return res.status() на throw

```javascript
// Было:
if (!item) {
  return res.status(404).json({ error: "Not found" });
}

// Стало:
if (!item) {
  throw notFound("Not found");
}
```

### Шаг 3: Убедиться что есть try-catch и next(error)

```javascript
export const controller = async (req, res, next) => {
  try {
    // Логика контроллера
  } catch (error) {
    next(error); // ✅ Обязательно!
  }
};
```

## Статус задачи

- ✅ Создана утилита `/utils/errors.js`
- ✅ Обновлен errorHandler для использования logger
- ✅ Обновлены контроллеры orders (примеры)
- ⏳ Нужно обновить остальные контроллеры menu, users, loyalty, etc.

## TODO

- [ ] Обновить все контроллеры на использование errors.js
- [ ] Добавить JSDoc комментарии к утилитам
- [ ] Добавить тесты для errorHandler
- [ ] Создать middleware для валидации (yup/zod)
