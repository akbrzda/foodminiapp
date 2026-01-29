# FoodMiniApp

## Описание

FoodMiniApp — система онлайн‑заказа еды с Telegram Mini App, админ‑панелью и backend API. Проект включает управление меню, заказами, доставкой, клиентами и многоуровневой программой лояльности.

## Архитектура

- **Backend**: Node.js (Express), MySQL, Redis, WebSocket.
- **Admin panel**: Vue 3 + Vite + Tailwind CSS.
- **Telegram miniapp**: Vue 3 + Vite.
- **Фоновые задачи**: отдельные воркеры для бонусов, уровней, аудита, уведомлений.

## Структура репозитория

- `backend/` — API, бизнес‑логика, воркеры, схемы БД.
- `admin-panel/` — админ‑панель.
- `telegram-miniapp/` — клиентское приложение.
- `docs/` — техническая документация.

## Основные модули

- **Авторизация и пользователи**: Telegram‑авторизация, профиль, адреса, состояния пользователя.
- **Меню**: категории, позиции, варианты, модификаторы, стоп‑лист.
- **Заказы**: создание, статусы, повтор заказа, история.
- **Доставка**: города, филиалы, полигоны доставки, геокодирование.
- **Лояльность**: уровни, начисления, списания, аудит.
- **Настройки системы**: глобальные флаги и включение модуля лояльности.
- **Логи и аудит**: логи админских действий, проверки целостности.
- **Уведомления**: WebSocket‑события и Telegram‑уведомления.

## Запуск

### Требования

- Node.js 18+
- MySQL 8+
- Redis

### Быстрый старт

- `docker-compose.yml` — окружение для сервисов.
- `backend/database/schema.sql` — актуальная схема БД для чистого развёртывания.

### Скрипты

**Backend** (`backend/package.json`):

- `npm run dev` — запуск API в режиме разработки.
- `npm run start` — запуск API.
- `npm run worker` — запуск фоновых воркеров.
- `npm run init-db` — инициализация базы по `schema.sql`.

**Admin panel** (`admin-panel/package.json`):

- `npm run dev` — локальная разработка.
- `npm run build` — сборка.

**Telegram miniapp** (`telegram-miniapp/package.json`):

- `npm run dev` — локальная разработка.
- `npm run build` — сборка.

## База данных

Источник истины для чистого проекта — `backend/database/schema.sql`.
Дампы `schemas/local.sql` и `schemas/vps.sql` синхронизированы по структуре с этой схемой и используются как снимки окружений.

### Ключевые таблицы

- `users`, `user_states`, `delivery_addresses` — пользователи и их данные.
- `cities`, `branches`, `delivery_polygons` — доставка.
- `menu_categories`, `menu_items`, `item_variants`, `modifier_groups`, `modifiers`, `menu_modifiers` — меню.
- `orders`, `order_items`, `order_item_modifiers` — заказы.
- `loyalty_*` — система лояльности.
- `admin_users`, `admin_user_cities`, `admin_user_branches`, `admin_action_logs` — админ‑панель и аудит.

## Лояльность

Система лояльности реализуется по `docs/bonus.md` и использует 3 фиксированных уровня (Бронза, Серебро, Золото).

### Ключевые правила

- Проценты начисления: 3% / 5% / 7%, максимум списания: 25%.
- Списание происходит при создании заказа, начисление — при первом `completed`.
- Начисленная сумма фиксируется в `orders.bonus_earn_amount`.
- Бонусы списываются по FIFO, округление всегда вниз.
- Истечение бонусов и ДР‑начисления выполняются по расписанию.

### Таблицы лояльности

- `loyalty_levels`, `loyalty_transactions`, `loyalty_logs`.
- `user_loyalty_levels`.

### Ключевые поля

- `users.loyalty_balance`, `users.current_loyalty_level_id`, `users.loyalty_joined_at`.
- `orders.bonus_spent`, `orders.bonus_earn_amount`, `orders.bonus_earn_locked`.
- `loyalty_transactions.remaining_amount` для FIFO‑списания.

### Основные API‑эндпоинты

**Публичные и пользовательские**

- `GET /api/client/loyalty/balance` — баланс, уровень, прогресс и истекающие бонусы.
- `GET /api/client/loyalty/calculate-max-spend` — расчет максимального списания.
- `GET /api/client/loyalty/history` — история транзакций.
- `GET /api/client/loyalty/levels` — уровни и прогресс.

**Административные**

- `GET /api/admin/loyalty/status` — статус модуля.
- `PUT /api/admin/loyalty/toggle` — включение/выключение.
- `POST /api/admin/loyalty/adjust` — корректировка баланса.
- `GET /api/admin/loyalty/users/:id/loyalty` — детали по бонусам пользователя.
- `PUT /api/menu/admin/variants/:variantId/prices` — полная замена цен вариации по городам и способам получения.
- `GET /api/orders/admin/count` — количество заказов с фильтрами (например, `status=pending`).

## Админ‑панель

- Управление меню, заказами, клиентами, городами и филиалами.
- Контроль лояльности: уровни, включение модуля, исключения, аудит.
- Логи админских действий и системные события.
- Стоп‑лист по филиалам с выбором типа (товар/продукция), способов получения и опциональным автоснятием по времени.
- Темная тема с переключателем в верхней панели, состояние сохраняется локально.

## Telegram Mini App

- Просмотр меню, корзина, оформление заказа.
- Бонусы и уровни: баланс, прогресс, история транзакций, истечение.
- История заказов и повтор заказа.

## Документация

- `docs/bonus.md` — основная спецификация лояльности.
- `docs/doc.md` — общее ТЗ проекта (ссылается на `bonus.md`).
- `docs/menu.md` — спецификация меню.
- `docs/roadmap.md` — план развития.
