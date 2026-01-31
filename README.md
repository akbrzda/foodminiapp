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
- **Маркетинговые рассылки**: сегментация аудитории, кампании, очередь, клики и конверсии.

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
- `cities.timezone`, `users.timezone` — IANA‑таймзоны для корректных рассылок и расчёта смены.
- `menu_categories`, `menu_items`, `item_variants`, `modifier_groups`, `modifiers`, `menu_modifiers` — меню.
- `orders`, `order_items`, `order_item_modifiers` — заказы.
- `loyalty_*` — система лояльности.
- `admin_users`, `admin_user_cities`, `admin_user_branches`, `admin_action_logs` — админ‑панель и аудит.
- `broadcast_*` — модуль рассылок: сегменты, кампании, сообщения, очередь, клики, конверсии, статистика, лог триггеров.

### Основные эндпоинты рассылок

- `GET /api/broadcasts` — список кампаний.
- `POST /api/broadcasts` — создание кампании.
- `POST /api/broadcasts/:id/send` — запуск отправки.
- `POST /api/broadcasts/:id/preview` — предпросмотр для пользователя.
- `POST /api/broadcasts/:id/test` — тестовая отправка.
- `GET /api/broadcasts/:id/stats` — статистика кампании.
- `GET /api/broadcasts/dashboard` — дашборд аналитики.
- `GET /api/broadcasts/segments` — сегменты.
- `POST /api/broadcasts/telegram/callback` — обработка callback_query от Telegram (клики по кнопкам).

### WebSocket события рассылок

События отправляются в комнату `admin-broadcasts`:

- `broadcast:stats:update` — обновление метрик рассылки.
- `broadcast:status:change` — изменение статуса рассылки.
- `broadcast:completed` — завершение рассылки.

### Конфигурация рассылок

Переменные окружения backend (`backend/.env`):

- `BROADCAST_WORKER_ENABLED` — включить воркер рассылок.
- `BROADCAST_WORKER_BATCH_SIZE` — размер батча очереди.
- `BROADCAST_WORKER_INTERVAL_MS` — интервал обработки.
- `BROADCAST_RATE_LIMIT` — лимит Telegram (сообщений/сек).
- `BROADCAST_RETRY_MAX` — количество повторов.
- `BROADCAST_RETRY_DELAYS` — задержки повторов, в секундах.
- `BROADCAST_CONVERSION_WINDOW_DAYS` — окно конверсии, дней.
- `BROADCAST_IMAGE_MAX_SIZE_MB` — лимит изображения, МБ.
- `BROADCAST_WS_STATS_EVERY` — частота WS обновлений по отправке.
- `BROADCAST_WS_STATS_FAIL_EVERY` — частота WS обновлений по ошибкам.

### Развертывание рассылок

- Примените миграцию `backend/database/migrations/20260131_add_broadcast_module.sql` или `npm run migrate`.
- Убедитесь, что `backend/database/schema.sql` синхронизирован со схемой.
- Настройте `TELEGRAM_BOT_TOKEN` и webhook Telegram на путь `/api/broadcasts/telegram/callback`, если используются callback-кнопки.
- Запускайте воркеры вместе с API (`npm run start`) либо отдельным процессом (`npm run worker`).

### Проверка рассылок

- Создайте рассылку с сегментом и отправьте тест на свой Telegram ID.
- Проверьте обработку плейсхолдеров через предпросмотр.
- Запустите отправку и убедитесь, что статус меняется на `sending`/`completed`.
- Нажмите callback-кнопку и проверьте рост кликов.

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
- `GET /api/orders/admin/shift` — заказы текущей смены по филиалу.
- `PUT /api/orders/admin/:id/cancel` — отмена заказа по административной логике.

## Админ‑панель

- Управление меню, заказами, клиентами, городами и филиалами.
- Контроль лояльности: уровни, включение модуля, исключения, аудит.
- Логи админских действий и системные события.
- Стоп‑лист по филиалам с выбором типа (товар/продукция), способов получения и опциональным автоснятием по времени.
- Темная тема с переключателем в верхней панели, состояние сохраняется локально.
- Страница «Текущая смена»: полноэкранный режим без сайдбара, карта + список заказов смены, быстрые статусы, фильтрация и поиск.

## Telegram Mini App

- Просмотр меню, корзина, оформление заказа.
- Бонусы и уровни: баланс, прогресс, история транзакций, истечение.
- История заказов и повтор заказа.

## Документация

- `docs/bonus.md` — основная спецификация лояльности.
- `docs/doc.md` — общее ТЗ проекта (ссылается на `bonus.md`).
- `docs/menu.md` — спецификация меню.
- `docs/roadmap.md` — план развития.
