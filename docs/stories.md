# Техническое задание: модуль Stories (MVP)

## 1. Назначение

Модуль Stories добавляет в клиентский Mini App:

- горизонтальную ленту карточек на главном экране;
- полноэкранный просмотр слайдов;
- базовую аналитику показов, кликов и завершений просмотра.

Модуль должен работать в двух платформах: Telegram и MAX.

## 2. Scope MVP

В MVP реализуются:

- публикация кампаний stories из админ-панели;
- таргетинг по городу и филиалу;
- расписание активности кампании;
- показ stories в блоке `placement=home`;
- fullscreen viewer с авто-переключением;
- CTA-ссылка/переход;
- трекинг `impression`, `click`, `complete`.

В MVP не реализуются:

- A/B тесты;
- сложный WYSIWYG-редактор;
- автоматические триггеры показа по событиям.

## 3. API MVP

Клиентские endpoint'ы:

- `GET /api/stories/active?placement=home`
- `POST /api/stories/impression`
- `POST /api/stories/click`
- `POST /api/stories/complete`

Админские endpoint'ы:

- `GET /api/stories`
- `POST /api/stories`
- `GET /api/stories/:id`
- `PUT /api/stories/:id`
- `PUT /api/stories/:id/toggle`

## 4. Базовые метрики

- `impressions` — общее число показов слайдов;
- `unique_impressions` — уникальные пользователи по кампании;
- `clicks` — клики по CTA;
- `ctr` — clicks / impressions;
- `completions` — завершения просмотра кампании.

## 5. Рекомендации после MVP

- frequency cap (ограничение частоты показов);
- A/B варианты креативов;
- конверсия в заказ после просмотра stories;
- сегментация показа по активности клиента.
