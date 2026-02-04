# Руководство по использованию Shadcn UI + Vue.js

## Дизайн-система проекта Food Delivery Admin Panel

## Содержание

1. [Философия и принципы](#философия-и-принципы)
2. [Структура проекта](#структура-проекта)
3. [Работа с компонентами](#работа-с-компонентами)
4. [Дизайн-токены](#дизайн-токены)
5. [Паттерны использования](#паттерны-использования)
6. [Vue.js особенности](#vuejs-особенности)
7. [Правила разработки](#правила-разработки)
8. [Чеклист качества](#чеклист-качества)

---

## 1. Введение

### 1.1 О документе

Данный документ определяет стандарты использования компонентов Shadcn UI в проекте системы онлайн-заказа еды. Документ обязателен к применению при:

- Разработке новых интерфейсов админ-панели
- Модификации существующих компонентов
- Добавлении новых компонентов в дизайн-систему
- Code review и проверке соответствия спецификациям

### 1.2 Цели документа

- Обеспечить единообразие интерфейса админ-панели
- Упростить поддержку и масштабирование UI
- Ускорить разработку через переиспользование компонентов
- Гарантировать соответствие best practices Vue.js и Shadcn UI
- Обеспечить доступность (accessibility) интерфейсов

### 1.3 Философия Shadcn UI

**Shadcn UI - это НЕ библиотека компонентов.** Это система распространения компонентного кода:

- **Open Code**: Полный доступ к коду компонента для кастомизации
- **Композиция**: Единый композитный интерфейс для всех компонентов
- **Дистрибуция**: Схема компонентов и CLI для установки
- **Красивые дефолты**: Готовые стили из коробки
- **AI-Ready**: Код понятен для LLM и может быть улучшен AI

---

## 2. Архитектура компонентов

### 2.1 Структура компонента Shadcn

Каждый компонент Shadcn состоит из нескольких уровней:

```
Компонент Shadcn
├── Radix UI Primitive (базовая функциональность)
├── Tailwind CSS (стилизация)
├── Vue Composition API (реактивность)
└── Accessibility (ARIA-атрибуты, клавиатурная навигация)
```

### 2.2 Принцип композиции

Все компоненты построены на единых паттернах:

```vue
<!-- Плохо: Разные API для разных компонентов -->
<CustomButton onClick="{handler}" />
<OtherButton @click="{ handler }" />

<!-- Хорошо: Единый композитный интерфейс -->
<Button @click="handler" />
<Select @change="handler" />
<Dialog @open-change="handler" />
```

### 2.3 Слои ответственности

| Слой                 | Ответственность            | Технология            |
| -------------------- | -------------------------- | --------------------- |
| Логика и доступность | Поведение компонента, ARIA | Radix Vue             |
| Стилизация           | Визуальное оформление      | Tailwind CSS          |
| Реактивность         | Состояние и computed       | Vue 3 Composition API |
| Бизнес-логика        | Специфика проекта          | Ваш код               |

---

## 3. Структура проекта

### 3.1 Организация директорий

```
admin-panel/
├── src/
│   ├── components/
│   │   ├── ui/              # Shadcn компоненты (не редактировать напрямую)
│   │   │   ├── button.vue
│   │   │   ├── input.vue
│   │   │   ├── dialog.vue
│   │   │   └── ...
│   │   ├── features/        # Композитные бизнес-компоненты
│   │   │   ├── MenuItemForm.vue
│   │   │   ├── OrderCard.vue
│   │   │   └── ...
│   │   └── layout/          # Компоненты лэйаута
│   │       ├── AppSidebar.vue
│   │       ├── AppHeader.vue
│   │       └── ...
│   ├── lib/
│   │   └── utils.ts         # Утилиты, включая cn()
│   ├── styles/
│   │   ├── globals.css      # Глобальные стили + Tailwind
│   │   └── theme.css        # CSS переменные для темизации
│   └── composables/         # Vue композаблы
│       ├── useToast.ts
│       └── ...
```

### 3.2 Правило разделения компонентов

**UI компоненты (src/components/ui/):**

- Чистые, переиспользуемые компоненты
- Без бизнес-логики
- Получают данные через props
- Эмитят события наружу
- **НЕ РЕДАКТИРУЮТСЯ НАПРЯМУЮ** (только через расширение)

**Feature компоненты (src/components/features/):**

- Содержат бизнес-логику
- Композиция из UI компонентов
- Работа с API, stores, composables
- Специфика предметной области

**Пример:**

```vue
<!-- src/components/ui/button.vue (НЕ редактируем) -->
<script setup>
defineProps(["variant", "size"]);
</script>

<template>
  <button :class="cn('base-button-classes', variantClasses)">
    <slot />
  </button>
</template>

<!-- src/components/features/OrderActionButton.vue -->
<script setup>
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/stores/order";

const orderStore = useOrderStore();

async function handleAction() {
  await orderStore.updateStatus();
  // бизнес-логика
}
</script>

<template>
  <Button variant="primary" @click="handleAction"> Принять заказ </Button>
</template>
```

---

## 4. Принципы использования Shadcn

### 4.1 Open Code подход

**Преимущества:**

- Полный контроль над кодом компонента
- Можно модифицировать любую часть
- Нет зависимости от NPM пакета
- Легко добавлять новую функциональность

**Правила работы:**

1. **Установка компонента:**

```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add form
```

2. **Расширение функциональности:**
   Создавайте композитные компоненты:

```vue
<!-- src/components/features/ConfirmDialog.vue -->
<script setup>
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const emit = defineEmits(["confirm", "cancel"]);
</script>

<template>
  <Dialog>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="emit('cancel')">Отмена</Button>
        <Button @click="emit('confirm')">Подтвердить</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

### 4.2 Композиция компонентов

**Принцип:** Строить сложные компоненты из простых

```vue
<script setup>
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>Заказ #{{ order.id }}</CardTitle>
        <Badge :variant="statusVariant">{{ order.status }}</Badge>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Контент заказа -->
    </CardContent>
  </Card>
</template>
```

### 4.3 Утилита cn() для классов

Используйте функцию `cn()` для условных классов:

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Использование:**

```vue
<script setup>
import { cn } from '@/lib/utils'
import { computed } from 'vue'

const props = defineProps<{
  variant: 'default' | 'destructive'
  size: 'sm' | 'md' | 'lg'
}>()

const classes = computed(() => cn(
  'base-button-class',
  {
    'bg-primary text-white': props.variant === 'default',
    'bg-red-500 text-white': props.variant === 'destructive',
  },
  {
    'px-3 py-1 text-sm': props.size === 'sm',
    'px-4 py-2 text-base': props.size === 'md',
    'px-6 py-3 text-lg': props.size === 'lg',
  }
))
</script>

<template>
  <button :class="classes">
    <slot />
  </button>
</template>
```

---

## 5. Дизайн-токены и темизация

### 5.1 CSS Custom Properties

Используйте CSS переменные для темизации:

```css
/* styles/theme.css */
:root {
  /* Цвета из дизайн-системы проекта */
  --primary: #ffd200;
  --primary-hover: #ffc700;
  --primary-disabled: #ffe680;

  --secondary: #f5f5f5;
  --background: #ffffff;
  --foreground: #000000;

  --text-primary: #000000;
  --text-secondary: #666666;
  --text-muted: #999999;

  --border: #e0e0e0;

  --success: #4caf50;
  --error: #ff0000;
  --warning: #ffa500;

  /* Радиусы */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Тени */
  --shadow-sm: 0px 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-md: 0px 4px 16px rgba(0, 0, 0, 0.12);
}
```

### 5.2 Tailwind конфигурация

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          disabled: "var(--primary-disabled)",
        },
        secondary: "var(--secondary)",
        border: "var(--border)",
        // ... остальные цвета
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
};
```

### 5.3 Применение в компонентах

```vue
<template>
  <!-- Используем Tailwind классы, которые ссылаются на CSS переменные -->
  <button class="bg-primary hover:bg-primary-hover rounded-md shadow-sm">Кнопка</button>
</template>
```

---

## 6. Компонентная база

### 6.1 Основные UI компоненты

#### Button (Кнопка)

```vue
<script setup>
import { Button } from "@/components/ui/button";
</script>

<template>
  <!-- Варианты -->
  <Button variant="default">Основная</Button>
  <Button variant="secondary">Вторичная</Button>
  <Button variant="outline">С обводкой</Button>
  <Button variant="ghost">Прозрачная</Button>
  <Button variant="destructive">Деструктивная</Button>

  <!-- Размеры -->
  <Button size="sm">Маленькая</Button>
  <Button size="default">Обычная</Button>
  <Button size="lg">Большая</Button>

  <!-- Состояния -->
  <Button disabled>Неактивна</Button>
  <Button :loading="true">Загрузка</Button>
</template>
```

**Best practices:**

- Всегда указывайте `type="button"` для кнопок вне форм
- Используйте `variant="destructive"` для опасных действий
- Добавляйте loading состояние для асинхронных операций

#### Input (Поле ввода)

```vue
<script setup>
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
</script>

<template>
  <div class="space-y-2">
    <Label for="name">Название</Label>
    <Input id="name" v-model="name" type="text" placeholder="Введите название" />
  </div>
</template>
```

**Best practices:**

- Всегда используйте `Label` с `Input`
- Связывайте `Label` и `Input` через `id` и `for`
- Добавляйте placeholder для подсказки
- Используйте правильный `type` (text, email, number, etc.)

#### Select (Выпадающий список)

```vue
<script setup>
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
</script>

<template>
  <Select v-model="selectedCity">
    <SelectTrigger>
      <SelectValue placeholder="Выберите город" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="moscow">Москва</SelectItem>
      <SelectItem value="spb">Санкт-Петербург</SelectItem>
      <SelectItem value="kazan">Казань</SelectItem>
    </SelectContent>
  </Select>
</template>
```

#### Dialog (Модальное окно)

```vue
<script setup>
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const isOpen = ref(false);
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Заголовок диалога</DialogTitle>
        <DialogDescription> Описание того, что делает этот диалог </DialogDescription>
      </DialogHeader>

      <!-- Содержимое -->
      <div class="py-4">
        <!-- Форма или контент -->
      </div>

      <DialogFooter>
        <Button variant="outline" @click="isOpen = false">Отмена</Button>
        <Button @click="handleSubmit">Сохранить</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

**Best practices:**

- Используйте `DialogDescription` для accessibility
- Всегда добавляйте кнопку отмены
- Основное действие должно быть справа

#### Table (Таблица)

```vue
<script setup>
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>ID</TableHead>
        <TableHead>Название</TableHead>
        <TableHead>Цена</TableHead>
        <TableHead>Действия</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="item in items" :key="item.id">
        <TableCell>{{ item.id }}</TableCell>
        <TableCell>{{ item.name }}</TableCell>
        <TableCell>{{ item.price }}₽</TableCell>
        <TableCell>
          <Button size="sm" variant="ghost">Изменить</Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
```

#### Card (Карточка)

```vue
<script setup>
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Заголовок карточки</CardTitle>
      <CardDescription>Описание карточки</CardDescription>
    </CardHeader>
    <CardContent>
      <!-- Основной контент -->
    </CardContent>
    <CardFooter>
      <!-- Футер с действиями -->
    </CardFooter>
  </Card>
</template>
```

### 6.2 Формы

#### Паттерн работы с формами

```vue
<script setup>
import { ref } from "vue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/composables/useToast";

const form = ref({
  name: "",
  price: 0,
  description: "",
});

const errors = ref({});
const { toast } = useToast();

function validate() {
  errors.value = {};

  if (!form.value.name) {
    errors.value.name = "Название обязательно";
  }

  if (form.value.price <= 0) {
    errors.value.price = "Цена должна быть больше 0";
  }

  return Object.keys(errors.value).length === 0;
}

async function handleSubmit() {
  if (!validate()) return;

  try {
    await api.createItem(form.value);
    toast({ title: "Успешно", description: "Блюдо создано" });
  } catch (error) {
    toast({
      title: "Ошибка",
      description: error.message,
      variant: "destructive",
    });
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div class="space-y-2">
      <Label for="name">Название блюда</Label>
      <Input id="name" v-model="form.name" :class="{ 'border-red-500': errors.name }" />
      <p v-if="errors.name" class="text-sm text-red-500">
        {{ errors.name }}
      </p>
    </div>

    <div class="space-y-2">
      <Label for="price">Цена</Label>
      <Input id="price" v-model.number="form.price" type="number" :class="{ 'border-red-500': errors.price }" />
      <p v-if="errors.price" class="text-sm text-red-500">
        {{ errors.price }}
      </p>
    </div>

    <Button type="submit">Создать</Button>
  </form>
</template>
```

### 6.3 Toast уведомления

```vue
<script setup>
import { useToast } from "@/composables/useToast";

const { toast } = useToast();

function showSuccess() {
  toast({
    title: "Успешно",
    description: "Операция выполнена успешно",
  });
}

function showError() {
  toast({
    title: "Ошибка",
    description: "Произошла ошибка",
    variant: "destructive",
  });
}
</script>
```

---

## 7. Vue.js специфика

### 7.1 Composition API

**Используйте Composition API для всех новых компонентов:**

```vue
<script setup>
import { ref, computed, watch, onMounted } from "vue";

// Реактивные данные
const count = ref(0);

// Вычисляемые свойства
const doubleCount = computed(() => count.value * 2);

// Watchers
watch(count, (newValue) => {
  console.log("Count changed:", newValue);
});

// Lifecycle hooks
onMounted(() => {
  console.log("Component mounted");
});
</script>
```

### 7.2 Composables

Создавайте переиспользуемые composables:

```typescript
// composables/useDialog.ts
import { ref } from "vue";

export function useDialog() {
  const isOpen = ref(false);

  function open() {
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
  }

  function toggle() {
    isOpen.value = !isOpen.value;
  }

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
```

**Использование:**

```vue
<script setup>
import { useDialog } from "@/composables/useDialog";

const dialog = useDialog();
</script>

<template>
  <Button @click="dialog.open()">Открыть</Button>

  <Dialog v-model:open="dialog.isOpen">
    <!-- Содержимое -->
  </Dialog>
</template>
```

### 7.3 Props и Emits

**Типизация props:**

```vue
<script setup lang="ts">
interface Props {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  size?: "sm" | "md" | "lg";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
  size: "md",
});
</script>
```

**Типизация emits:**

```vue
<script setup lang="ts">
interface Emits {
  (e: "submit", value: FormData): void;
  (e: "cancel"): void;
}

const emit = defineEmits<Emits>();

function handleSubmit() {
  emit("submit", formData);
}
</script>
```

### 7.4 v-model паттерны

**Одиночный v-model:**

```vue
<script setup>
const props = defineProps(["modelValue"]);
const emit = defineEmits(["update:modelValue"]);

function updateValue(newValue) {
  emit("update:modelValue", newValue);
}
</script>

<template>
  <Input :value="modelValue" @input="updateValue($event.target.value)" />
</template>
```

**Использование:**

```vue
<CustomInput v-model="searchQuery" />
```

**Множественные v-model:**

```vue
<script setup>
defineProps(["name", "price"]);
defineEmits(["update:name", "update:price"]);
</script>

<template>
  <Input :value="name" @input="$emit('update:name', $event.target.value)" />
  <Input :value="price" @input="$emit('update:price', $event.target.value)" />
</template>
```

**Использование:**

```vue
<MenuItemForm v-model:name="item.name" v-model:price="item.price" />
```

### 7.5 Slots

**Именованные слоты:**

```vue
<script setup>
// Parent.vue
</script>

<template>
  <Card>
    <template #header>
      <h2>Заголовок</h2>
    </template>

    <template #content>
      <p>Контент карточки</p>
    </template>

    <template #footer>
      <Button>Действие</Button>
    </template>
  </Card>
</template>
```

```vue
<script setup>
// Card.vue
</script>

<template>
  <div class="card">
    <div v-if="$slots.header" class="card-header">
      <slot name="header" />
    </div>

    <div class="card-content">
      <slot name="content" />
    </div>

    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>
```

**Scoped slots:**

```vue
<script setup>
// List.vue
const items = ref([...])
</script>

<template>
  <div v-for="item in items" :key="item.id">
    <slot :item="item" />
  </div>
</template>
```

```vue
<script setup>
// Parent.vue
</script>

<template>
  <List>
    <template #default="{ item }">
      <div>{{ item.name }}</div>
    </template>
  </List>
</template>
```

---

## 8. Best Practices

### 8.1 Общие рекомендации

1. **Один компонент - одна ответственность**
   - UI компонент не должен содержать бизнес-логику
   - Feature компонент инкапсулирует логику предметной области

2. **Предпочитайте композицию наследованию**

- Не расширяйте компоненты через `extends`
- Создавайте композитные компоненты и используйте композицию

3. **Используйте TypeScript**
   - Типизируйте props, emits, ref, computed
   - Это предотвращает ошибки и улучшает DX

4. **Избегайте глубокой вложенности**
   - Максимум 3-4 уровня вложенности компонентов
   - Выносите логику в composables

5. **Делайте компоненты доступными**
   - Добавляйте ARIA-атрибуты
   - Обеспечьте клавиатурную навигацию
   - Используйте семантические HTML теги

### 8.2 Именование

**Компоненты:**

- PascalCase для имён файлов: `MenuItemCard.vue`
- Префикс для feature компонентов: `MenuItemForm.vue`, `OrderCard.vue`
- UI компоненты без префикса: `Button.vue`, `Input.vue`

**Props:**

- camelCase: `isDisabled`, `maxLength`
- Boolean props с префиксом `is` или `has`: `isLoading`, `hasError`

**Emits:**

- kebab-case: `@submit-form`, `@update-status`
- Для v-model: `update:modelValue`

**Composables:**

- Префикс `use`: `useDialog`, `useToast`, `useMenuForm`

### 8.3 Производительность

1. **Ленивая загрузка компонентов:**

```vue
<script setup>
import { defineAsyncComponent } from "vue";

const HeavyComponent = defineAsyncComponent(() => import("./HeavyComponent.vue"));
</script>
```

2. **v-memo для оптимизации:**

```vue
<template>
  <div v-for="item in items" :key="item.id" v-memo="[item.id, item.status]">
    <!-- Перерендерится только при изменении id или status -->
  </div>
</template>
```

3. **Computed вместо методов в шаблонах:**

```vue
<script setup>
// Плохо
function getFullName() {
  return `${user.firstName} ${user.lastName}`;
}

// Хорошо
const fullName = computed(() => `${user.firstName} ${user.lastName}`);
</script>

<template>
  <!-- Плохо: вызывается при каждом ре-рендере -->
  <div>{{ getFullName() }}</div>

  <!-- Хорошо: кешируется -->
  <div>{{ fullName }}</div>
</template>
```

4. **v-once для статического контента:**

```vue
<template>
  <div v-once>
    <!-- Этот контент не будет обновляться -->
    <h1>{{ staticTitle }}</h1>
  </div>
</template>
```

### 8.4 Accessibility

1. **Связывайте Label и Input:**

```vue
<template>
  <Label for="email">Email</Label>
  <Input id="email" type="email" />
</template>
```

2. **Используйте семантические теги:**

```vue
<template>
  <!-- Плохо -->
  <div @click="navigate">
    <div>Link text</div>
  </div>

  <!-- Хорошо -->
  <a href="/page">Link text</a>
</template>
```

3. **Добавляйте ARIA-атрибуты:**

```vue
<template>
  <Button :disabled="isLoading" :aria-busy="isLoading" :aria-label="isLoading ? 'Загрузка...' : 'Отправить'">
    {{ isLoading ? "Загрузка..." : "Отправить" }}
  </Button>
</template>
```

4. **Обеспечьте клавиатурную навигацию:**

```vue
<script setup>
function handleKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    handleClick();
  }
}
</script>

<template>
  <div role="button" tabindex="0" @click="handleClick" @keydown="handleKeydown">Кликабельный div</div>
</template>
```

### 8.5 Обработка ошибок

```vue
<script setup>
import { ref } from "vue";
import { useToast } from "@/composables/useToast";

const { toast } = useToast();
const isLoading = ref(false);
const error = ref(null);

async function fetchData() {
  isLoading.value = true;
  error.value = null;

  try {
    const data = await api.getData();
    return data;
  } catch (err) {
    error.value = err.message;
    toast({
      title: "Ошибка",
      description: err.message,
      variant: "destructive",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <Button @click="fetchData" :disabled="isLoading">
      {{ isLoading ? "Загрузка..." : "Загрузить" }}
    </Button>

    <Alert v-if="error" variant="destructive">
      {{ error }}
    </Alert>
  </div>
</template>
```

---

## 9. Процесс разработки

### 9.1 Процесс добавления нового компонента

**Шаг 1: Проверка существующих компонентов**

- Просмотрите `src/components/ui/` на наличие нужного компонента
- Проверьте [shadcn.com/docs/components](https://ui.shadcn.com/docs/components)

**Шаг 2: Установка компонента (если нужен новый)**

```bash
npx shadcn@latest add [component-name]
```

Примеры:

```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add select
npx shadcn@latest add table
```

**Шаг 3: Создание feature компонента**

```vue
<!-- src/components/features/MenuItemDialog.vue -->
<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Бизнес-логика...
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent>
      <!-- Ваш UI используя shadcn компоненты -->
    </DialogContent>
  </Dialog>
</template>
```

**Шаг 4: Тестирование**

- Проверьте на desktop и mobile
- Проверьте клавиатурную навигацию (Tab, Enter, Escape)
- Проверьте с screen reader (опционально)

### 9.2 Workflow разработки интерфейса

1. **Анализ требований**
   - Изучите макет или описание
   - Определите необходимые компоненты

2. **Декомпозиция**
   - Разбейте интерфейс на компоненты
   - Определите иерархию компонентов

3. **Проектирование API компонента**
   - Определите props
   - Определите emits
   - Определите slots (если нужны)

4. **Реализация**
   - Создайте структуру компонента
   - Добавьте логику
   - Добавьте стили (используя Tailwind)

5. **Интеграция**
   - Подключите к API
   - Подключите к stores
   - Добавьте обработку ошибок

6. **Тестирование**
   - Функциональное тестирование
   - UI/UX проверка
   - Accessibility проверка

### 9.3 Code Review чеклист

**Структура:**

- [ ] Компонент находится в правильной директории (ui vs features)
- [ ] Имя файла в PascalCase
- [ ] Нет дублирования кода

**Vue.js:**

- [ ] Используется `<script setup>`
- [ ] Props и emits типизированы (TypeScript)
- [ ] Используется Composition API
- [ ] Computed свойства вместо методов в шаблонах

**Shadcn UI:**

- [ ] Используются существующие UI компоненты
- [ ] Нет прямых модификаций компонентов из `src/components/ui/`
- [ ] Используется функция `cn()` для классов
- [ ] Следование паттернам композиции

**Стили:**

- [ ] Используется Tailwind CSS
- [ ] Используются CSS переменные для цветов
- [ ] Адаптивный дизайн (responsive)
- [ ] Нет инлайн стилей

**Accessibility:**

- [ ] Label связан с Input через `for` и `id`
- [ ] Кнопки имеют `type="button"` (если не submit)
- [ ] Интерактивные элементы доступны с клавиатуры
- [ ] Семантические HTML теги

**Производительность:**

- [ ] Большие компоненты ленивые (defineAsyncComponent)
- [ ] Нет лишних ре-рендеров
- [ ] Используется v-memo для списков (если нужно)

**Безопасность:**

- [ ] Нет XSS уязвимостей (v-html только для проверенных данных)
- [ ] Валидация пользовательского ввода

---

## 10. Чеклист перед релизом

### 10.1 Функциональность

- [ ] Все функции работают согласно требованиям
- [ ] Формы корректно валидируются
- [ ] API интеграция работает
- [ ] Обработка ошибок реализована
- [ ] Loading состояния отображаются

### 10.2 UI/UX

- [ ] Дизайн соответствует макетам
- [ ] Все интерактивные элементы реагируют на hover
- [ ] Анимации плавные и быстрые (<300ms)
- [ ] Нет визуальных багов
- [ ] Консистентность spacing и sizing

### 10.3 Адаптивность

- [ ] Проверено на desktop (1920px, 1440px, 1280px)
- [ ] Проверено на tablet (768px)
- [ ] Проверено на mobile (375px, 414px)
- [ ] Horizontal scroll отсутствует
- [ ] Touch-friendly элементы (min 44x44px)

### 10.4 Производительность

- [ ] Время загрузки страницы < 2 секунд
- [ ] Нет лишних ре-рендеров (проверить через Vue DevTools)
- [ ] Изображения оптимизированы
- [ ] Bundle size приемлемый

### 10.5 Accessibility

- [ ] Можно навигировать только с клавиатуры
- [ ] Все интерактивные элементы имеют focus state
- [ ] Labels связаны с inputs
- [ ] Contrast ratio достаточный (WCAG AA)
- [ ] Screen reader тестирование (опционально)

### 10.6 Код

- [ ] TypeScript ошибок нет
- [ ] ESLint warnings исправлены
- [ ] Нет console.log в production коде
- [ ] Code review пройден
- [ ] Нет TODO комментариев

### 10.7 Тестирование

- [ ] Happy path протестирован
- [ ] Edge cases протестированы
- [ ] Обработка ошибок протестирована
- [ ] Разные браузеры (Chrome, Firefox, Safari)

---

## 11. Справочные материалы

### 11.1 Документация

- [Shadcn UI Documentation](https://ui.shadcn.com/docs)
- [Radix Vue Documentation](https://www.radix-vue.com/)
- [Vue.js Documentation](https://vuejs.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

### 11.2 Полезные ресурсы

- [Vue Use - Коллекция composables](https://vueuse.org/)
- [Heroicons - Иконки](https://heroicons.com/)
- [Lucide Icons - Иконки](https://lucide.dev/)

### 11.3 Инструменты

- [Vue DevTools](https://devtools.vuejs.org/)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

---

## 12. Примеры компонентов проекта

### 12.1 Форма добавления блюда в меню

```vue
<!-- src/components/features/MenuItemForm.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/composables/useToast";
import { useMenuStore } from "@/stores/menu";

interface MenuItemFormData {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  weight: number;
  weightUnit: string;
}

const props = defineProps<{
  item?: MenuItemFormData;
}>();

const emit = defineEmits<{
  (e: "submit", data: MenuItemFormData): void;
  (e: "cancel"): void;
}>();

const menuStore = useMenuStore();
const { toast } = useToast();

const form = ref<MenuItemFormData>(
  props.item || {
    name: "",
    description: "",
    price: 0,
    categoryId: "",
    weight: 0,
    weightUnit: "г",
  },
);

const errors = ref<Partial<Record<keyof MenuItemFormData, string>>>({});

const isValid = computed(() => {
  return Object.keys(errors.value).length === 0;
});

function validate() {
  errors.value = {};

  if (!form.value.name) {
    errors.value.name = "Название обязательно";
  }

  if (!form.value.categoryId) {
    errors.value.categoryId = "Выберите категорию";
  }

  if (form.value.price <= 0) {
    errors.value.price = "Цена должна быть больше 0";
  }

  if (form.value.weight <= 0) {
    errors.value.weight = "Вес должен быть больше 0";
  }

  return isValid.value;
}

function handleSubmit() {
  if (!validate()) return;

  emit("submit", form.value);
}

function handleCancel() {
  emit("cancel");
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-6">
    <!-- Название -->
    <div class="space-y-2">
      <Label for="name">Название блюда *</Label>
      <Input id="name" v-model="form.name" placeholder="Например: Маргарита" :class="{ 'border-error': errors.name }" />
      <p v-if="errors.name" class="text-sm text-error">
        {{ errors.name }}
      </p>
    </div>

    <!-- Описание -->
    <div class="space-y-2">
      <Label for="description">Описание</Label>
      <Textarea id="description" v-model="form.description" placeholder="Опишите блюдо" rows="3" />
    </div>

    <!-- Категория -->
    <div class="space-y-2">
      <Label for="category">Категория *</Label>
      <Select v-model="form.categoryId">
        <SelectTrigger :class="{ 'border-error': errors.categoryId }">
          <SelectValue placeholder="Выберите категорию" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="category in menuStore.categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="errors.categoryId" class="text-sm text-error">
        {{ errors.categoryId }}
      </p>
    </div>

    <!-- Цена и вес в одной строке -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Цена -->
      <div class="space-y-2">
        <Label for="price">Цена, ₽ *</Label>
        <Input id="price" v-model.number="form.price" type="number" min="0" step="1" :class="{ 'border-error': errors.price }" />
        <p v-if="errors.price" class="text-sm text-error">
          {{ errors.price }}
        </p>
      </div>

      <!-- Вес -->
      <div class="space-y-2">
        <Label for="weight">Вес *</Label>
        <div class="flex gap-2">
          <Input id="weight" v-model.number="form.weight" type="number" min="0" class="flex-1" :class="{ 'border-error': errors.weight }" />
          <Select v-model="form.weightUnit" class="w-24">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="г">г</SelectItem>
              <SelectItem value="кг">кг</SelectItem>
              <SelectItem value="мл">мл</SelectItem>
              <SelectItem value="л">л</SelectItem>
              <SelectItem value="шт">шт</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="errors.weight" class="text-sm text-error">
          {{ errors.weight }}
        </p>
      </div>
    </div>

    <!-- Кнопки действий -->
    <div class="flex justify-end gap-3">
      <Button type="button" variant="outline" @click="handleCancel"> Отмена </Button>
      <Button type="submit" :disabled="!isValid">
        {{ item ? "Сохранить" : "Создать" }}
      </Button>
    </div>
  </form>
</template>
```

### 12.2 Карточка заказа

```vue
<!-- src/components/features/OrderCard.vue -->
<script setup lang="ts">
import { computed } from "vue";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Order {
  id: number;
  customer: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  status: "new" | "preparing" | "ready" | "delivered";
  total: number;
  createdAt: string;
}

const props = defineProps<{
  order: Order;
}>();

const emit = defineEmits<{
  (e: "update-status", orderId: number, status: string): void;
  (e: "view-details", orderId: number): void;
}>();

const statusConfig = {
  new: { label: "Новый", variant: "default" as const, color: "bg-blue-500" },
  preparing: { label: "Готовится", variant: "secondary" as const, color: "bg-orange-500" },
  ready: { label: "Готов", variant: "outline" as const, color: "bg-green-500" },
  delivered: { label: "Доставлен", variant: "outline" as const, color: "bg-gray-500" },
};

const currentStatus = computed(() => statusConfig[props.order.status]);

function handleStatusUpdate(newStatus: string) {
  emit("update-status", props.order.id, newStatus);
}

function handleViewDetails() {
  emit("view-details", props.order.id);
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>Заказ #{{ order.id }}</CardTitle>
        <Badge :variant="currentStatus.variant">
          <div :class="['w-2 h-2 rounded-full mr-2', currentStatus.color]" />
          {{ currentStatus.label }}
        </Badge>
      </div>
      <div class="text-sm text-text-secondary">{{ order.customer }} • {{ order.createdAt }}</div>
    </CardHeader>

    <CardContent class="space-y-3">
      <!-- Список позиций -->
      <div class="space-y-2">
        <div v-for="item in order.items" :key="item.name" class="flex justify-between text-sm">
          <span>{{ item.name }} × {{ item.quantity }}</span>
          <span class="font-medium">{{ item.price }}₽</span>
        </div>
      </div>

      <Separator />

      <!-- Итого -->
      <div class="flex justify-between font-semibold">
        <span>Итого:</span>
        <span>{{ order.total }}₽</span>
      </div>
    </CardContent>

    <CardFooter class="flex gap-2">
      <Button v-if="order.status === 'new'" @click="handleStatusUpdate('preparing')" class="flex-1"> Принять в работу </Button>

      <Button v-if="order.status === 'preparing'" @click="handleStatusUpdate('ready')" class="flex-1"> Готов к выдаче </Button>

      <Button v-if="order.status === 'ready'" @click="handleStatusUpdate('delivered')" class="flex-1"> Выдан </Button>

      <Button variant="outline" @click="handleViewDetails" class="flex-1"> Подробнее </Button>
    </CardFooter>
  </Card>
</template>
```

### 12.3 Таблица с пагинацией

```vue
<!-- src/components/features/MenuItemsTable.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationList, PaginationListItem, PaginationPrev, PaginationNext } from "@/components/ui/pagination";

interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  isActive: boolean;
}

const props = defineProps<{
  items: MenuItem[];
}>();

const emit = defineEmits<{
  (e: "edit", id: number): void;
  (e: "delete", id: number): void;
  (e: "toggle-active", id: number): void;
}>();

const currentPage = ref(1);
const itemsPerPage = 10;

const totalPages = computed(() => Math.ceil(props.items.length / itemsPerPage));

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return props.items.slice(start, end);
});

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Таблица -->
    <div class="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Цена</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead class="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="item in paginatedItems" :key="item.id">
            <TableCell class="font-medium">
              {{ item.id }}
            </TableCell>
            <TableCell>{{ item.name }}</TableCell>
            <TableCell>{{ item.category }}</TableCell>
            <TableCell>{{ item.price }}₽</TableCell>
            <TableCell>
              <Badge :variant="item.isActive ? 'default' : 'secondary'">
                {{ item.isActive ? "Активно" : "Неактивно" }}
              </Badge>
            </TableCell>
            <TableCell class="text-right">
              <div class="flex justify-end gap-2">
                <Button size="sm" variant="ghost" @click="emit('edit', item.id)"> Изменить </Button>
                <Button size="sm" variant="ghost" @click="emit('toggle-active', item.id)">
                  {{ item.isActive ? "Отключить" : "Включить" }}
                </Button>
                <Button size="sm" variant="ghost" @click="emit('delete', item.id)"> Удалить </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Пагинация -->
    <div class="flex justify-between items-center">
      <div class="text-sm text-text-secondary">Показано {{ paginatedItems.length }} из {{ items.length }}</div>

      <Pagination :total="totalPages" :sibling-count="1" v-model:page="currentPage" show-edges>
        <PaginationList>
          <PaginationPrev @click="goToPage(currentPage - 1)" />

          <PaginationListItem v-for="page in totalPages" :key="page" :value="page" @click="goToPage(page)" />

          <PaginationNext @click="goToPage(currentPage + 1)" />
        </PaginationList>
      </Pagination>
    </div>
  </div>
</template>
```

---

## Заключение

Этот документ является живым и должен обновляться по мере развития проекта. При добавлении новых паттернов, компонентов или best practices - обновляйте документ.

**Ключевые принципы для запоминания:**

1. **Shadcn UI - это не библиотека, а код который вы владеете**
2. **Композиция > Наследование**
3. **UI компоненты чистые, feature компоненты содержат логику**
4. **TypeScript везде**
5. **Accessibility важна**
6. **Консистентность во всём**

При возникновении вопросов обращайтесь к официальной документации:

- [Shadcn UI Docs](https://ui.shadcn.com/docs)
- [Vue.js Docs](https://vuejs.org/)
- [Tailwind CSS Docs](https://tailwindcss.com/)

## Справочник компонентов

| Компонент | Назначение        | Установка                 |
| --------- | ----------------- | ------------------------- |
| Button    | Кнопки            | `npx shadcn add button`   |
| Input     | Поля ввода        | `npx shadcn add input`    |
| Label     | Подписи           | `npx shadcn add label`    |
| Dialog    | Модальные окна    | `npx shadcn add dialog`   |
| Select    | Выпадающие списки | `npx shadcn add select`   |
| Table     | Таблицы           | `npx shadcn add table`    |
| Card      | Карточки          | `npx shadcn add card`     |
| Badge     | Метки             | `npx shadcn add badge`    |
| Checkbox  | Чекбоксы          | `npx shadcn add checkbox` |
| Tabs      | Вкладки           | `npx shadcn add tabs`     |
| Toast     | Уведомления       | `npx shadcn add sonner`   |
