# Промпт для Copilot: Исправление логики начисления/списания бонусов

## Контекст
Система онлайн-заказа еды с трёхуровневой программой лояльности (Бронза 5%, Серебро 7%, Золото 10%). Необходимо исправить логику работы с бонусами, чтобы корректно обрабатывать все сценарии начисления, списания, возврата и отмены.

## Требования к реализации

### 1. Структура данных

#### Таблица `orders`
Должна содержать поля:
```javascript
{
  id: number,
  user_id: number,
  status: string, // 'new', 'accepted', 'preparing', 'ready', 'on_way', 'delivered', 'cancelled'
  total: decimal, // Полная сумма заказа
  delivery_cost: decimal, // Стоимость доставки
  bonus_used: decimal, // Сколько бонусов использовано при оплате
  bonus_earned: decimal, // Сколько бонусов начислено (после завершения)
  bonus_earn_transaction_id: number, // ID транзакции начисления (для отслеживания)
  bonus_spend_transaction_id: number, // ID транзакции списания (для отслеживания)
  created_at: timestamp,
  updated_at: timestamp
}
```

#### Таблица `loyalty_transactions`
```javascript
{
  id: number,
  user_id: number,
  order_id: number, // Связь с заказом (может быть null для других операций)
  type: string, // 'earn', 'spend', 'refund', 'cancel_earn'
  amount: decimal, // Положительное для начисления/возврата, отрицательное для списания/отмены
  balance_before: decimal, // Баланс до операции (для аудита)
  balance_after: decimal, // Баланс после операции (для аудита)
  description: string, // Описание операции
  created_at: timestamp
}
```

#### Таблица `users`
```javascript
{
  id: number,
  phone: string,
  bonus_balance: decimal, // Текущий баланс бонусов
  loyalty_level: number, // 1, 2, 3
  total_spent: decimal, // Общая сумма всех завершённых заказов (для уровня лояльности)
  ...
}
```

---

### 2. Логика списания бонусов (SPEND)

**Момент выполнения:** При изменении статуса заказа на `'accepted'`

**Условия:**
- `orders.bonus_used > 0` (клиент хочет использовать бонусы)
- `users.bonus_balance >= orders.bonus_used` (достаточно бонусов)
- Транзакция списания ещё не создана (проверка `orders.bonus_spend_transaction_id === null`)

**Действия:**
```javascript
async function spendBonuses(orderId) {
  const order = await getOrder(orderId);
  const user = await getUser(order.user_id);
  
  // Проверка: списание уже выполнено?
  if (order.bonus_spend_transaction_id !== null) {
    console.log('Бонусы уже списаны для заказа', orderId);
    return;
  }
  
  // Проверка: достаточно ли бонусов?
  if (user.bonus_balance < order.bonus_used) {
    throw new Error('Недостаточно бонусов на балансе');
  }
  
  if (order.bonus_used > 0) {
    const balanceBefore = user.bonus_balance;
    const newBalance = balanceBefore - order.bonus_used;
    
    // Создаём транзакцию списания
    const transaction = await createLoyaltyTransaction({
      user_id: order.user_id,
      order_id: orderId,
      type: 'spend',
      amount: -order.bonus_used, // Отрицательное значение
      balance_before: balanceBefore,
      balance_after: newBalance,
      description: `Списание бонусов за заказ #${orderId}`
    });
    
    // Обновляем баланс пользователя
    await updateUser(order.user_id, {
      bonus_balance: newBalance
    });
    
    // Сохраняем ID транзакции в заказе
    await updateOrder(orderId, {
      bonus_spend_transaction_id: transaction.id
    });
    
    // Инвалидируем кеш
    await redis.del(`bonuses:user_${order.user_id}`);
    
    console.log(`Списано ${order.bonus_used} бонусов для заказа #${orderId}`);
  }
}
```

---

### 3. Логика начисления бонусов (EARN)

**Момент выполнения:** При изменении статуса заказа на `'delivered'` или `'issued'` (выдан)

**Условия:**
- Заказ завершён успешно
- Начисление ещё не выполнялось (проверка `orders.bonus_earn_transaction_id === null`)

**Расчёт суммы для начисления:**
```javascript
// Начисление идёт от суммы заказа БЕЗ:
// - использованных бонусов
// - стоимости доставки
const amountForBonus = order.total - order.bonus_used - order.delivery_cost;
```

**Действия:**
```javascript
async function earnBonuses(orderId) {
  const order = await getOrder(orderId);
  const user = await getUser(order.user_id);
  
  // Проверка: начисление уже выполнено?
  if (order.bonus_earn_transaction_id !== null) {
    console.log('Бонусы уже начислены для заказа', orderId);
    return;
  }
  
  // Расчёт суммы для начисления (без бонусов и доставки)
  const amountForBonus = order.total - order.bonus_used - order.delivery_cost;
  
  if (amountForBonus <= 0) {
    console.log('Сумма для начисления <= 0, бонусы не начисляются');
    return;
  }
  
  // Получаем процент начисления по уровню лояльности
  const loyaltyPercent = getLoyaltyPercent(user.loyalty_level); // 5%, 7% или 10%
  const bonusAmount = Math.floor(amountForBonus * loyaltyPercent / 100);
  
  if (bonusAmount > 0) {
    const balanceBefore = user.bonus_balance;
    const newBalance = balanceBefore + bonusAmount;
    
    // Создаём транзакцию начисления
    const transaction = await createLoyaltyTransaction({
      user_id: order.user_id,
      order_id: orderId,
      type: 'earn',
      amount: bonusAmount, // Положительное значение
      balance_before: balanceBefore,
      balance_after: newBalance,
      description: `Начисление бонусов за заказ #${orderId}`
    });
    
    // Обновляем баланс пользователя
    await updateUser(order.user_id, {
      bonus_balance: newBalance,
      total_spent: user.total_spent + order.total // Учитываем для уровня лояльности
    });
    
    // Сохраняем сумму начисления и ID транзакции в заказе
    await updateOrder(orderId, {
      bonus_earned: bonusAmount,
      bonus_earn_transaction_id: transaction.id
    });
    
    // Проверяем достижение нового уровня лояльности
    await checkLoyaltyLevelUp(order.user_id);
    
    // Инвалидируем кеш
    await redis.del(`bonuses:user_${order.user_id}`);
    
    console.log(`Начислено ${bonusAmount} бонусов для заказа #${orderId}`);
  }
}

function getLoyaltyPercent(level) {
  const levels = {
    1: 5,  // Бронза
    2: 7,  // Серебро
    3: 10  // Золото
  };
  return levels[level] || 5;
}
```

---

### 4. Логика возврата списанных бонусов (REFUND)

**Момент выполнения:** При изменении статуса заказа на `'cancelled'`

**Условия:**
- `orders.bonus_used > 0` (бонусы были использованы)
- Транзакция списания существует (`orders.bonus_spend_transaction_id !== null`)
- Транзакция возврата ещё не создана (проверяем отсутствие транзакции type='refund' для этого заказа)

**Действия:**
```javascript
async function refundBonuses(orderId) {
  const order = await getOrder(orderId);
  
  // Проверка: были ли списаны бонусы?
  if (order.bonus_used === 0 || order.bonus_spend_transaction_id === null) {
    console.log('Бонусы не списывались для заказа', orderId);
    return;
  }
  
  // Проверка: возврат уже выполнен?
  const existingRefund = await getLoyaltyTransaction({
    order_id: orderId,
    type: 'refund'
  });
  
  if (existingRefund) {
    console.log('Возврат бонусов уже выполнен для заказа', orderId);
    return;
  }
  
  const user = await getUser(order.user_id);
  const balanceBefore = user.bonus_balance;
  const newBalance = balanceBefore + order.bonus_used;
  
  // Создаём транзакцию возврата
  const transaction = await createLoyaltyTransaction({
    user_id: order.user_id,
    order_id: orderId,
    type: 'refund',
    amount: order.bonus_used, // Положительное значение (возвращаем)
    balance_before: balanceBefore,
    balance_after: newBalance,
    description: `Возврат списанных бонусов за отменённый заказ #${orderId}`
  });
  
  // Обновляем баланс пользователя
  await updateUser(order.user_id, {
    bonus_balance: newBalance
  });
  
  // Инвалидируем кеш
  await redis.del(`bonuses:user_${order.user_id}`);
  
  console.log(`Возвращено ${order.bonus_used} бонусов для заказа #${orderId}`);
}
```

---

### 5. Логика отмены начисленных бонусов (CANCEL_EARN)

**Момент выполнения:** 
- При изменении статуса с `'delivered'` на любой другой (кроме `'cancelled'`)
- При изменении статуса на `'cancelled'` после того, как заказ был завершён

**Условия:**
- `orders.bonus_earned > 0` (бонусы были начислены)
- Транзакция начисления существует (`orders.bonus_earn_transaction_id !== null`)
- Транзакция отмены ещё не создана (проверяем отсутствие транзакции type='cancel_earn' для этого заказа)

**Действия:**
```javascript
async function cancelEarnedBonuses(orderId) {
  const order = await getOrder(orderId);
  
  // Проверка: были ли начислены бонусы?
  if (order.bonus_earned === 0 || order.bonus_earn_transaction_id === null) {
    console.log('Бонусы не начислялись для заказа', orderId);
    return;
  }
  
  // Проверка: отмена уже выполнена?
  const existingCancel = await getLoyaltyTransaction({
    order_id: orderId,
    type: 'cancel_earn'
  });
  
  if (existingCancel) {
    console.log('Отмена начисления уже выполнена для заказа', orderId);
    return;
  }
  
  const user = await getUser(order.user_id);
  const balanceBefore = user.bonus_balance;
  const newBalance = balanceBefore - order.bonus_earned;
  
  // Проверка: достаточно ли бонусов для отмены? (могли быть потрачены)
  if (newBalance < 0) {
    throw new Error('Невозможно отменить начисление: недостаточно бонусов на балансе');
  }
  
  // Создаём транзакцию отмены начисления
  const transaction = await createLoyaltyTransaction({
    user_id: order.user_id,
    order_id: orderId,
    type: 'cancel_earn',
    amount: -order.bonus_earned, // Отрицательное значение (отменяем)
    balance_before: balanceBefore,
    balance_after: newBalance,
    description: `Отмена начисления бонусов за заказ #${orderId}`
  });
  
  // Обновляем баланс пользователя и total_spent
  await updateUser(order.user_id, {
    bonus_balance: newBalance,
    total_spent: user.total_spent - order.total // Уменьшаем для пересчёта уровня
  });
  
  // Обнуляем bonus_earned и bonus_earn_transaction_id в заказе
  await updateOrder(orderId, {
    bonus_earned: 0,
    bonus_earn_transaction_id: null
  });
  
  // Проверяем понижение уровня лояльности
  await checkLoyaltyLevelDown(order.user_id);
  
  // Инвалидируем кеш
  await redis.del(`bonuses:user_${order.user_id}`);
  
  console.log(`Отменено начисление ${order.bonus_earned} бонусов для заказа #${orderId}`);
}
```

---

### 6. Обработка изменения статуса заказа

**Главная функция, которая вызывается при изменении статуса:**

```javascript
async function handleOrderStatusChange(orderId, oldStatus, newStatus) {
  console.log(`Заказ #${orderId}: ${oldStatus} → ${newStatus}`);
  
  try {
    // 1. СПИСАНИЕ БОНУСОВ
    if (newStatus === 'accepted' && oldStatus === 'new') {
      await spendBonuses(orderId);
    }
    
    // 2. НАЧИСЛЕНИЕ БОНУСОВ
    if (newStatus === 'delivered' || newStatus === 'issued') {
      await earnBonuses(orderId);
    }
    
    // 3. ОТМЕНА НАЧИСЛЕННЫХ БОНУСОВ
    // Если заказ был завершён, а потом статус изменился
    if ((oldStatus === 'delivered' || oldStatus === 'issued') && 
        (newStatus !== 'delivered' && newStatus !== 'issued')) {
      await cancelEarnedBonuses(orderId);
    }
    
    // 4. ВОЗВРАТ СПИСАННЫХ БОНУСОВ
    if (newStatus === 'cancelled') {
      // Сначала отменяем начисление (если было)
      await cancelEarnedBonuses(orderId);
      // Затем возвращаем списанные бонусы
      await refundBonuses(orderId);
    }
    
  } catch (error) {
    console.error(`Ошибка обработки бонусов для заказа #${orderId}:`, error);
    throw error;
  }
}
```

---

### 7. Обработка частичной отмены заказа (изменение суммы)

**Момент выполнения:** Когда изменяется сумма заказа после того, как он уже был обработан

```javascript
async function handleOrderAmountChange(orderId, oldTotal, newTotal) {
  const order = await getOrder(orderId);
  
  console.log(`Заказ #${orderId}: изменение суммы ${oldTotal} → ${newTotal}`);
  
  // Если заказ завершён и бонусы начислены - пересчитываем
  if ((order.status === 'delivered' || order.status === 'issued') && 
      order.bonus_earn_transaction_id !== null) {
    
    // Отменяем старое начисление
    await cancelEarnedBonuses(orderId);
    
    // Обновляем сумму заказа
    await updateOrder(orderId, { total: newTotal });
    
    // Начисляем заново по новой сумме
    await earnBonuses(orderId);
    
    console.log(`Пересчитано начисление бонусов для заказа #${orderId}`);
  }
}
```

---

### 8. Отображение в истории бонусов

**Получение транзакций пользователя:**

```javascript
async function getUserLoyaltyHistory(userId, limit = 50) {
  // Получаем все транзакции пользователя, отсортированные по дате (новые сверху)
  const transactions = await db.query(`
    SELECT 
      lt.*,
      o.id as order_number
    FROM loyalty_transactions lt
    LEFT JOIN orders o ON lt.order_id = o.id
    WHERE lt.user_id = ?
    ORDER BY lt.created_at DESC
    LIMIT ?
  `, [userId, limit]);
  
  // Форматируем для отображения
  return transactions.map(t => {
    let description = '';
    
    switch(t.type) {
      case 'spend':
        description = `Списание ${Math.abs(t.amount)} бонусов за заказ #${t.order_number}`;
        break;
      case 'earn':
        description = `Начисление ${t.amount} бонусов за заказ #${t.order_number}`;
        break;
      case 'refund':
        description = `Возврат ${t.amount} бонусов (отмена заказа #${t.order_number})`;
        break;
      case 'cancel_earn':
        description = `Отмена начисления ${Math.abs(t.amount)} бонусов за заказ #${t.order_number}`;
        break;
    }
    
    return {
      id: t.id,
      type: t.type,
      amount: t.amount,
      balance_after: t.balance_after,
      description: description,
      created_at: t.created_at
    };
  });
}
```

**Пример отображения в UI:**

```
История бонусов:
─────────────────────────────────────────
24.01.2026, 14:30
Отмена начисления 50 бонусов за заказ #1234
Баланс: 450 бонусов

24.01.2026, 14:25
Возврат 500 бонусов (отмена заказа #1234)
Баланс: 500 бонусов

24.01.2026, 12:10
Начисление 50 бонусов за заказ #1234
Баланс: 0 бонусов

24.01.2026, 12:00
Списание 500 бонусов за заказ #1234
Баланс: -50 бонусов
─────────────────────────────────────────
```

---

### 9. Отображение в деталях заказа

**Для клиента (Telegram Mini App):**

```javascript
async function getOrderDetailsForUser(orderId) {
  const order = await getOrder(orderId);
  const transactions = await getLoyaltyTransactionsByOrder(orderId);
  
  // Определяем текущее состояние бонусов по заказу
  let bonusStatus = {
    used: order.bonus_used,
    earned: 0,
    status: 'pending' // 'pending', 'earned', 'cancelled'
  };
  
  // Проверяем, были ли начислены бонусы
  const earnTransaction = transactions.find(t => t.type === 'earn');
  const cancelTransaction = transactions.find(t => t.type === 'cancel_earn');
  
  if (earnTransaction && !cancelTransaction) {
    bonusStatus.earned = order.bonus_earned;
    bonusStatus.status = 'earned';
  } else if (earnTransaction && cancelTransaction) {
    bonusStatus.status = 'cancelled';
  }
  
  return {
    ...order,
    bonus_info: bonusStatus
  };
}

// Пример отображения в UI:
// ─────────────────────
// Заказ #1234
// Статус: Доставлен
// Сумма: 1000 ₽
// 
// Использовано бонусов: 500 ₽
// Начислено бонусов: 25 ★
// ─────────────────────
```

**Для администратора (Админ-панель):**

```javascript
async function getOrderDetailsForAdmin(orderId) {
  const order = await getOrder(orderId);
  const transactions = await getLoyaltyTransactionsByOrder(orderId);
  
  return {
    ...order,
    loyalty_transactions: transactions.map(t => ({
      type: t.type,
      amount: t.amount,
      created_at: t.created_at,
      description: t.description
    }))
  };
}

// Пример отображения в админке:
// ─────────────────────────────────────
// Заказ #1234
// Статус: Отменён
// Сумма: 1000 ₽
// 
// История бонусов:
// [24.01.2026 14:30] Отмена начисления: -50 бонусов
// [24.01.2026 14:25] Возврат: +500 бонусов
// [24.01.2026 12:10] Начисление: +50 бонусов
// [24.01.2026 12:00] Списание: -500 бонусов
// ─────────────────────────────────────
```

---

### 10. Проверки и валидации

**Идемпотентность операций:**

```javascript
// Каждая операция должна проверять, не была ли она уже выполнена
// Используем комбинацию order_id + type для проверки дублей

async function isTransactionExists(orderId, type) {
  const transaction = await db.queryOne(`
    SELECT id FROM loyalty_transactions
    WHERE order_id = ? AND type = ?
    LIMIT 1
  `, [orderId, type]);
  
  return transaction !== null;
}

// Пример использования:
if (await isTransactionExists(orderId, 'earn')) {
  console.log('Начисление уже выполнено');
  return;
}
```

**Проверка корректности баланса:**

```javascript
async function validateUserBalance(userId) {
  // Получаем все транзакции пользователя
  const transactions = await db.query(`
    SELECT SUM(amount) as total
    FROM loyalty_transactions
    WHERE user_id = ?
  `, [userId]);
  
  const calculatedBalance = transactions[0].total || 0;
  
  // Сравниваем с балансом в таблице users
  const user = await getUser(userId);
  
  if (Math.abs(calculatedBalance - user.bonus_balance) > 0.01) {
    console.error(`Несоответствие баланса для пользователя ${userId}`);
    console.error(`Рассчитанный баланс: ${calculatedBalance}`);
    console.error(`Баланс в БД: ${user.bonus_balance}`);
    
    // Исправляем баланс
    await updateUser(userId, {
      bonus_balance: calculatedBalance
    });
  }
}
```

---

### 11. Конкурентность и транзакции БД

**Критично:** Все операции с бонусами должны выполняться в транзакциях БД с блокировками

```javascript
async function spendBonuses(orderId) {
  // Начинаем транзакцию с блокировкой строки пользователя
  const connection = await db.getConnection();
  await connection.beginTransaction();
  
  try {
    // Блокируем строку пользователя для предотвращения race condition
    const user = await connection.query(`
      SELECT * FROM users WHERE id = ? FOR UPDATE
    `, [userId]);
    
    // Выполняем все операции...
    // ...
    
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
```

---

## Критичные правила

### ✅ ОБЯЗАТЕЛЬНО:
1. **Проверять существование транзакций** перед созданием новых (избегать дублей)
2. **Использовать транзакции БД** с блокировками для операций с балансом
3. **Инвалидировать кеш Redis** после каждого изменения баланса
4. **Логировать все операции** с бонусами для аудита
5. **Обрабатывать ошибки** и откатывать транзакции при сбоях
6. **Сохранять balance_before и balance_after** в каждой транзакции
7. **Использовать отрицательные значения** для списания/отмены, положительные для начисления/возврата

### ❌ ЗАПРЕЩЕНО:
1. **Создавать дубли транзакций** (проверять перед созданием)
2. **Изменять баланс без создания транзакции** (всегда создаём запись в loyalty_transactions)
3. **Начислять бонусы дважды** при повторной установке статуса 'delivered'
4. **Начислять бонусы с суммы доставки** (только от суммы позиций меню)
5. **Начислять бонусы с использованных бонусов** (вычитаем bonus_used из total)
6. **Забывать инвалидировать кеш** после операций

---

## Тестовые сценарии

### Сценарий 1: Обычный заказ с бонусами
```
1. Создан заказ на 1000₽, использовано 500 бонусов → баланс: 0
2. Статус 'new' → 'accepted' → списано 500 бонусов → баланс: -500
3. Статус 'accepted' → 'delivered' → начислено 25 бонусов (5% от 500₽) → баланс: -475
```

### Сценарий 2: Отмена заказа после принятия
```
1. Создан заказ на 1000₽, использовано 500 бонусов → баланс: 500
2. Статус 'new' → 'accepted' → списано 500 бонусов → баланс: 0
3. Статус 'accepted' → 'cancelled' → возврат 500 бонусов → баланс: 500
```

### Сценарий 3: Отмена доставленного заказа
```
1. Создан заказ на 1000₽, использовано 500 бонусов → баланс: 500
2. Статус 'accepted' → списано 500 бонусов → баланс: 0
3. Статус 'delivered' → начислено 25 бонусов → баланс: 25
4. Статус 'cancelled' → отмена начисления -25 бонусов, возврат +500 бонусов → баланс: 500
```

### Сценарий 4: Ошибочное изменение статуса
```
1. Создан заказ на 1000₽, использовано 0 бонусов → баланс: 500
2. Статус 'delivered' → начислено 50 бонусов (5% от 1000₽) → баланс: 550
3. Статус 'on_way' (ошибка курьера) → отмена начисления -50 бонусов → баланс: 500
4. Статус 'delivered' → повторное начисление 50 бонусов → баланс: 550
```

### Сценарий 5: Частичная отмена
```
1. Создан заказ на 1000₽ (3 позиции по 333₽), использовано 0 бонусов
2. Статус 'delivered' → начислено 50 бонусов (5% от 1000₽) → баланс: 550
3. Одна позиция недоступна, сумма изменена на 666₽
4. Отмена начисления -50 бонусов → баланс: 500
5. Новое начисление 33 бонуса (5% от 666₽) → баланс: 533
```

---

## Задание для Copilot

Изучи текущий код обработки заказов и бонусной системы. Найди файлы, отвечающие за:
1. Изменение статуса заказа
2. Операции с бонусами (начисление/списание)
3. Транзакции лояльности

Исправь логику согласно описанным выше правилам. Убедись, что:
- Все операции идемпотентны (не создают дубли)
- Используются транзакции БД с блокировками
- Кеш инвалидируется после каждой операции
- Логика покрывает все edge cases (отмены, частичные отмены, повторные изменения статуса)

После внесения изменений предоставь список изменённых файлов и краткое описание исправлений.
