# CONTRIBUTING

## Цель

Этот документ фиксирует минимальные инженерные правила для изменений в FoodMiniApp.

## Структура репозитория

- `backend/` — API, очереди и worker-процессы
- `admin-panel/` — административный интерфейс
- `telegram-miniapp/` — клиентское Mini App
- `bot/` — отдельный Telegram bot service

## Базовые правила

- Язык кода, комментариев и документации: русский.
- Перед началом задачи сверяйтесь с `README.md`, `docs/` и `TASKS.md`.
- Новые зависимости добавляются только после согласования.
- Для UI используются только иконки `lucide-vue-next`.
- Для миграций обязательно обновлять `backend/database/schema.sql`.

## Локальные проверки

Из корня репозитория:

```bash
npm run lint
npm run typecheck
npm run test
npm run check
```

Покомпонентно:

```bash
npm --prefix backend run lint
npm --prefix admin-panel run typecheck
npm --prefix telegram-miniapp run test
npm --prefix bot run lint
```

## Требования к изменениям

- Не добавлять `console.log()` в production-код.
- Для async-операций использовать явную обработку ошибок.
- Не оставлять пустые `catch` без поведения.
- Не создавать крупные монолитные файлы без необходимости.

## Перед PR

- Убедиться, что `lint`, `typecheck`, `test` проходят локально.
- Обновить документацию, если изменились запуск/конфиги/API.
- Проверить, что `.env.example` отражают актуальные обязательные переменные.
