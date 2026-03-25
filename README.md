# FoodMiniApp

Монорепозиторий системы онлайн-заказа еды с четырьмя сервисами:

- `backend` — REST API, WebSocket и фоновые worker-процессы
- `admin-panel` — административная панель (Vue 3 + Vite)
- `telegram-miniapp` — клиентское Telegram Mini App (Vue 3 + Vite)
- `bot` — отдельный Telegram bot service

## Текущий стек (по фактическому коду)

- Backend/Bot: Node.js, Express, MySQL, Redis, BullMQ
- Frontend: Vue 3, Vite, Pinia, Vue Router, Tailwind CSS
- Иконки: `lucide-vue-next`
- Инфраструктура: Docker Compose (локально), GitHub Actions (деплой/quality)

## Структура репозитория

```text
foodminiapp/
  backend/
  admin-panel/
  telegram-miniapp/
  bot/
  docs/
  .github/workflows/
```

## Быстрый старт

### 1. Установить зависимости

```bash
npm --prefix backend install
npm --prefix admin-panel install
npm --prefix telegram-miniapp install
npm --prefix bot install
```

### 2. Подготовить переменные окружения

Заполните `.env` на основе:

- `backend/.env.example`
- `admin-panel/.env.example`
- `telegram-miniapp/.env.example`
- `bot/.env.example`

### 3. Запустить сервисы

```bash
npm --prefix backend run dev
npm --prefix admin-panel run dev
npm --prefix telegram-miniapp run dev
npm --prefix bot run dev
```

## Единые команды качества из корня

```bash
npm run lint
npm run typecheck
npm run test
npm run check
```

Где:

- `lint` — запускает `lint` каждого сервиса
- `typecheck` — запускает `typecheck` каждого сервиса
- `test` — запускает `test` каждого сервиса
- `check` — полный прогон `lint + typecheck + test`

## Текущие quality gates в CI

В `.github/workflows` для каждого сервиса есть pipeline из шагов:

- установка зависимостей (`npm ci`)
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- security audit (`npm audit --omit=dev --audit-level=high`)

## Документация

- Общая спецификация: `docs/doc.md`
- Бонусная система: `docs/bonus.md`
- Меню: `docs/menu.md`
- Доставка и тарифы: `docs/delivery_zone.md`
- Модуль рассылок: `docs/newsletter.md`
- Модуль Stories: `docs/stories.md`
- Интеграции: `docs/integration.md`
- Инженерные стандарты: `docs/code-standards.md`

## Важно

- Не добавляйте новые зависимости без согласования.
- Для миграций backend обязательно обновляйте `backend/database/schema.sql`.
- Для frontend используйте только иконки `lucide-vue-next`.
