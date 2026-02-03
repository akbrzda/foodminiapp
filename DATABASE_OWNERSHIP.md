# Владение таблицами (Database Ownership)

## Назначение

Документ фиксирует, какой доменный модуль владеет таблицами БД. Владелец имеет право на чтение/запись и изменение схемы; другие модули работают через публичный API владельца.

## Модули и таблицы

### Loyalty

- `loyalty_levels`
- `loyalty_transactions`
- `loyalty_logs`
- `user_loyalty_levels`
- Поля в `users`: `loyalty_balance`, `current_loyalty_level_id`, `loyalty_joined_at`

### Orders

- `orders`
- `order_items`
- `order_item_modifiers`
- `order_status_history`

### Menu

- `menu_categories`
- `menu_items`
- `item_variants`
- `modifier_groups`
- `modifiers`
- `menu_item_prices`
- `menu_stop_list`

### Users/Auth

- `users`
- `user_states`
- `delivery_addresses`

### Delivery

- `cities`
- `branches`
- `delivery_polygons`

### Broadcasts

- `broadcast_campaigns`
- `broadcast_segments`
- `broadcast_messages`
- `broadcast_queue`
- `broadcast_clicks`
- `broadcast_conversions`
- `broadcast_logs`
