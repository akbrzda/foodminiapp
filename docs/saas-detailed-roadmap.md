# Детальный roadmap внедрения SaaS (database-per-tenant)

## Контекст

- Проект: FoodMiniApp
- Архитектурное решение: `platform_core + tenant_<slug>_db`
- Доменная схема:
  - `owner.example.com` — панель владельца платформы
  - `<slug>.example.com` — панель клиента
  - `app.<slug>.example.com/platform=telegram|max` — вход в MiniApp клиента
- Идентификаторы tenant:
  - `id` — внутренний числовой ключ
  - `slug` — уникальный текстовый внешний бизнес-идентификатор (routing/domain)
- Стартовый ориентир: **6 апреля 2026**
- Цель: вывести production-ready SaaS MVP с изоляцией данных, биллингом и owner console

---

## 0) Формат исполнения

## 0.1 Команды/роли

- Tech Lead / Architect
- Backend team
- Frontend team (Admin + MiniApp)
- Bot/Integrations team
- DevOps/SRE
- QA + Security

## 0.2 Треки (параллельные потоки)

1. Platform Core & Billing
2. Tenant Runtime (resolver, db manager, auth)
3. Product Surfaces (owner console, tenant admin, miniapp)
4. Messaging/Integrations
5. Infra, CI/CD, Observability, Security

## 0.3 Стадии контроля

- **Gate A**: Architecture Lock
- **Gate B**: Tenant Runtime Ready
- **Gate C**: Billing Enforced
- **Gate D**: Isolation Proven
- **Gate E**: Production Launch

---

## 1) Календарный план (14 недель)

## Wave 1: Foundation (Недели 1–4)

Период: **6 апреля 2026 — 3 мая 2026**

### Неделя 1 (6–12 апреля 2026): Architecture Lock

Цели:
- утвердить целевую архитектуру и правила разработки

Задачи:
1. Зафиксировать ADR:
   - `platform_core` схема данных
   - lifecycle tenant БД
   - tenant resolution (host-first)
   - единый slug contract (format + uniqueness + normalization)
2. Спроектировать ERD для `platform_core`:
   - `tenants`, `platform_admins`, `subscription_plans`, `subscriptions`, `billing_transactions`, `billing_events`, `messenger_configs`, `tenant_usage_stats`, `tenant_db_migrations`
   - для `tenants`: `slug UNIQUE NOT NULL`, `db_name UNIQUE NOT NULL`
3. Спроектировать tenant DB manager:
   - pool strategy (lazy init, idle close, max pools, LRU)
   - правило имени БД: `tenant_<slug>_db`
4. Спроектировать security model:
   - access boundaries
   - secrets handling
   - impersonation audit

Артефакты:
- ADR (approved)
- ERD + DDL draft
- Threat model v1
- Definition of Ready checklist

Критерий завершения:
- Gate A подписан Tech Lead + DevOps + Security

### Неделя 2 (13–19 апреля 2026): Platform Core Bootstrap

Цели:
- развернуть базу platform layer

Задачи:
1. Добавить миграции `platform_core`.
   - включить индексы/ограничения уникальности для `tenants.slug` и `tenants.db_name`
2. Реализовать repository/service слой для tenants/plans/subscriptions.
3. Реализовать provisioning flow:
   - create tenant record
   - create tenant DB
   - run tenant migrations
   - slug normalize/validate (единая библиотека для backend + owner UI)
4. Реализовать таблицу и API трекинга миграций `tenant_db_migrations`.

Артефакты:
- SQL migrations
- Provisioning service + integration tests
- Runbook “create tenant”

Критерий завершения:
- создание нового tenant полностью автоматизировано в staging

### Неделя 3 (20–26 апреля 2026): Tenant Resolver + DB Manager

Цели:
- обеспечить корректное определение tenant и подключение к tenant БД

Задачи:
1. Реализовать middleware `resolveTenantContext`:
   - host/subdomain primary
   - trusted `X-Tenant-Slug` fallback
2. Реализовать tenant DB connection manager:
   - pool cache
   - connection health checks
   - telemetry (open pools, errors)
3. Внедрить tenant context в request lifecycle.
4. Добавить отказоустойчивые ответы на unknown/disabled/deleted tenant.

Артефакты:
- middleware + manager + unit/integration tests
- dashboard метрик по pool usage

Критерий завершения:
- стабильное обслуживание >= 50 tenant контекстов в staging без утечек пулов

### Неделя 4 (27 апреля — 3 мая 2026): Auth Split (Platform/Tenant)

Цели:
- разделить контуры аутентификации и ролей

Задачи:
1. Разделить auth payload:
   - platform claims
   - tenant claims
2. Добавить role models:
   - platform: `platform_owner`, `platform_support`, `platform_finance`
   - tenant: `ceo/admin/manager`
3. Добавить middleware:
   - `requirePlatformAccess`
   - `requireTenantAccess`
4. Добавить session invalidation и audit для impersonation-ready future.

Артефакты:
- auth v2 endpoints
- migration script текущих админов в tenant модель

Критерий завершения:
- Gate B: auth + resolver + tenant DB routing работает end-to-end

---

## Wave 2: Vertical Slice + Billing (Недели 5–8)

Период: **4 мая 2026 — 31 мая 2026**

### Неделя 5 (4–10 мая 2026): Vertical Slice `settings + orders`

Цели:
- доказать работоспособность tenant runtime на ключевых доменах

Задачи:
1. Перевести `/api/settings` на tenant DB.
2. Перевести `/api/orders` (critical path) на tenant DB.
3. Обновить admin UI для tenant-aware работы с settings/orders.
4. Прогон функциональных regression тестов.

Артефакты:
- vertical slice в staging
- regression report

Критерий завершения:
- данные двух tenant полностью изолированы на settings/orders

### Неделя 6 (11–17 мая 2026): Billing Core

Цели:
- запустить подписки и биллинг ядро

Задачи:
1. Реализовать CRUD тарифов (`subscription_plans`).
2. Реализовать `subscriptions` lifecycle:
   - `trial`, `active`, `past_due`, `suspended`, `cancelled`
3. Реализовать `billing_transactions` + `billing_events`.
4. Интегрировать платежный шлюз (MVP flow + webhook).

Артефакты:
- billing services
- webhook handler + idempotency

Критерий завершения:
- тестовый платеж активирует/продлевает подписку

### Неделя 7 (18–24 мая 2026): Dunning + Limits Enforcement

Цели:
- включить финансовые ограничения в runtime

Задачи:
1. Реализовать retry policy:
   - Day 0 / Day 3 / Day 7 / Day 10 suspend
2. Реализовать middleware проверки подписки и лимитов.
3. Реализовать soft-limit оповещения 80/90/100%.
4. Включить hard-limit на критичные create-операции.

Артефакты:
- scheduled jobs
- limit enforcement layer
- notification templates

Критерий завершения:
- Gate C: ограничения реально блокируют операции согласно плану

### Неделя 8 (25–31 мая 2026): Owner Console v1

Цели:
- дать платформенной команде интерфейс управления клиентами и финансами

Задачи:
1. Раздел “Clients”: список, фильтры, статус, план.
2. Client details: usage, subscription, transaction history.
3. Actions: change plan, suspend/resume, soft delete.
4. Финансовый обзор (MRR базово + транзакции).

Артефакты:
- owner frontend routes + backend APIs
- RBAC для platform roles

Критерий завершения:
- platform owner может управлять жизненным циклом клиента без ручных SQL операций

---

## Wave 3: Messaging/Isolation/Hardening (Недели 9–12)

Период: **1 июня 2026 — 28 июня 2026**

### Неделя 9 (1–7 июня 2026): Messenger Configs + Bot Routing

Цели:
- перейти от single-token к tenant-credentials

Задачи:
1. Реализовать `messenger_configs` c encrypted token storage.
2. Реализовать UI flow подключения Telegram/Max для tenant.
3. Реализовать tenant-aware bot dispatcher.
4. Реализовать tenant-specific initData validation.

Артефакты:
- bot token management
- end-to-end message path per tenant

Критерий завершения:
- два tenant с разными ботами работают через один backend без пересечений

### Неделя 10 (8–14 июня 2026): Redis/Queue/WS Isolation

Цели:
- устранить глобальные каналы и ключи

Задачи:
1. Ввести namespace-конвенцию `tenant:{id}:...` для Redis.
2. Перевести очередь задач на tenant-aware payload + keys.
3. Перевести WS rooms на tenant-scoped формат.
4. Запретить cross-tenant broadcast технически (guard + tests).

Артефакты:
- migration ключей/очередей
- WS protocol update

Критерий завершения:
- нет глобальных room/key в runtime path

### Неделя 11 (15–21 июня 2026): Data Migration Current Brand -> tenant_1

Цели:
- безопасно перенести существующего клиента в новую модель

Задачи:
1. Подготовить миграционный скрипт full copy в `tenant_<slug>_db` (например, `tenant_pandapizza_db`).
2. Прогнать dry-run и rehearsal на staging с production-like snapshot.
3. Сверить контрольные totals и бизнес-инварианты.
4. Подготовить rollback strategy.

Артефакты:
- migration scripts
- reconciliation report
- rollback runbook

Критерий завершения:
- проверяемый безошибочный rehearsal

### Неделя 12 (22–28 июня 2026): Security Regression + Performance Baseline

Цели:
- доказать отсутствие cross-tenant утечек

Задачи:
1. Автотесты cross-tenant API/WS/Bot сценариев.
2. Pen-test чеклист: tenant bypass, slug spoofing, token misuse.
3. p95 latency baseline и тест на рост количества tenant.
4. Аудит логирования platform/tenant действий.

Артефакты:
- security report
- perf baseline report

Критерий завершения:
- Gate D: isolation proven + SLA baseline подтвержден

---

## Wave 4: Launch Readiness (Недели 13–14)

Период: **29 июня 2026 — 12 июля 2026**

### Неделя 13 (29 июня — 5 июля 2026): Ops + Compliance

Цели:
- закрыть эксплуатационные требования

Задачи:
1. Backup/restore per tenant automation.
2. Soft delete + 30-day grace + permanent delete worker.
3. Impersonation (SSO login-as-client-admin) с полным audit trail.
4. Настроить алерты (billing failures, expiring trial, unusual errors).

Артефакты:
- ops runbooks
- deletion lifecycle jobs
- alerting dashboards

Критерий завершения:
- восстановления tenant и удаление tenant проходят по runbook без ручных ad-hoc действий

### Неделя 14 (6–12 июля 2026): Production Cutover

Цели:
- безопасный запуск SaaS режима

Задачи:
1. Canary rollout (internal tenants -> pilot tenants).
2. Постепенное включение фич-флагов multi-tenant режима.
3. Мониторинг SLO/SLA в первые 72 часа.
4. Post-launch review и backlog стабилизации.

Артефакты:
- launch checklist
- incident response plan
- post-launch report

Критерий завершения:
- Gate E: SaaS MVP в проде, критичные метрики в допустимых пределах

---

## 2) Детальный backlog по направлениям

## 2.1 Backend

Must-have:
1. `platform_core` DAL + migrations
2. tenant resolver + trusted ingress checks
3. tenant DB manager (pool lifecycle)
4. dual auth model
5. billing services + dunning jobs
6. limits middleware
7. tenant-aware audit

## 2.2 Admin Panel

Must-have:
1. owner console routes + RBAC
2. tenant admin bootstrap screen
3. billing screens (plan/status/usage)
4. bot integration screens

## 2.3 MiniApp

Must-have:
1. tenant bootstrap guard
2. subscription status handling
3. blocked mode UX for suspended/cancelled

## 2.4 Bot/Integrations

Must-have:
1. tenant credential resolver
2. tenant-aware callbacks
3. token encryption + rotate flow

## 2.5 Infra/DevOps

Must-have:
1. wildcard ingress + slug routing
2. secrets management model
3. tenant migration orchestrator job
4. backup/restore automation
5. observability dashboards per tenant

---

## 3) Технические зависимости

Критические зависимости:
1. Auth split зависит от tenant resolver.
2. Billing enforcement зависит от subscription lifecycle + plan data.
3. Bot routing зависит от `messenger_configs`.
4. Launch зависит от security regression и migration rehearsal.

---

## 4) Риски проекта и план реакции

1. Перегруз MySQL по соединениям
- Реакция: pool cap + eviction + read/write budget

2. Неконсистентная миграция текущего бренда
- Реакция: rehearsal + reconciliation + rollback window

3. Ошибки биллинга/повторные списания
- Реакция: idempotency keys + event log + retry policy

4. Cross-tenant инциденты
- Реакция: mandatory tests + runtime guards + incident playbook

---

## 5) KPI и метрики готовности

Engineering KPI:
- 100% критичных endpoint покрыты tenant-security тестами
- 0 известных cross-tenant дефектов на launch
- p95 API по ключевым операциям < 400ms (или согласованный SLA)

Business KPI:
- onboarding нового tenant без ручной разработки
- успешное подключение bot credentials через UI
- корректный цикл trial -> active -> renew/suspend

Ops KPI:
- успешный restore конкретного tenant из backup
- алерты по billing/dunning срабатывают корректно

---

## 6) Definition of Done (продуктовый)

1. Каждый tenant физически изолирован отдельной БД.
2. Platform owner управляет клиентами, планами, подписками, платежами.
3. Tenant admin работает в собственном контексте без утечек.
4. Bot/WS/Redis/Queue не имеют cross-tenant пересечений.
5. Есть повторяемые runbook: create tenant, migrate tenant, restore tenant, delete tenant.
6. Production launch пройден по canary без критичных инцидентов.

---

## 7) Непосредственно следующий шаг (на ближайшие 5 рабочих дней)

1. Утвердить этот roadmap (Gate A scope).
2. Создать epic-и в трекере по Wave 1 (с назначением ответственных).
3. Подготовить DDL `platform_core` и PR #1.
4. Подготовить PR #2: tenant resolver + db manager skeleton.
5. Подготовить тест-план cross-tenant security pack.
