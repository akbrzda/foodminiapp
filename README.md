# FoodMiniApp

## Описание

FoodMiniApp — система онлайн‑заказа еды с Telegram Mini App, админ‑панелью и backend API. Проект включает управление меню, заказами, доставкой, клиентами и многоуровневой программой лояльности.

## Архитектура

- **Backend**: Node.js (Express), MySQL, Redis, WebSocket.
- **Admin panel**: Vue 3 + Vite + Tailwind CSS.
- **Telegram miniapp**: Vue 3 + Vite.
- **Фоновые задачи**: отдельные воркеры для бонусов, уровней, аудита, уведомлений.
- **Модульный монолит**: домены выделяются в `backend/src/modules/*` с публичным API.
- **Frontend modules**: `admin-panel/src/modules/*` и `telegram-miniapp/src/modules/*` с общими ресурсами в `shared/`.

## Структура репозитория

- `backend/` — API, бизнес‑логика, воркеры, схемы БД.
- `admin-panel/` — админ‑панель.
- `telegram-miniapp/` — клиентское приложение.
- `docs/` — техническая документация.
  - `admin-panel/src/modules` — фичи админ‑панели.
  - `admin-panel/src/shared` — общий UI/сервисы/сторы.
  - `telegram-miniapp/src/modules` — фичи мини‑приложения.
  - `telegram-miniapp/src/shared` — общий UI/сервисы/утилиты.
  - `backend/src/modules` — доменные модули бэкенда (routes/services/repositories).

## Основные модули

- **Авторизация и пользователи**: Telegram‑авторизация, профиль, адреса, состояния пользователя.
- **Меню**: категории, позиции, варианты, модификаторы, стоп‑лист.
- **Заказы**: создание, статусы, повтор заказа, история. Номер заказа — циклический счетчик 0001–9999 общий по системе.
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

Схема для деплоя чистого проекта — `backend/database/schema.sql`.

### Ключевые таблицы

- `users`, `user_states`, `delivery_addresses` — пользователи и их данные.
- `cities`, `branches`, `delivery_polygons`, `delivery_tariffs` — доставка и тарифные ступени.
- `cities.timezone`, `users.timezone` — IANA‑таймзоны для корректных рассылок и расчёта смены.
- `menu_categories`, `menu_items`, `item_variants`, `modifier_groups`, `modifiers`, `menu_modifiers` — меню.
- `orders`, `order_items`, `order_item_modifiers`, `order_status_history` — заказы и история статусов.
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

### Модуль Loyalty (backend)

- Код модуля: `backend/src/modules/loyalty`.
- Публичный API модуля (используется бэкендом и воркерами): начисление/списание, уровни, расчеты, корректировки.
- Роутинг клиента и админа подключен через модульные `routes.js`.

## Доставка и тарифы

Система доставки использует ступенчатые тарифы по сумме заказа. Поле `delivery_polygons.delivery_cost` и `delivery_polygons.min_order_amount` сохраняются для совместимости, но в расчётах не используются (минимум фиксирован как 0 ₽).

### API тарифов доставки

**Публичные**

- `POST /api/polygons/check-delivery` — проверка доставки по координатам, возвращает полигон и тарифы; принимает опциональный `cart_amount` для расчёта текущей стоимости.

**Административные**

- `GET /api/polygons/admin/:id/tariffs` — получить тарифные ступени полигона.
- `PUT /api/polygons/admin/:id/tariffs` — полная замена тарифных ступеней с валидацией диапазонов.
- `POST /api/polygons/admin/:id/tariffs/copy` — копирование тарифов из другого полигона того же филиала.

## Админ‑панель

- Управление меню, заказами, клиентами, городами и филиалами.
- Контроль лояльности: уровни, включение модуля, исключения, аудит.
- Логи админских действий и системные события.
- Стоп‑лист по филиалам с выбором типа (товар/продукция), способов получения и опциональным автоснятием по времени.
- Темная тема с переключателем в верхней панели, состояние сохраняется локально.
- Доступность блюд по городам сохраняется через `is_active`, цены редактируются по выбранному городу и каналам.
- Цены модификаторов настраиваются по городам, без привязки к вариациям и каналам.
- График работы в форме филиала сортируется по дням недели.
- Страница «Текущая смена»: полноэкранный режим без сайдбара, карта + список заказов смены, быстрые статусы, фильтрация и поиск.
- Все выпадающие списки Select приведены к новому компоненту Shadcn UI (Trigger/Content/Item).
- Хлебные крошки теперь используют компоненты shadcn UI и подключены через общий компонент.
- Для страниц деталей (заказ, клиент, позиция меню) сохранена иерархия хлебных крошек.
- Модальные окна переведены на Dialog shadcn UI без BaseModal.
- Диалоги поддерживают прокрутку, если контент выше экрана.
- Сайдбар обновлен: новые секции навигации, компактное сворачивание и триггер в верхней панели.
- В карточке заказа отображается история смены статусов.
- В карточке заказа время показывается по таймзоне города заказа (`cities.timezone`).

## Telegram Mini App

- Просмотр меню, корзина, оформление заказа.
- Бонусы и уровни: баланс, прогресс, история транзакций, истечение.
- История заказов и повтор заказа.
- Контакты: филиалы города, телефоны, график и зоны доставки с раскрывающимися блоками.
- Контакты: неуказанные дни графика отображаются как выходные.

## Документация

- `docs/doc.md` — общее ТЗ проекта
- `docs/design_system.md` — спецификация дизайн‑системы.
- `docs/bonus.md` — спецификация модуля лояльности.
- `docs/menu.md` — спецификация модуля управления меню.
- `docs/delivery_zone.md` — спецификация модуля зон доставок.
- `docs/newsletter.md` — спецификация модуля рассылок.
- `docs/shift_page.md` — спецификация страницы текущей смены.
- `docs/roadmap.md` — план развития.
