# 🎯 FoodMiniApp

> Единая система онлайн‑заказа еды с Telegram Mini App, админ‑панелью и backend API для управления меню, заказами и доставкой.

![Status](https://img.shields.io/badge/status-MVP-yellow) ![Stack](https://img.shields.io/badge/stack-Vue3%20%7C%20Node.js-blue) ![DB](https://img.shields.io/badge/db-MySQL8%20%2B%20Redis-informational) ![License](https://img.shields.io/badge/license-ISC-lightgrey)

## 🧭 О проекте

FoodMiniApp закрывает полный цикл заказа еды в Telegram: от выбора блюд и оформления доставки до управления операциями кухни в админ‑панели. Система рассчитана на рестораны и сети, которым важно запускаться быстро и работать стабильно в пиковых нагрузках. Ключевое преимущество — связка Telegram Mini App + real‑time админ‑панели с геозонами и модульной архитектурой бэкенда. Проект нацелен на масштабирование по городам и филиалам.

## ⭐ Key Features

- **Telegram Mini App** — заказ внутри Telegram без установки отдельного приложения.
- **Гибкое меню** — категории, позиции, варианты, модификаторы, теги и стоп‑лист.
- **Доставка по полигонам** — проверка адресов через PostGIS, тарифные ступени и геокодинг.
- **Корзина и заказы** — расчет, оформление, статусы, повтор заказа и история.
- **Лояльность** — 3 уровня, начисления/списания, история транзакций и аудит.
- **Админ‑панель real‑time** — управление заказами, сменой, пользователями и настройками через WebSocket.
- **Маркетинговые рассылки** — сегменты, кампании, очередь, статистика и конверсии.
- **Background Workers** — автоматизация через BullMQ: обработка изображений, рассылки, автостатусы заказов, бонусы.
- **Миграции БД** — версионирование схемы, автоматическая синхронизация с schema.sql.

## 🧰 Tech Stack

- **Frontend:** Vue 3, Vite, Pinia, Vue Router, Tailwind CSS, Shadcn UI, Radix Vue, Lucide.
- **Admin UI:** Leaflet, Leaflet.draw, Unovis, vue-sonner.
- **Backend:** Node.js, Express, WebSocket, BullMQ, Axios, Winston.
- **DB/Cache:** MySQL 8 + PostGIS, Redis.
- **Инфраструктура:** Docker Compose (локально), Linux, Apache, pm2.
- **Интеграции:** Telegram Bot API, Telegram Mini App SDK, iiko (меню/стоп-лист/заказы), сервисы геокодинга (Nominatim/Yandex).
