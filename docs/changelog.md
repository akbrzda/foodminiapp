# Changelog (Code-driven)

## Назначение

Changelog ведется в коде и публикуется вместе с релизом приложения.

Это исключает ручное редактирование через БД/админку и подходит для отдельных инсталляций (каждый клиент со своей панелью).

## Источник данных

- Файл: `backend/src/config/changelog.json`
- Формат: массив релизов (`releases`) с вложенными `items` и `components`

Пример структуры:

```json
{
  "releases": [
    {
      "id": 1,
      "version": "1.0.0",
      "published_at": "2026-02-19T09:00:00.000Z",
      "title": "Стартовый changelog",
      "description": "Описание",
      "items": [
        { "id": 1, "item_type": "feature", "module": "backend", "title": "..." }
      ],
      "components": [
        { "id": 1, "component": "backend", "component_version": "1.0.0" }
      ]
    }
  ]
}
```

## API

### Public

- `GET /api/changelog/latest` — последний релиз
- `GET /api/changelog/releases` — список релизов (пагинация)
- `GET /api/changelog/releases/:id` — детали релиза

## UI

- `admin-panel`: модал версии в Sidebar с просмотром релизов.
- `telegram-miniapp`: блок "Что нового" и список релизов в Drawer.

## Обновление changelog

1. Обновить `backend/src/config/changelog.json`
2. Задеплоить backend + frontend
3. Проверить `GET /api/changelog/latest`
