# Техническое задание: Система лояльности (Бонусная программа)

## Содержание

1. [Общее описание](#общее-описание)
2. [Функциональные требования](#функциональные-требования)
3. [Архитектура базы данных](#архитектура-базы-данных)
4. [Бизнес-логика](#бизнес-логика)
5. [API спецификация](#api-спецификация)
6. [Интерфейс администратора](#интерфейс-администратора)
7. [Интерфейс клиента](#интерфейс-клиента)
8. [Технические требования](#технические-требования)

---

## Общее описание

### Цель проекта

Разработка гибкой многоуровневой системы лояльности для онлайн-заказа еды с возможностью начисления и списания бонусов, управлением уровнями пользователей и расширенными настройками администрирования.

### Основные возможности

- Неограниченное количество уровней лояльности с индивидуальными настройками
- Гибкое начисление и списание бонусов
- Автоматическое управление уровнями пользователей
- Система исключений для определенных категорий/товаров
- Деградация уровня при неактивности
- Автоматические начисления по триггерам (регистрация, день рождения)
- Детальная история транзакций
- Комплексная административная панель

---

## Функциональные требования

### 1. Управление уровнями лояльности

#### 1.1 Создание и редактирование уровней

**Поля уровня:**

- **Название** (string, обязательное) - название уровня (например, "Бронза", "Серебро", "Золото")
- **Порог достижения** (integer, обязательное) - сумма в рублях для достижения уровня
- **Процент начисления** (integer, обязательное) - процент начисления бонусов (вводится как целое число, например 3 для 3%, преобразуется в 0.03 на backend)
- **Максимальный процент списания** (integer, обязательное) - максимальный процент от суммы заказа, который можно оплатить бонусами (вводится как целое число, например 20 для 20%, преобразуется в 0.20)
- **Включен/выключен** (boolean) - активность уровня
- **Порядок сортировки** (integer, auto) - автоматически определяется по значению порога (меньший порог = младший уровень)

**Правила создания:**

- Пороги должны быть уникальными - нельзя создать два уровня с одинаковым порогом
- Первый (стартовый) уровень всегда имеет порог 0₽
- Порядок уровней определяется автоматически по возрастанию порога
- Все процентные поля в интерфейсе вводятся как целые числа для удобства

#### 1.2 Удаление и отключение уровней

**Правила удаления:**

- Нельзя удалить уровень, если на нем есть активные пользователи (`current_loyalty_level_id`)
- Нельзя удалить уровень, если есть записи в истории (`user_loyalty_levels`)
- При наличии пользователей или истории кнопка "Удалить" неактивна
- При попытке удаления показывается сообщение: "Невозможно удалить уровень. На нём сейчас X пользователей"

**Правила отключения:**

- Нельзя отключить уровень, если на нем есть активные пользователи
- Отключенные уровни не участвуют в расчетах, но сохраняются в истории

**Мягкое удаление (soft delete):**

- При удалении уровня устанавливается `deleted_at` (timestamp)
- Удаленные уровни сохраняются для целостности истории
- В списках не отображаются, но доступны в истории транзакций

#### 1.3 Переход между уровнями

**Условия перехода:**

- Сумма заказов рассчитывается за настраиваемый период (по умолчанию 60 дней)
- Учитываются только заказы со статусом `delivered`/`completed`
- Сумма считается после вычета использованных бонусов и без учета стоимости доставки
- При достижении порога следующего уровня пользователь автоматически повышается
- При падении суммы ниже текущего порога пользователь понижается (если включена деградация)

### 2. Настройки системы лояльности

#### 2.1 Глобальные параметры

**Основные настройки:**

- **Включение/выключение модуля** (boolean) - глобальное включение системы лояльности
- **Период расчета суммы для уровня** (integer, дней) - период за который считается сумма заказов для определения уровня (по умолчанию: 60)
- **Максимальный процент списания** (integer) - глобальный лимит списания бонусов от суммы заказа
- **Срок действия бонусов** (integer, дней) - сколько дней действуют начисленные бонусы (по умолчанию: 60)

**Настройки начисления:**

- **Учитывать стоимость доставки** (boolean) - включать ли доставку в базу для начисления
- **Расчет от суммы после списания бонусов** (boolean) - начислять от итоговой суммы или от суммы до вычета бонусов
- **Минимальная сумма заказа для начисления** - не используется (начисляем с любой суммы)

**Округление:**

- **Правило округления** - всегда округление вниз (floor)
- При списании: если рассчитано 134.6₽ → списываем 134₽
- При начислении: если рассчитано 24.8₽ → начисляем 24₽

#### 2.2 Деградация уровня

**Настройки деградации:**

- **Включить деградацию** (boolean) - активация механизма понижения уровня
- **Период неактивности** (integer, дней) - количество дней без завершенных заказов для деградации (по умолчанию: 180)
- **Режим понижения** - пошаговый (на 1 уровень за раз)

**Логика работы:**

- Считаются только завершенные заказы (статус `delivered`/`completed`)
- Проверка выполняется раз в сутки (cron задача)
- При деградации пользователь понижается на 1 уровень (например, с Золота на Серебро)
- При повторной неактивности через период снова понижается на 1 уровень
- Если настройка отключена - уровни не понижаются

#### 2.3 Автоматические начисления (триггеры)

**Бонус за регистрацию:**

- **Включить** (boolean)
- **Сумма бонуса** (integer)
- **Срок действия** (integer, дней)
- **Условие** - начисляется один раз при регистрации в программе лояльности

**Бонус за день рождения:**

- **Включить** (boolean)
- **Сумма бонуса** (integer)
- **Дней до дня рождения** (integer) - за сколько дней до ДР начислять
- **Дней после дня рождения** (integer, дней) - срок действия
- **Условие** - начисляется один раз в год

### 3. Исключения для списания бонусов

#### 3.1 Управление исключениями

**Типы исключений:**

- **По категории** - исключить все товары категории
- **По конкретному товару** - исключить отдельное блюдо

**Функционал:**

- Возможность добавить неограниченное количество исключений
- Исключения действуют только на списание бонусов
- Начисление бонусов происходит со всего заказа (включая исключенные позиции)

**Расчет при наличии исключений:**

1. Из общей суммы заказа вычитаются позиции из списка исключений
2. Максимальное списание рассчитывается от оставшейся суммы
3. Если весь заказ состоит из исключенных товаров → показать сообщение "Бонусы недоступны для списания на данные позиции"

**Пример:**

```
Заказ:
- Пицца: 500₽
- Алкоголь: 1000₽ (в исключениях)
- Салат: 300₽

Сумма для списания: 500₽ + 300₽ = 800₽
Максимум 20%: 160₽

Начисление после заказа:
База: (500₽ + 1000₽ + 300₽ - 160₽) = 1640₽
Начисление 3%: 49₽
```

### 4. Начисление и списание бонусов

#### 4.1 Процесс списания бонусов

**Момент списания:**

- Происходит при создании заказа (статус `new`)
- Пользователь указывает количество бонусов для использования
- Создается транзакция типа `spend` со статусом `pending`

**Ограничения:**

- Проверка достаточности баланса
- Проверка максимального процента списания для уровня пользователя
- Проверка исключений (категории/товары)
- Списание по принципу FIFO (First In, First Out) - сначала самые старые бонусы

**Расчет суммы:**

- Сумма заказа для расчета = итоговая сумма заказа без стоимости доставки
- Исключаются позиции из списка исключений
- Применяется максимальный процент списания уровня
- Округление вниз до целого рубля

#### 4.2 Процесс начисления бонусов

**Момент начисления:**

- При первом достижении статуса `delivered` или `completed`
- Сумма фиксируется и сохраняется в заказе
- Создается транзакция типа `earn` со статусом `completed`

**Расчет суммы начисления:**

1. Берется сумма заказа
2. Вычитается стоимость доставки (если настройка `include_delivery_in_earn = false`)
3. Вычитаются использованные бонусы (если настройка `calculate_from_amount_after_bonus = true`)
4. Применяется процент начисления текущего уровня пользователя
5. Округление вниз до целого рубля

**Фиксация суммы:**

- Сумма начисления фиксируется при первом `delivered`
- Сохраняется в поле `orders.bonus_earn_amount`
- При повторных изменениях статуса используется зафиксированная сумма
- Даже если уровень пользователя изменился - начисляется исходная сумма

#### 4.3 Истечение бонусов

**Механизм истечения:**

- У каждой транзакции `earn` есть поле `expires_at`
- Срок рассчитывается: `earned_at + срок_действия_бонусов`
- По истечении срока создается транзакция типа `expire`
- Баланс уменьшается на сумму истекших бонусов

**Проверка:**

- Выполняется автоматически раз в сутки (cron задача)
- Обрабатываются все бонусы с `expires_at < текущая_дата`

### 5. Логика смены статусов заказа

#### 5.1 Жизненный цикл заказа

**Основные статусы:**

- `new` - новый заказ (создан)
- `confirmed` - подтвержден
- `preparing` - готовится
- `ready` - готов к выдаче
- `in_delivery` / `on_the_way` - в пути
- `delivered` / `completed` - доставлен/выдан
- `cancelled` - отменен

#### 5.2 Действия с бонусами по статусам

**Таблица переходов:**

| Переход                               | Действие                            | Транзакции                                                           | Изменение баланса |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- | ----------------- |
| → `new` (создание)                    | Списать указанные бонусы            | Создать `spend` (status=`pending`)                                   | -N                |
| Любой → `delivered` (первый раз)      | Начислить бонусы, фиксировать сумму | Создать `earn` (status=`completed`), изменить `spend` на `completed` | +M                |
| `delivered` → другой статус (откат)   | Отменить начисление                 | Изменить `earn` на `cancelled`                                       | -M                |
| Любой → `delivered` (повторно)        | Начислить фиксированную сумму       | Создать новый `earn` с зафиксированной суммой                        | +M                |
| Любой → `cancelled` после `delivered` | Отменить начисление и списание      | Изменить все транзакции заказа на `cancelled`                        | +N -M             |
| `new` → `cancelled` (до delivered)    | Вернуть списанные бонусы            | Изменить `spend` на `cancelled`                                      | +N                |

**Детальные сценарии:**

**Сценарий 1: Нормальный флоу**

```
new → preparing → delivered
```

- При создании: списываем 200₽, создаем `spend` (pending)
- При `delivered`: фиксируем сумму начисления 24₽, создаем `earn`, меняем `spend` на completed

**Сценарий 2: Откат после delivered**

```
delivered → on_the_way → delivered
```

- При откате: находим `earn`, меняем на cancelled, баланс -24₽
- При повторном delivered: создаем новый `earn` на ту же сумму 24₽ (из orders.bonus_earn_amount)

**Сценарий 3: Множественные откаты**

```
delivered → on_the_way → delivered → on_the_way → delivered
```

- Каждый откат: cancelled предыдущий `earn`
- Каждый delivered: создаем новый `earn` на зафиксированную сумму
- В истории видны все транзакции, активна только последняя

**Сценарий 4: Отмена после delivered**

```
new (списали 200₽) → delivered (начислили 24₽) → cancelled
```

- Находим все транзакции заказа
- Меняем все на status=`cancelled`
- Баланс: +200₽ (возврат списания), -24₽ (отмена начисления)
- Если пользователь уже потратил начисленные бонусы → разрешаем отрицательный баланс
- Записываем событие в `loyalty_logs` с типом `negative_balance`

**Сценарий 5: Отмена до delivered**

```
new (списали 200₽) → cancelled
```

- Находим `spend` транзакцию
- Меняем на status=`cancelled`
- Баланс: +200₽

#### 5.3 Изменение состава заказа

**До статуса delivered:**

- Бонусы уже списаны при создании заказа
- Для изменения списания требуется отмена и пересоздание заказа

**После статуса delivered:**

- Бонусы уже начислены
- При удалении позиции из заказа:
  1. Пересчитываем сумму для начисления по формуле
  2. Находим активную `earn` транзакцию
  3. Создаем корректирующую транзакцию типа `adjustment`:
     - Если новая сумма < старой → отрицательная корректировка
     - Если новая сумма > старой → положительная корректировка
  4. Проверяем достаточность баланса при отрицательной корректировке
  5. Если баланса недостаточно → разрешаем отрицательный баланс + логируем

**Пример корректировки:**

```
Исходный заказ: 1000₽
Списано бонусов: 200₽
Начислено: (1000₽ - 200₽) × 3% = 24₽

Удалили позицию на 300₽:
Новая сумма заказа: 700₽
Новое начисление: (700₽ - 200₽) × 3% = 15₽
Корректировка: -9₽ (создаем adjustment транзакцию)
```

#### 5.4 Отрицательный баланс

**Допустимые случаи:**

- Отмена заказа после того как пользователь потратил начисленные бонусы
- Корректировка при удалении позиций из заказа

**Механизм:**

- Разрешаем баланс уйти в минус только в этих исключительных случаях
- Записываем событие в `loyalty_logs`:
  - `event_type`: `negative_balance`
  - `severity`: `warning`
  - Детали: user_id, order_id, сумма, причина

**Ограничения:**

- Пользователь с отрицательным балансом не может списывать бонусы в новых заказах
- При достаточном балансе ограничение автоматически снимается

### 6. Защита от дублирования транзакций

#### 6.1 Механизм блокировки

**Проблема:**

- При одновременных запросах может создаться несколько `earn` транзакций для одного заказа

**Решение:**

1. Добавить поля в таблицу `orders`:
   - `bonus_earn_amount` - зафиксированная сумма начисления
   - `bonus_earn_locked` - флаг блокировки (boolean)
2. При начислении бонусов:
   - Проверяем `bonus_earn_locked = FALSE`
   - Устанавливаем `bonus_earn_locked = TRUE` в одной транзакции БД
   - Если изменение не прошло (affected_rows = 0) → выходим, начисление уже было
3. Использовать транзакции БД с уровнем изоляции `SERIALIZABLE`
4. Блокировка записи через `SELECT ... FOR UPDATE`

#### 6.2 Проверка дублей

**Ежедневная проверка (cron):**

- Поиск заказов с несколькими `earn` транзакциями со статусом `completed`
- Логирование в `loyalty_logs` с типом `duplicate_transaction`
- Автоматическая отмена лишних транзакций (оставляем первую)

---

## Архитектура базы данных

### Схема таблиц

#### Таблица: `users`

**Назначение:** Основная информация о пользователях и их бонусном балансе

**Изменения в существующей таблице:**

```sql
-- Существующие поля остаются без изменений
bonus_balance DECIMAL(10,2) DEFAULT 0
loyalty_level INT DEFAULT 1
current_loyalty_level_id INT
total_spent DECIMAL(10,2) DEFAULT 0
loyalty_registered_at TIMESTAMP
registration_bonus_granted BOOLEAN DEFAULT FALSE
birthday_bonus_last_granted_year INT

-- Новые поля не требуются
```

#### Таблица: `loyalty_levels`

**Назначение:** Определение уровней лояльности

**Структура:**

```sql
CREATE TABLE loyalty_levels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  level_number INT NOT NULL,
  threshold_amount DECIMAL(10,2) NOT NULL,
  earn_percent DECIMAL(5,4) NOT NULL,
  max_spend_percent DECIMAL(5,4) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY unique_threshold (threshold_amount, deleted_at),
  INDEX idx_active_levels (is_active, deleted_at, sort_order),
  INDEX idx_threshold (threshold_amount)
);
```

**Особенности:**

- `threshold_amount` - уникальный для активных уровней
- `earn_percent` - хранится как decimal (0.03 для 3%)
- `max_spend_percent` - хранится как decimal (0.20 для 20%)
- `deleted_at` - для soft delete (NULL если не удален)
- `sort_order` - автоматически рассчитывается по threshold_amount

**Правила:**

- Первый уровень всегда имеет threshold_amount = 0
- Уровни сортируются по threshold_amount (ASC)
- Нельзя удалить уровень с пользователями

#### Таблица: `loyalty_transactions`

**Назначение:** История всех транзакций по бонусам

**Изменения в существующей таблице:**

```sql
-- Существующие поля
id BIGINT PRIMARY KEY AUTO_INCREMENT
user_id INT NOT NULL
order_id INT NULL
type ENUM('earn', 'spend', 'refund_earn', 'refund_spend', 'expire', 'register_bonus', 'birthday_bonus', 'adjustment') -- добавлен 'adjustment'
amount DECIMAL(10,2) NOT NULL
earned_at TIMESTAMP NULL
expires_at TIMESTAMP NULL
status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending'
cancels_transaction_id BIGINT NULL
description TEXT
metadata JSON
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

-- Индексы
INDEX idx_loyalty_user_status (user_id, status)
INDEX idx_loyalty_user_expires (user_id, expires_at)
INDEX idx_loyalty_order (order_id)
INDEX idx_loyalty_type_status (type, status)
```

**Типы транзакций:**

- `earn` - начисление за заказ
- `spend` - списание при оплате
- `refund_earn` - отмена начисления (не используется, вместо этого cancelled)
- `refund_spend` - возврат списанных (не используется, вместо этого cancelled)
- `expire` - истечение срока
- `register_bonus` - бонус за регистрацию
- `birthday_bonus` - бонус за день рождения
- `adjustment` - корректировка при изменении заказа (НОВЫЙ)

**Статусы:**

- `pending` - ожидает завершения
- `completed` - завершена
- `cancelled` - отменена

#### Таблица: `user_loyalty_levels`

**Назначение:** История изменения уровней пользователей

**Структура (без изменений):**

```sql
CREATE TABLE user_loyalty_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  level_id INT NOT NULL,
  reason ENUM('initial', 'threshold_reached', 'degradation') NOT NULL,
  triggered_by_order_id INT NULL,
  total_spent_amount DECIMAL(10,2),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,

  INDEX idx_user_current (user_id, ended_at),
  INDEX idx_level (level_id)
);
```

#### Таблица: `user_loyalty_stats`

**Назначение:** Статистика и кеш для оптимизации

**Структура (без изменений):**

```sql
CREATE TABLE user_loyalty_stats (
  user_id INT PRIMARY KEY,
  bonus_balance DECIMAL(10,2) DEFAULT 0,
  total_spent_60_days DECIMAL(10,2) DEFAULT 0,
  total_spent_all_time DECIMAL(10,2) DEFAULT 0,
  last_order_at TIMESTAMP NULL,
  last_level_check_at TIMESTAMP NULL,
  last_balance_reconciliation_at TIMESTAMP NULL,
  total_earned DECIMAL(10,2) DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  total_expired DECIMAL(10,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Примечание:** `total_spent_60_days` будет динамически рассчитываться на основе настройки "период расчета"

#### Таблица: `loyalty_settings`

**Назначение:** Глобальные настройки программы лояльности

**Изменения в существующей структуре:**

```sql
CREATE TABLE loyalty_settings (
  id INT PRIMARY KEY DEFAULT 1,

  -- Основные настройки
  is_enabled BOOLEAN DEFAULT TRUE,
  threshold_calculation_days INT DEFAULT 60,
  bonus_expiry_days INT DEFAULT 60,

  -- Настройки начисления
  include_delivery_in_earn BOOLEAN DEFAULT FALSE,
  calculate_from_amount_after_bonus BOOLEAN DEFAULT TRUE,

  -- Деградация
  degradation_enabled BOOLEAN DEFAULT TRUE,
  degradation_inactivity_days INT DEFAULT 180,

  -- Триггеры
  registration_bonus_enabled BOOLEAN DEFAULT TRUE,
  registration_bonus_amount INT DEFAULT 0,
  registration_bonus_expiry_days INT DEFAULT 60,

  birthday_bonus_enabled BOOLEAN DEFAULT TRUE,
  birthday_bonus_amount INT DEFAULT 0,
  birthday_bonus_expiry_days INT DEFAULT 60,
  birthday_bonus_days_before INT DEFAULT 0,
  birthday_bonus_days_after INT DEFAULT 7,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CHECK (id = 1)
);
```

**Новые поля:**

- `threshold_calculation_days` - период для расчета суммы заказов для уровня
- `degradation_enabled` - включение деградации уровня
- `degradation_inactivity_days` - период неактивности для деградации

#### Таблица: `loyalty_exclusions` (НОВАЯ)

**Назначение:** Исключения для списания бонусов

**Структура:**

```sql
CREATE TABLE loyalty_exclusions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type ENUM('category', 'product') NOT NULL,
  entity_id INT NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT,

  UNIQUE KEY unique_exclusion (type, entity_id),
  INDEX idx_type_entity (type, entity_id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

**Поля:**

- `type` - тип исключения (категория или товар)
- `entity_id` - ID категории или товара
- `reason` - причина исключения (опционально)
- `created_by` - ID администратора, создавшего исключение

#### Таблица: `orders` (изменения)

**Назначение:** Заказы с дополнительными полями для бонусов

**Новые поля:**

```sql
ALTER TABLE orders ADD COLUMN bonus_earn_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN bonus_earn_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD INDEX idx_bonus_locked (bonus_earn_locked);
```

**Поля:**

- `bonus_earn_amount` - зафиксированная сумма начисления при первом delivered
- `bonus_earn_locked` - флаг блокировки для защиты от дублирования

#### Таблица: `loyalty_logs`

**Назначение:** Логирование событий системы

**Структура (без изменений):**

```sql
CREATE TABLE loyalty_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_type ENUM('balance_mismatch', 'duplicate_transaction', 'cron_execution', 'error', 'race_condition', 'negative_balance') NOT NULL,
  severity ENUM('info', 'warning', 'error', 'critical') NOT NULL,
  user_id INT NULL,
  order_id INT NULL,
  transaction_id BIGINT NULL,
  message TEXT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_event_type (event_type, created_at),
  INDEX idx_severity (severity, created_at),
  INDEX idx_user (user_id)
);
```

**Новый тип события:**

- `negative_balance` - отрицательный баланс пользователя

### Связи между таблицами

```
users (1) ----< (N) loyalty_transactions
users (1) ----< (N) user_loyalty_levels
users (1) ---- (1) user_loyalty_stats

loyalty_levels (1) ----< (N) users [current_loyalty_level_id]
loyalty_levels (1) ----< (N) user_loyalty_levels

orders (1) ----< (N) loyalty_transactions
orders (1) ----< (N) user_loyalty_levels [triggered_by_order_id]

loyalty_settings (1) -- единственная запись

loyalty_exclusions (N) ---- (1) categories OR products [через entity_id]
```

---

## Бизнес-логика

### 1. Процесс создания заказа

**Шаги:**

1. Пользователь формирует корзину
2. Система показывает:
   - Текущий баланс бонусов
   - Максимально доступную сумму для списания (с учетом исключений)
   - Сколько бонусов начислится после заказа
3. Пользователь указывает количество бонусов для списания (слайдер)
4. Проверки при создании заказа:
   - Достаточность баланса
   - Соответствие максимальному проценту списания
   - Учет исключений (категории/товары)
5. Создание транзакции:
   - Тип: `spend`
   - Статус: `pending`
   - Сумма: округление вниз до целого рубля
6. Списание по принципу FIFO:
   - Выбираются бонусы с ближайшей датой истечения
   - Уменьшается остаток в соответствующих `earn` транзакциях
7. Обновление баланса пользователя
8. Инвалидация кеша бонусов в Redis

### 2. Процесс завершения заказа (первый delivered)

**Шаги:**

1. Заказ переводится в статус `delivered` или `completed`
2. Проверка блокировки начисления:
   - SELECT ... FOR UPDATE на запись orders
   - Проверка `bonus_earn_locked = FALSE`
3. Установка блокировки:
   - UPDATE orders SET bonus_earn_locked = TRUE
   - Если affected_rows = 0 → выход (начисление уже было)
4. Расчет суммы начисления:
   - База = сумма заказа - доставка (опционально) - бонусы (опционально)
   - Сумма = база × процент начисления уровня
   - Округление вниз до целого рубля
5. Сохранение суммы:
   - UPDATE orders SET bonus*earn_amount = рассчитанная*сумма
6. Создание транзакции:
   - Тип: `earn`
   - Статус: `completed`
   - Дата истечения: текущая дата + срок действия бонусов
7. Обновление транзакции списания:
   - UPDATE loyalty_transactions SET status = 'completed' WHERE order_id AND type = 'spend'
8. Обновление баланса пользователя
9. Обновление `user_loyalty_stats`
10. Проверка изменения уровня пользователя
11. Отправка WebSocket уведомления

### 3. Процесс отката статуса (delivered → другой)

**Шаги:**

1. Заказ переводится из `delivered` в любой другой статус
2. Поиск активной `earn` транзакции:
   - WHERE order_id = X AND type = 'earn' AND status = 'completed'
3. Отмена транзакции:
   - UPDATE status = 'cancelled'
4. Обновление баланса:
   - Уменьшение на сумму отмененного начисления
5. Обновление `user_loyalty_stats`
6. Проверка изменения уровня (возможное понижение)
7. Логирование в `loyalty_logs`

### 4. Процесс повторного завершения

**Шаги:**

1. Заказ снова переводится в `delivered`
2. Проверка наличия зафиксированной суммы:
   - SELECT bonus_earn_amount FROM orders WHERE id = X
3. Создание новой транзакции:
   - Тип: `earn`
   - Сумма: берется из `orders.bonus_earn_amount` (НЕ пересчитывается)
   - Статус: `completed`
   - Дата истечения: новая (текущая дата + срок)
4. Обновление баланса
5. Обновление статистики
6. Проверка уровня
7. WebSocket уведомление

### 5. Процесс отмены заказа

**Сценарий A: Отмена после delivered**

**Шаги:**

1. Заказ переводится в статус `cancelled`
2. Поиск всех транзакций заказа:
   - SELECT \* FROM loyalty_transactions WHERE order_id = X AND status != 'cancelled'
3. Отмена всех транзакций:
   - UPDATE status = 'cancelled' для всех найденных
4. Расчет изменения баланса:
   - Возврат списанных: +spend.amount
   - Отмена начисленных: -earn.amount
   - Итоговое изменение = spend.amount - earn.amount
5. Проверка результата:
   - Если новый баланс < 0:
     - Разрешаем отрицательный баланс
     - Записываем в `loyalty_logs`:
       - event_type: `negative_balance`
       - severity: `warning`
       - details: {user_id, order_id, amount, reason: 'order_cancelled'}
6. Обновление баланса пользователя
7. Обновление `user_loyalty_stats`
8. Проверка уровня (возможное понижение)

**Сценарий B: Отмена до delivered**

**Шаги:**

1. Поиск транзакции списания:
   - SELECT \* FROM loyalty_transactions WHERE order_id = X AND type = 'spend'
2. Отмена:
   - UPDATE status = 'cancelled'
3. Возврат бонусов:
   - Восстановление остатков в `earn` транзакциях (FIFO в обратном порядке)
4. Обновление баланса: +spend.amount
5. Обновление статистики

### 6. Изменение состава заказа после delivered

**Шаги:**

1. Администратор удаляет позицию из заказа
2. Пересчет суммы заказа
3. Пересчет начисления:
   - Новая база = новая сумма - доставка - бонусы
   - Новое начисление = новая база × процент
   - Округление вниз
4. Сравнение с исходным:
   - Разница = новое начисление - orders.bonus_earn_amount
5. Создание корректирующей транзакции:
   - Тип: `adjustment`
   - Сумма: разница (может быть отрицательной)
   - Статус: `completed`
6. Проверка баланса при отрицательной корректировке:
   - Если баланс < сумма корректировки:
     - Разрешаем отрицательный баланс
     - Логируем `negative_balance`
7. Обновление баланса
8. Обновление `orders.bonus_earn_amount` на новое значение
9. Обновление статистики

### 7. Проверка и изменение уровня

**Триггеры проверки:**

- При завершении заказа (delivered)
- При отмене заказа
- Раз в сутки (cron) для всех пользователей

**Алгоритм:**

1. Получение периода расчета:
   - SELECT threshold_calculation_days FROM loyalty_settings
2. Расчет суммы заказов:
   - SELECT SUM(total_after_bonuses) FROM orders
   - WHERE user_id = X
   - AND status IN ('delivered', 'completed')
   - AND created_at >= NOW() - INTERVAL threshold_calculation_days DAY
3. Определение подходящего уровня:
   - SELECT \* FROM loyalty_levels
   - WHERE threshold*amount <= рассчитанная*сумма
   - AND is_active = TRUE
   - AND deleted_at IS NULL
   - ORDER BY threshold_amount DESC
   - LIMIT 1
4. Сравнение с текущим уровнем:
   - Если уровни совпадают → выход
5. Изменение уровня:
   - Закрытие текущей записи:
     - UPDATE user_loyalty_levels SET ended_at = NOW() WHERE user_id = X AND ended_at IS NULL
   - Создание новой записи:
     - INSERT INTO user_loyalty_levels (user_id, level_id, reason, triggered_by_order_id, total_spent_amount)
   - Обновление пользователя:
     - UPDATE users SET loyalty*level = новый*номер, current_loyalty_level_id = новый_id
6. Определение причины:
   - `threshold_reached` - если повышение или первое назначение
   - `degradation` - если понижение
7. Логирование в `loyalty_logs`
8. WebSocket уведомление

### 8. Деградация уровня (cron задача)

**Условие выполнения:**

- `loyalty_settings.degradation_enabled = TRUE`

**Периодичность:**

- Раз в сутки (например, в 03:00)

**Алгоритм:**

1. Получение параметров:
   - SELECT degradation_inactivity_days FROM loyalty_settings
2. Поиск неактивных пользователей:
   - SELECT user_id, current_loyalty_level_id FROM users
   - WHERE loyalty_level > 1 (не на минимальном уровне)
   - AND last_order_delivered_at < NOW() - INTERVAL degradation_inactivity_days DAY
3. Для каждого пользователя:
   - Определение предыдущего уровня:
     - SELECT \* FROM loyalty_levels
     - WHERE level*number = текущий*номер - 1
     - AND is_active = TRUE
     - AND deleted_at IS NULL
   - Если предыдущий уровень существует:
     - Понижение на 1 уровень (вызов функции изменения уровня)
     - Причина: `degradation`
4. Логирование выполнения:
   - INSERT INTO loyalty_logs (event_type: 'cron_execution', ...)

### 9. Истечение бонусов (cron задача)

**Периодичность:**

- Раз в сутки (например, в 04:00)

**Алгоритм:**

1. Поиск истекших бонусов:
   - SELECT \* FROM loyalty_transactions
   - WHERE type = 'earn'
   - AND status = 'completed'
   - AND expires_at < NOW()
   - AND amount > 0
2. Для каждой транзакции:
   - Создание транзакции истечения:
     - Тип: `expire`
     - Сумма: остаток в earn транзакции
     - Статус: `completed`
   - Обнуление остатка:
     - UPDATE loyalty_transactions SET amount = 0
   - Обновление баланса пользователя
3. Обновление статистики:
   - UPDATE user_loyalty_stats SET total_expired += сумма
4. Логирование

### 10. Автоматические начисления

**Бонус за регистрацию:**

**Условие:**

- `loyalty_settings.registration_bonus_enabled = TRUE`
- `users.registration_bonus_granted = FALSE`

**Момент:**

- При регистрации в программе лояльности

**Алгоритм:**

1. Проверка условий
2. Создание транзакции:
   - Тип: `register_bonus`
   - Сумма: `loyalty_settings.registration_bonus_amount`
   - Срок: NOW() + registration_bonus_expiry_days
   - Статус: `completed`
3. Обновление баланса
4. Установка флага:
   - UPDATE users SET registration_bonus_granted = TRUE
5. WebSocket уведомление

**Бонус за день рождения:**

**Условие:**

- `loyalty_settings.birthday_bonus_enabled = TRUE`
- Текущий год != `users.birthday_bonus_last_granted_year`
- Текущая дата в диапазоне: ДР - days_before ... ДР + days_after

**Момент:**

- Проверка раз в сутки (cron) или при логине пользователя

**Алгоритм:**

1. Получение пользователей с ДР в диапазоне
2. Для каждого:
   - Проверка что не начислялся в этом году
   - Создание транзакции:
     - Тип: `birthday_bonus`
     - Сумма: `loyalty_settings.birthday_bonus_amount`
     - Срок: NOW() + birthday_bonus_expiry_days
   - Обновление года:
     - UPDATE users SET birthday*bonus_last_granted_year = текущий*год
3. WebSocket уведомление

---

## API спецификация

### Клиентские эндпоинты

#### GET /api/bonuses/balance

**Описание:** Получение текущего баланса бонусов

**Аутентификация:** JWT токен (обязательна)

**Параметры:** нет

**Ответ:**

```json
{
  "balance": 1500
}
```

**Кеширование:** Redis, TTL 60 секунд

---

#### GET /api/bonuses/history

**Описание:** История транзакций бонусов

**Аутентификация:** JWT токен

**Параметры запроса:**

- `limit` (integer, optional) - количество записей, по умолчанию 50
- `offset` (integer, optional) - смещение для пагинации, по умолчанию 0

**Ответ:**

```json
{
  "history": [
    {
      "id": 123,
      "order_id": 456,
      "order_number": "ORD-2026-001",
      "type": "earn",
      "amount": 100,
      "expires_at": "2026-03-15T12:00:00Z",
      "created_at": "2026-01-15T12:00:00Z",
      "status": "completed"
    },
    {
      "id": 124,
      "order_id": 456,
      "type": "spend",
      "amount": -200,
      "created_at": "2026-01-15T11:00:00Z",
      "status": "completed"
    }
  ],
  "total": 150
}
```

---

#### POST /api/bonuses/calculate-usable

**Описание:** Расчет максимальной суммы бонусов для заказа

**Аутентификация:** JWT токен

**Тело запроса:**

```json
{
  "order_items": [
    {
      "product_id": 123,
      "category_id": 5,
      "price": 500,
      "quantity": 1
    },
    {
      "product_id": 125,
      "category_id": 8,
      "price": 1000,
      "quantity": 1
    }
  ]
}
```

**Ответ:**

```json
{
  "user_balance": 1500,
  "order_subtotal": 1500,
  "excluded_amount": 1000,
  "eligible_amount": 500,
  "max_usable_for_order": 100,
  "available_to_use": 100,
  "excluded_items": [
    {
      "product_id": 125,
      "reason": "category_excluded"
    }
  ]
}
```

**Логика:**

1. Получить баланс пользователя
2. Получить текущий уровень и max_spend_percent
3. Получить список исключений из `loyalty_exclusions`
4. Отфильтровать позиции заказа:
   - Исключить товары/категории из списка исключений
   - Рассчитать eligible_amount
5. Рассчитать максимум:
   - max_for_order = eligible_amount × max_spend_percent
   - Округление вниз
6. Результат: min(user_balance, max_for_order)

---

#### GET /api/bonuses/loyalty-info

**Описание:** Информация о программе лояльности и текущем уровне пользователя

**Аутентификация:** JWT токен

**Ответ:**

```json
{
  "current_level": {
    "id": 2,
    "name": "Серебро",
    "level_number": 2,
    "earn_percent": 5,
    "max_spend_percent": 25
  },
  "user_stats": {
    "total_spent_for_level": 12500,
    "current_level_threshold": 10000,
    "next_level_threshold": 20000,
    "progress_percent": 50
  },
  "balance": {
    "current": 1500,
    "total_earned": 5000,
    "total_spent": 3000,
    "total_expired": 500
  },
  "expiring_soon": [
    {
      "amount": 200,
      "expires_at": "2026-02-05T00:00:00Z",
      "days_left": 12
    }
  ],
  "all_levels": [
    {
      "id": 1,
      "name": "Бронза",
      "threshold": 0,
      "earn_percent": 3,
      "max_spend_percent": 20
    },
    {
      "id": 2,
      "name": "Серебро",
      "threshold": 10000,
      "earn_percent": 5,
      "max_spend_percent": 25
    }
  ]
}
```

---

### Административные эндпоинты

#### GET /api/admin/loyalty/levels

**Описание:** Список всех уровней лояльности

**Аутентификация:** JWT, роль admin/manager/ceo

**Ответ:**

```json
{
  "levels": [
    {
      "id": 1,
      "name": "Бронза",
      "level_number": 1,
      "threshold_amount": 0,
      "earn_percent": 3,
      "max_spend_percent": 20,
      "is_active": true,
      "user_count": 150,
      "can_delete": false,
      "can_disable": false
    }
  ]
}
```

---

#### POST /api/admin/loyalty/levels

**Описание:** Создание нового уровня

**Аутентификация:** JWT, роль admin/ceo

**Тело запроса:**

```json
{
  "name": "Платина",
  "threshold_amount": 50000,
  "earn_percent": 10,
  "max_spend_percent": 40,
  "is_active": true
}
```

**Валидация:**

- `threshold_amount` должен быть уникальным
- `earn_percent` и `max_spend_percent` > 0
- `name` обязательно

**Ответ:**

```json
{
  "success": true,
  "level": {
    "id": 5,
    "name": "Платина",
    ...
  }
}
```

---

#### PUT /api/admin/loyalty/levels/:id

**Описание:** Редактирование уровня

**Аутентификация:** JWT, роль admin/ceo

**Тело запроса:**

```json
{
  "name": "Платина Премиум",
  "threshold_amount": 60000,
  "earn_percent": 12,
  "max_spend_percent": 45
}
```

**Валидация:**

- Нельзя изменить threshold на существующий у другого уровня
- Нельзя изменить первый уровень (threshold = 0) на другой порог

**Ответ:**

```json
{
  "success": true,
  "level": {...}
}
```

---

#### DELETE /api/admin/loyalty/levels/:id

**Описание:** Удаление уровня

**Аутентификация:** JWT, роль admin/ceo

**Проверки:**

1. Есть ли пользователи на этом уровне
2. Есть ли записи в истории

**Ответ при успехе:**

```json
{
  "success": true,
  "message": "Уровень удален"
}
```

**Ответ при ошибке:**

```json
{
  "success": false,
  "error": "Невозможно удалить уровень. На нём сейчас 15 пользователей"
}
```

---

#### GET /api/admin/loyalty/settings

**Описание:** Получение настроек системы лояльности

**Аутентификация:** JWT, роль admin/manager/ceo

**Ответ:**

```json
{
  "settings": {
    "is_enabled": true,
    "threshold_calculation_days": 60,
    "bonus_expiry_days": 60,
    "include_delivery_in_earn": false,
    "calculate_from_amount_after_bonus": true,
    "degradation_enabled": true,
    "degradation_inactivity_days": 180,
    "registration_bonus_enabled": true,
    "registration_bonus_amount": 500,
    "registration_bonus_expiry_days": 60,
    "birthday_bonus_enabled": true,
    "birthday_bonus_amount": 1000,
    "birthday_bonus_expiry_days": 30,
    "birthday_bonus_days_before": 0,
    "birthday_bonus_days_after": 7
  }
}
```

---

#### PUT /api/admin/loyalty/settings

**Описание:** Обновление настроек

**Аутентификация:** JWT, роль admin/ceo

**Тело запроса:**

```json
{
  "threshold_calculation_days": 90,
  "degradation_enabled": false,
  "registration_bonus_amount": 1000
}
```

**Валидация:**

- Все числовые поля должны быть >= 0
- `threshold_calculation_days` >= 1

**Ответ:**

```json
{
  "success": true,
  "settings": {...}
}
```

---

#### GET /api/admin/loyalty/exclusions

**Описание:** Список исключений для списания бонусов

**Аутентификация:** JWT, роль admin/manager/ceo

**Ответ:**

```json
{
  "exclusions": [
    {
      "id": 1,
      "type": "category",
      "entity_id": 8,
      "entity_name": "Алкоголь",
      "reason": "Законодательные ограничения",
      "created_at": "2026-01-15T10:00:00Z",
      "created_by": "admin@example.com"
    },
    {
      "id": 2,
      "type": "product",
      "entity_id": 245,
      "entity_name": "Виски Jack Daniels",
      "reason": null,
      "created_at": "2026-01-16T11:00:00Z",
      "created_by": "admin@example.com"
    }
  ]
}
```

---

#### POST /api/admin/loyalty/exclusions

**Описание:** Добавление исключения

**Аутентификация:** JWT, роль admin/ceo

**Тело запроса:**

```json
{
  "type": "category",
  "entity_id": 8,
  "reason": "Законодательные ограничения"
}
```

**Валидация:**

- `type` должен быть 'category' или 'product'
- `entity_id` должен существовать в соответствующей таблице
- Проверка уникальности (type, entity_id)

**Ответ:**

```json
{
  "success": true,
  "exclusion": {
    "id": 3,
    ...
  }
}
```

---

#### DELETE /api/admin/loyalty/exclusions/:id

**Описание:** Удаление исключения

**Аутентификация:** JWT, роль admin/ceo

**Ответ:**

```json
{
  "success": true,
  "message": "Исключение удалено"
}
```

---

#### GET /api/admin/loyalty/users/:userId

**Описание:** Детальная информация о пользователе в программе лояльности

**Аутентификация:** JWT, роль admin/manager/ceo

**Ответ:**

```json
{
  "user": {
    "id": 123,
    "name": "Иван Петров",
    "phone": "+79991234567",
    "loyalty_level": {
      "id": 2,
      "name": "Серебро",
      "level_number": 2
    }
  },
  "stats": {
    "balance": 1500,
    "total_spent_period": 12500,
    "period_days": 60,
    "total_earned": 5000,
    "total_spent": 3000,
    "total_expired": 500,
    "last_order_at": "2026-01-20T15:30:00Z"
  },
  "transactions": [
    {
      "id": 123,
      "type": "earn",
      "amount": 100,
      "order_id": 456,
      "created_at": "2026-01-15T12:00:00Z",
      "expires_at": "2026-03-15T12:00:00Z",
      "status": "completed"
    }
  ],
  "level_history": [
    {
      "level_name": "Серебро",
      "started_at": "2025-12-01T10:00:00Z",
      "ended_at": null,
      "reason": "threshold_reached"
    }
  ]
}
```

---

#### POST /api/admin/loyalty/users/:userId/adjust-balance

**Описание:** Ручная корректировка баланса пользователя

**Аутентификация:** JWT, роль admin/ceo

**Тело запроса:**

```json
{
  "mode": "add",
  "amount": 500,
  "reason": "Компенсация за ошибку доставки"
}
```

**Параметры:**

- `mode`: "add" (добавить) или "set" (установить)
- `amount`: сумма (положительная или отрицательная для "add")
- `reason`: причина корректировки

**Логика:**

- Если mode = "add" и amount > 0 → создать транзакцию earn
- Если mode = "add" и amount < 0 → списать бонусы по FIFO
- Если mode = "set" → рассчитать разницу и применить

**Ответ:**

```json
{
  "success": true,
  "new_balance": 2000,
  "transaction_id": 789
}
```

---

#### GET /api/admin/loyalty/logs

**Описание:** Логи системы лояльности

**Аутентификация:** JWT, роль admin/ceo

**Параметры запроса:**

- `limit` (integer) - количество записей, по умолчанию 50
- `event_type` (string, optional) - фильтр по типу события
- `severity` (string, optional) - фильтр по уровню

**Ответ:**

```json
{
  "logs": [
    {
      "id": 1,
      "event_type": "balance_mismatch",
      "severity": "warning",
      "message": "Расхождение баланса для пользователя 123",
      "user_id": 123,
      "created_at": "2026-01-24T10:00:00Z"
    }
  ],
  "total": 150
}
```

---

#### GET /api/admin/loyalty/audit

**Описание:** Аудит целостности данных

**Аутентификация:** JWT, роль admin/ceo

**Ответ:**

```json
{
  "duplicate_transactions": [
    {
      "order_id": 456,
      "type": "earn",
      "count": 2
    }
  ],
  "balance_mismatches": [
    {
      "user_id": 123,
      "db_balance": 1500,
      "calculated_balance": 1450,
      "difference": 50
    }
  ],
  "negative_balances": [
    {
      "user_id": 125,
      "balance": -200,
      "last_order": "2026-01-20"
    }
  ]
}
```

---

## Интерфейс администратора

### Структура админ-панели

**Раздел: "Система лояльности"**

Вкладки:

1. Уровни лояльности
2. Настройки
3. Исключения
4. Логи
5. Аудит

---

### Вкладка 1: Уровни лояльности

**Отображение:**

Таблица с колонками:

- Название уровня
- Порог (₽)
- Начисление (%)
- Макс. списание (%)
- Статус (вкл/выкл)
- Пользователей (количество)
- Действия (кнопки)

**Функционал:**

1. **Кнопка "Создать уровень"**
   - Открывает модальное окно
   - Поля:
     - Название (текст)
     - Порог достижения (число, рубли)
     - Процент начисления (число, целое, например 3 для 3%)
     - Максимальный процент списания (число, целое, например 20 для 20%)
     - Активен (чекбокс, по умолчанию вкл)
   - Валидация:
     - Порог должен быть уникальным
     - Все проценты > 0
   - Кнопки: "Создать", "Отмена"

2. **Кнопка "Редактировать"** (у каждого уровня)
   - Открывает модальное окно с теми же полями
   - Предзаполненные значения
   - Валидация при сохранении
   - Кнопки: "Сохранить", "Отмена"

3. **Кнопка "Удалить"** (у каждого уровня)
   - Неактивна если:
     - Есть пользователи на уровне
     - Есть записи в истории
   - При наличии пользователей:
     - Tooltip: "Невозможно удалить. Пользователей: X"
   - При клике (если активна):
     - Подтверждение: "Вы уверены что хотите удалить уровень [Название]?"
     - Кнопки: "Удалить", "Отмена"

4. **Переключатель "Вкл/Выкл"**
   - Неактивен если есть пользователи на уровне
   - При изменении статуса:
     - Подтверждение если есть пользователи
     - Автоматическое сохранение

**Сортировка:**

- По возрастанию порога (автоматическая)

**Индикаторы:**

- Первый уровень (порог 0) - бейдж "Стартовый"
- Неактивные уровни - серый цвет

---

### Вкладка 2: Настройки

**Структура:**

**Секция: Общие настройки**

- **Включить систему лояльности** (переключатель в системной настройке)
  - При выключении: скрываются бонусы в клиентском приложении
  - История и балансы сохраняются

- **Период расчета суммы для уровня** (поле ввода, число)
  - Label: "Количество дней для расчета порога уровня"
  - Placeholder: "60"
  - Подсказка: "За этот период считается сумма заказов для определения уровня"

- **Срок действия бонусов** (поле ввода, число)
  - Label: "Срок действия начисленных бонусов (дней)"
  - Placeholder: "60"

**Секция: Начисление бонусов**

- **Учитывать стоимость доставки** (чекбокс)
  - Label: "Включать доставку в сумму для начисления"

- **Расчет после списания бонусов** (чекбокс)
  - Label: "Начислять от суммы после вычета бонусов"
  - Подсказка: "Если включено: от (сумма - бонусы), если выключено: от полной суммы"

**Секция: Деградация уровня**

- **Включить деградацию** (переключатель)

- **Период неактивности** (поле ввода, число, активно если деградация вкл)
  - Label: "Дней без заказов для понижения уровня"
  - Placeholder: "180"
  - Подсказка: "При отсутствии завершенных заказов пользователь понижается на 1 уровень"

**Секция: Бонус за регистрацию**

- **Включить** (переключатель)

- **Сумма бонуса** (поле ввода, число, активно если включено)
  - Label: "Бонусов за регистрацию"
  - Placeholder: "500"

- **Срок действия** (поле ввода, число, активно если включено)
  - Label: "Срок действия (дней)"
  - Placeholder: "60"

**Секция: Бонус за день рождения**

- **Включить** (переключатель)

- **Сумма бонуса** (поле ввода, число, активно если включено)
  - Label: "Бонусов за день рождения"
  - Placeholder: "1000"

- **Дней до дня рождения** (поле ввода, число)
  - Label: "За сколько дней до ДР начислять"
  - Placeholder: "0"

- **Доступно дней после дня рождения** (поле ввода, число)
  - Label: "В течение скольких дней после ДР будет действовать"
  - Placeholder: "7"

**Кнопки:**

- "Сбросить" - загрузить настройки заново
- "Сохранить" - сохранить изменения

---

### Вкладка 3: Исключения

**Отображение:**

Таблица с колонками:

- Тип (Категория / Товар)
- Название
- Причина
- Дата добавления
- Кем добавлено
- Действия

**Функционал:**

1. **Кнопка "Добавить исключение"**
   - Открывает модальное окно
   - Поля:
     - Тип (select): "Категория" / "Товар"
     - Выбор категории/товара (select с поиском, зависит от типа)
     - Причина (textarea, опционально)
   - Валидация:
     - Проверка уникальности (тип + entity_id)
   - Кнопки: "Добавить", "Отмена"

2. **Кнопка "Удалить"** (у каждого исключения)
   - Подтверждение: "Удалить исключение для [Название]?"
   - Кнопки: "Удалить", "Отмена"

**Фильтры:**

- По типу (все / категории / товары)
- Поиск по названию

---

### Вкладка 4: Логи

**Отображение:**

Таблица с колонками:

- Дата и время
- Тип события
- Уровень
- Сообщение
- Детали (кнопка для раскрытия JSON)

**Фильтры:**

- По типу события (select)
- По уровню серьезности (select)
- По дате (date range picker)

**Функционал:**

- Отображение последних 50 записей
- Пагинация
- Кнопка "Обновить"
- Автообновление каждые 30 секунд (опционально)

---

### Вкладка 5: Аудит

**Секция: Дубликаты транзакций**

Таблица:

- ID заказа
- Тип транзакции
- Количество дублей
- Действие (кнопка "Исправить")

**Секция: Расхождения балансов**

Таблица:

- ID пользователя
- Имя
- Баланс в БД
- Расчетный баланс
- Разница
- Действие (кнопка "Пересчитать")

**Секция: Отрицательные балансы**

Таблица:

- ID пользователя
- Имя
- Баланс
- Последний заказ
- Причина

**Кнопка "Запустить полный аудит"**

- Запускает проверку всех пользователей
- Показывает прогресс
- Отображает результаты

---

### Карточка клиента (дополнение к существующей)

**Новый раздел: "Бонусы и лояльность"**

**Информация:**

- Текущий уровень (название, бейдж с цветом)
- Баланс бонусов (крупным шрифтом)
- Сумма заказов за период (с указанием периода)
- Прогресс до следующего уровня:
  - Прогресс-бар
  - "5,669₽ из 10,000₽"
  - "До уровня [Название] осталось 4,331₽"

**Статистика:**

- Всего начислено: 5,000₽
- Всего списано: 3,000₽
- Истекло: 500₽

**История транзакций:**

Таблица:

- Дата
- Тип (начислено / списано / истекло / автоначисление)
- Сумма (+ зеленый / - красный)
- Заказ (номер, ссылка)
- Статус

Пагинация, показывать последние 20 записей

**Кнопка "Корректировка баланса"**

- Открывает модальное окно
- Поля:
  - Режим (select): "Добавить" / "Установить"
  - Сумма (число, может быть отрицательным для "Добавить")
  - Причина (textarea, обязательно)
- Подтверждение при отрицательной корректировке
- Кнопки: "Применить", "Отмена"

---

### Карточка заказа (дополнение к существующей)

**Новый раздел: "Бонусы"**

**Отображение:**

- Списано бонусов: 200₽ (если было списание)
- Начислено бонусов: 24₽ (если было начисление)
- Корректировки: -9₽ (если были adjustment)

**Статусы транзакций:**

- Списание: pending (желтый) / completed (зеленый) / cancelled (серый)
- Начисление: completed (зеленый) / cancelled (серый)

**При изменении статуса заказа:**

- Подсказка если статус влияет на бонусы
- Например, при отмене: "Внимание: будут отменены начисления и возвращены списания бонусов"

---

## Интерфейс клиента

### Страница "Бонусы и уровни"

**Структура:**

#### Секция 1: Текущий статус (верхняя карточка)

**Элементы:**

1. **Баланс бонусов** (центр, крупный текст)
   - Число с анимацией
   - Подпись: "доступно бонусов"

2. **Текущий уровень** (бейдж с иконкой)
   - Название уровня
   - Иконка уровня (бронза/серебро/золото и т.д.)
   - Цвет в зависимости от уровня

3. **Преимущества уровня** (список)
   - "Начисление: 5%"
   - "Списание до: 25%"

#### Секция 2: Прогресс до следующего уровня

**Элементы:**

1. **Прогресс-бар**
   - Заполнение в процентах
   - Анимация при загрузке

2. **Текстовая информация**
   - Над прогресс-баром: "5,669₽ из 10,000₽"
   - Под прогресс-баром: "До уровня Золото осталось 4,331₽ за следующие 45 дней"

3. **Карточка следующего уровня** (справа или снизу)
   - Иконка уровня (затемненная)
   - Название
   - Преимущества:
     - "Начисление: 7%"
     - "Списание до: 30%"

#### Секция 3: Все уровни (кнопка с ! рядом с названием текущего уровня и по нажатию открывается модальное окно)

**Отображение:**

Список всех уровней в таблице:

Каждая строчка содержит:

- Название уровня
- Иконка
- Порог достижения: "от 10,000₽ за 60 дней"
- Преимущества:
  - Начисление бонусов
  - Максимальное списание

Данные уровней берутся с настроек лояльности и при смене в настройках условий или порога, меняется и здесь.

**Индикация:**

- Текущий уровень: выделен цветом, бейдж "Ваш уровень"
- Достигнутые ранее: галочка
- Будущие: серый цвет

#### Секция 4: Скоро сгорят

**Элементы:**

Предупреждение (если есть истекающие бонусы):

- Иконка предупреждения (желтая/оранжевая)
- Текст: "200 бонусов сгорят через 12 дней"

Список (если несколько истекающих):

- Сумма | Дата истечения | Дней осталось
- Сортировка по дате (ближайшие первые)

#### Секция 5: История транзакций

**Элементы:**

Таблица/список:

- Дата и время
- Тип транзакции (иконка + текст):
  - Начислено (зеленый +)
  - Списано (красный -)
  - Истекло (серый)
  - Автоначисление (синий +)
- Сумма (с цветом)
- Заказ (номер, ссылка если есть)
- Срок действия (для начислений)
  - "Истекает: 15.03.2026"
  - "Истек" (серый)

**Пагинация:**

- Показывать по 20 записей
- Кнопка "Загрузить еще"

### Интеграция с корзиной (существующий функционал)

**Важно:** Этот функционал уже реализован, не ломаем его.

**Элементы:**

1. **Отображение баланса**
   - "У вас 1,500 бонусов"
   - Ссылка на страницу "Бонусы и уровни"

2. **Слайдер списания бонусов**
   - Минимум: 0
   - Максимум: рассчитывается через API (с учетом исключений)
   - Шаг: 1 рубль
   - Live обновление итоговой суммы

3. **Информация о начислении**
   - "После заказа вам начислится +24₽"
   - Обновляется при изменении слайдера

4. **Предупреждения**
   - Если есть исключенные позиции:
     - "Бонусы недоступны для списания на позиции: [список]"
   - Если весь заказ из исключений:
     - "Бонусы недоступны для списания на данные позиции"

---

## Технические требования

### Производительность

1. **Кеширование:**
   - Баланс пользователя: Redis, TTL 60 секунд
   - Настройки лояльности: Redis, TTL 10 минут
   - Уровни лояльности: Redis, TTL 5 минут
   - Инвалидация при изменениях

2. **Индексы БД:**
   - Все внешние ключи проиндексированы
   - Composite индексы для частых запросов
   - Индексы на поля фильтрации и сортировки

3. **Оптимизация запросов:**
   - Использование JOIN вместо множественных запросов
   - Агрегация на уровне БД
   - Пагинация для больших списков

### Безопасность

1. **Аутентификация и авторизация:**
   - JWT токены для клиентов
   - Проверка ролей для админских эндпоинтов
   - Rate limiting на API

2. **Валидация:**
   - Все входные данные валидируются
   - Проверка диапазонов для числовых полей
   - Защита от SQL injection (параметризованные запросы)
   - Защита от XSS (экранирование вывода)

3. **Транзакции:**
   - Все операции с бонусами в транзакциях БД
   - Уровень изоляции: SERIALIZABLE для критичных операций
   - Использование SELECT ... FOR UPDATE для блокировок

4. **Логирование:**
   - Все изменения в настройках логируются
   - Логирование подозрительной активности
   - Запись администратора выполнившего действие

### Надежность

1. **Обработка ошибок:**
   - Try-catch для всех операций с БД
   - Откат транзакций при ошибках
   - Информативные сообщения об ошибках

2. **Защита от race conditions:**
   - Флаг блокировки `bonus_earn_locked` в заказах
   - Atomic операции обновления
   - Проверка affected_rows

3. **Мониторинг:**
   - Логирование дублей транзакций
   - Алерты при расхождении балансов
   - Отслеживание отрицательных балансов

4. **Cron задачи:**
   - Истечение бонусов: ежедневно в 04:00
   - Деградация уровней: ежедневно в 03:00
   - Аудит целостности: ежедневно в 05:00
   - Обработка ДР бонусов: ежедневно в 02:00

### Совместимость

1. **База данных:**
   - MySQL 8.0+ или MariaDB 10.5+
   - Поддержка JSON полей
   - Поддержка транзакций InnoDB

2. **Backend:**
   - Node.js 18+
   - Совместимость с существующим кодом
   - Миграции для изменений схемы БД

3. **Frontend:**
   - Vue 3
   - Совместимость с существующей админ панелью
   - Адаптивный дизайн для мобильных

### Масштабируемость

1. **Партицирование:**
   - Таблица `loyalty_transactions` - партицирование по месяцам (опционально)
   - Архивация старых данных (>1 год)

2. **Кеширование:**
   - Redis для часто запрашиваемых данных
   - Cache warming для популярных запросов

3. **Оптимизация:**
   - Batch операции для cron задач
   - Асинхронные задачи где возможно

---

## Миграции базы данных

### Последовательность выполнения:

1. **Изменение таблицы `loyalty_levels`:**
   - Добавление поля `deleted_at`
   - Изменение constraint на `threshold_amount` (уникальность с учетом deleted_at)

2. **Изменение таблицы `loyalty_settings`:**
   - Добавление полей:
     - `threshold_calculation_days`
     - `degradation_enabled`
     - `degradation_inactivity_days`

3. **Создание таблицы `loyalty_exclusions`:**
   - Создание структуры
   - Индексы

4. **Изменение таблицы `orders`:**
   - Добавление `bonus_earn_amount`
   - Добавление `bonus_earn_locked`
   - Добавление индекса

5. **Изменение enum в `loyalty_transactions`:**
   - Добавление типа `adjustment`

6. **Изменение enum в `loyalty_logs`:**
   - Добавление типа события `negative_balance`

7. **Заполнение данных по умолчанию:**
   - Установка значений в `loyalty_settings` для новых полей

---

## Этапы разработки

### Этап 1: Backend (база данных и API)

**Задачи:**

1. Создание и применение миграций БД
2. Обновление моделей данных
3. Реализация бизнес-логики:
   - Процесс начисления с фиксацией суммы
   - Логика смены статусов (откаты, повторы)
   - Корректировки при изменении заказа
   - Защита от дублирования
4. Реализация API эндпоинтов:
   - CRUD для уровней
   - CRUD для исключений
   - Обновленные настройки
   - Расчет с учетом исключений
5. Обновление cron задач:
   - Деградация с настраиваемым периодом
   - Аудит целостности

### Этап 2: Админ панель

**Задачи:**

1. Вкладка "Уровни лояльности":
   - CRUD интерфейс
   - Валидация
   - Проверки удаления
2. Вкладка "Настройки":
   - Форма с новыми полями
   - Логика вкл/выкл секций
3. Вкладка "Исключения":
   - CRUD интерфейс
   - Селекты с поиском
4. Обновление карточки клиента:
   - Раздел бонусов
   - Корректировка баланса
5. Обновление карточки заказа:
   - Отображение бонусных операций

### Этап 3: Клиентское приложение

**Задачи:**

1. Страница "Бонусы и уровни":
   - Все секции согласно макету
   - Адаптивный дизайн
2. Обновление корзины:
   - Интеграция с API исключений
   - Обновление логики расчета
3. Интеграция с существующим функционалом

---
