# ТЗ: трансформация FoodMiniApp в SaaS (platform_core + database-per-tenant)

## 1. Цель документа

Зафиксировать реалистичный план перевода текущего FoodMiniApp (single-tenant) в SaaS-платформу с:

- отдельной `platform_core` БД;
- отдельной БД на каждого клиента (`tenant_<slug>_db`);
- подписочной моделью (trial, биллинг, лимиты, dunning);
- разделением ролей platform-level и tenant-level.

Документ обновлен под сценарий **database-per-tenant**.

---

## 2. Текущее состояние проекта (As-Is)

### 2.1 Что уже есть

- Монорепо: `backend`, `admin-panel`, `telegram-miniapp`, `bot`.
- Рабочие домены: заказы, меню, доставка, лояльность, рассылки, stories, интеграции.
- Базовые quality gates и deploy через GitHub Actions.

### 2.2 Что подтверждает single-tenant модель

1. **Нет tenant-сущностей в схеме БД** (`tenants`, `subscriptions`, `messenger_configs`, `tenant_usage_stats` отсутствуют).
2. **Глобальные unique-ключи** (`users.phone`, `users.telegram_id`, `admin_users.email`, `subscription_campaigns.tag`).
3. **Глобальный слой настроек** через `system_settings` и единый Redis-cache key `settings`.
4. **Auth/JWT без tenant-контекста** (`tenant_id`, `tenant_role` отсутствуют).
5. **Bot и MiniApp опираются на глобальные env-токены** (`TELEGRAM_BOT_TOKEN`, `MAX_BOT_TOKEN`).
6. **CORS/WS/deploy привязаны к текущим доменам** `*.panda.akbrzda.ru`.
7. **Очереди и Redis-ключи не tenant-namespaced** как системное правило.
8. **Нет тестов на cross-tenant изоляцию**.

### 2.3 Технический вывод

Проект зрелый функционально, но архитектурно не готов к безопасной мультиарендности. Для SaaS требуется выделенный platform-layer и изоляция tenant-данных на уровне отдельных БД.

---

## 3. Архитектурное решение (To-Be)

## 3.1 Модель хранения

Принятое решение:

- **`platform_core`**: метаданные платформы, клиенты, тарифы, подписки, транзакции, конфиги мессенджеров, usage-агрегации, platform admins.
- **`tenant_<slug>_db`**: бизнес-данные конкретного клиента (users/orders/menu/loyalty/broadcast/stories/integrations и т.д.).

## 3.2 Tenant resolution

Основной источник tenant-контекста: `Host/Subdomain`.

- `owner.example.com` → platform console.
- `<slug>.example.com` → tenant scope.

Дополнительно:

- `X-Tenant-Slug` допускается только от доверенного ingress.
- `slug` используется как **уникальный текстовый** внешний идентификатор tenant; числовой `id` — внутренний технический ключ.
- контракт `slug`: lowercase, латиница/цифры/дефис, без пробелов (рекомендуемый regex: `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$`).
- `platform_core.tenants.slug` обязателен как `UNIQUE NOT NULL`.

## 3.3 Подключение к БД

Backend не формирует DB name из пользовательского ввода.
Всегда цепочка:
`request host -> slug -> platform_core.tenants -> tenant_id, db_name -> pooled tenant connection`.

Правило нейминга:
- `db_name = tenant_<slug>_db` (пример: `tenant_pandapizza_db`);
- `platform_core.tenants.db_name` хранится как `UNIQUE NOT NULL`.

Обязателен менеджер пулов:

- lazy init;
- LRU/idle eviction;
- ограничение одновременных пулов;
- health-check и reconnect policy.

---

## 4. Биллинг и управление клиентами

## 4.1 Platform core таблицы (MVP)

Минимально обязательные:

- `tenants`
- `platform_admins`
- `subscription_plans`
- `subscriptions`
- `billing_transactions`
- `messenger_configs`
- `tenant_usage_stats`
- `tenant_db_migrations` (статус миграций per tenant)
- `billing_events` (webhook/event log)

Для `tenants` обязательно:
- `slug VARCHAR(...) UNIQUE NOT NULL`;
- `db_name VARCHAR(...) UNIQUE NOT NULL`;
- единая функция нормализации slug используется в API, owner UI и provisioning job.

## 4.2 Статусы подписки и dunning

Рекомендуемые статусы:

- `trial`
- `active`
- `past_due`
- `suspended`
- `cancelled`
- `deleted` (для tenant lifecycle)

Dunning flow:

- Day 0: billing attempt
- Day 3: retry #2
- Day 7: retry #3
- Day 10: `suspended`
- Day 30: `cancelled` + подготовка к финальному удалению

## 4.3 Лимиты

Лимиты проверяются на critical write-операциях:

- создание пользователей;
- создание материалов/сущностей контента;
- другие ограничиваемые сущности тарифа.

Проверка лимитов должна опираться на:

- `subscriptions + subscription_plans` в `platform_core`;
- фактические счетчики из `tenant_usage_stats` и/или live count в tenant БД.

---

## 5. Мессенджеры (Telegram/Max)

## 5.1 Принцип

Один backend + множество tenant-ботов.

- Каждый tenant хранит собственные credentials в `platform_core.messenger_configs`.
- Токены шифруются (AES/KMS) и не возвращаются в UI в открытом виде.
- Валидация initData выполняется токеном конкретного tenant.

## 5.2 URL MiniApp

Генерация для UI:

- `https://app.<slug>.example.com/platform=telegram`
- `https://app.<slug>.example.com/platform=max`

В проде tenant определяется прежде всего по домену/ingress context.

---

## 6. Что нужно изменить в текущем проекте

## 6.1 Backend

1. Ввести `platform_core` connection + tenant DB resolver.
2. Развести platform routes и tenant routes.
3. Перевести текущие бизнес-модули на tenant DB connection factory.
4. Вынести auth в 2 контура:
   - platform auth (owner/support/finance);
   - tenant auth (ceo/admin/manager внутри tenant).
5. Ввести subscription/limits middleware на tenant routes.
6. Сделать tenant-aware audit logging.

## 6.2 Admin Panel

Разделить UI:

- **Platform Console** (`owner.*`) — клиенты, тарифы, транзакции, мониторинг.
- **Tenant Admin** (`<slug>.*`) — текущая операционная админка клиента.

Добавить:

- onboarding wizard;
- billing screen;
- integrations screen с bot token workflow;
- лимитные предупреждения 80/90/100%.

## 6.3 Telegram MiniApp

- Ранний tenant bootstrap до любых бизнес-запросов.
- Безопасный tenant context guard.
- White-label настройки из tenant-конфига.
- Блокировка write-операций при `suspended/cancelled`.

## 6.4 Bot

- Роутинг входящих событий по tenant.
- Отказ от single-token сервиса.
- Внутренние bot ↔ backend API должны явно передавать tenant context.

## 6.5 Redis / Queue / WS

- Стандартизировать namespace: `tenant:{id}:...`.
- Исключить глобальные комнаты WS вроде `admin-broadcasts` без tenant scope.
- Исключить глобальные queue names/payload без tenant_id.

## 6.6 Infra / CI-CD

- Перейти от фиксированных `panda.*` путей к multi-domain ingress модели.
- Добавить release strategy для platform + tenant-safe migrations.
- Добавить tenant backup/restore runbooks.
- Добавить staging rehearsal миграции существующего клиента в `tenant_<slug>_db` (например, `tenant_pandapizza_db`).

---

## 7. Основные риски и как снижать

1. **Взрыв сложности миграций per tenant**
   - Ввести migration orchestrator и таблицу `tenant_db_migrations`.
2. **Рост числа DB-подключений**
   - Реализовать pool manager (LRU, idle eviction).
3. **Кросс-tenant утечки через кэш/WS/бота**
   - Ввести обязательные namespace-конвенции и security tests.
4. **Смешение продуктовой "подписки на канал" и SaaS billing subscription**
   - Явно разделить доменные модели и API.
5. **Операционные ошибки при удалении tenant**
   - Только асинхронный защищенный job, 30-day grace, audit.

---

## 8. Обновленный roadmap (под текущий проект)

## Phase 0 (1–2 недели): Architecture Lock

Результат:

- ADR по `platform_core + database-per-tenant`.
- ERD platform_core.
- Tenant DB bootstrap/migration design.
- Threat model (auth, ws, redis, bot, callbacks).
- Definition of Ready по billing/legal/payment.

## Phase 1 (2–3 недели): Platform Core Foundation

Результат:

- Подняты platform_core таблицы.
- Реализован tenant resolver (host/slug).
- Реализован tenant DB connection manager.
- Базовые platform auth + roles (`platform_owner/support/finance`).
- Provisioning API: create tenant + create tenant DB + run tenant migrations.

## Phase 2 (2–3 недели): Tenant Auth + Bootstrap

Результат:

- Tenant-aware auth для admin/miniapp.
- JWT/session claims с tenant context.
- Миграция текущего бренда в `tenant_<slug>_db` (staging -> prod rehearsal).
- Tenant-scoped `/api/settings`, `/api/orders` vertical slice.

## Phase 3 (2 недели): Billing MVP

Результат:

- subscription plans, subscriptions, billing transactions, billing events.
- Trial lifecycle + basic dunning.
- Middleware блокировки при `past_due/suspended/cancelled`.
- Billing dashboard (минимум) в Platform Console.

## Phase 4 (2 недели): Messenger & Integrations

Результат:

- `messenger_configs` (encrypted token storage).
- UI flow подключения Telegram/Max токена.
- Tenant-specific initData verification.
- Tenant-aware bot routing.

## Phase 5 (2–3 недели): Isolation Hardening

Результат:

- Tenant namespace для Redis/Queue/WS.
- Устранение global room/key/queue паттернов.
- E2E security regression (cross-tenant attempts).
- Audit logs per tenant + platform.

## Phase 6 (1–2 недели): Owner Console + Ops

Результат:

- Owner dashboard (MRR/ARR/churn/basic usage).
- Client detail page + SSO impersonation with audit.
- Soft-delete + grace-period + permanent deletion worker.
- Backup/restore runbook per tenant.

Итого: **10–15 недель** для production-ready SaaS MVP (с учетом текущего кода и миграционных рисков).

---

## 9. Definition of Done

1. Tenant A не может читать/менять данные tenant B ни через API, ни через WS, ни через bot callbacks.
2. Все tenant-данные физически хранятся в отдельных БД.
3. Подписка реально ограничивает доступ и лимиты.
4. Новый клиент проходит self-service onboarding без ручного вмешательства разработчика.
5. Platform owner управляет клиентами, планами, платежами и видит usage.
6. Есть проверенный restore конкретного tenant и безопасный delete lifecycle.
7. CI/CD поддерживает откат и tenant-safe миграции.

---

## 10. Следующие практические шаги (сразу после утверждения)

1. Утвердить ADR и naming conventions (`platform_core`, `tenant_<slug>_db`).
2. Подготовить SQL DDL для platform_core.
3. Сделать прототип tenant DB manager в backend.
4. Выкатить vertical slice: tenant-aware `settings + orders`.
5. Добавить security test pack на cross-tenant сценарии.

---

Документ актуализирован под новый сценарий multi-tenancy: **database-per-tenant**.
