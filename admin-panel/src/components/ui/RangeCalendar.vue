<template>
  <div ref="rootRef" :class="cn('relative w-full', props.class)">
    <button
      v-if="!props.inline"
      type="button"
      class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      @click="toggleOpen"
    >
      <span :class="rangeLabelClass">{{ rangeLabel }}</span>
      <CalendarIcon class="text-muted-foreground" :size="16" />
    </button>
    <div v-if="isOpen" :class="cn(panelPositionClass, panelWidthClass, 'rounded-md border border-border bg-card p-3 shadow-lg')">
      <div :class="calendarGridClass">
        <div v-if="showTwoMonths">
          <div class="mb-2 flex items-center justify-between">
            <button class="rounded-md p-1 text-muted-foreground hover:bg-accent/40" type="button" @click="shiftMonth(-1)">
              <ChevronLeft :size="16" />
            </button>
            <div class="text-sm font-medium text-foreground">{{ formatMonthLabel(currentMonth) }}</div>
            <button class="rounded-md p-1 text-muted-foreground hover:bg-accent/40" type="button" @click="shiftMonth(1)">
              <ChevronRight :size="16" />
            </button>
          </div>
          <div class="grid grid-cols-7 text-center text-xs text-muted-foreground">
            <span v-for="weekday in weekdayLabels" :key="weekday" class="py-1">{{ weekday }}</span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1">
            <button
              v-for="day in monthDays(currentMonth)"
              :key="day.key"
              type="button"
              :class="day.classes"
              :disabled="day.disabled"
              @click="selectDate(day.date)"
            >
              {{ day.label }}
            </button>
          </div>
        </div>
        <div>
          <div class="mb-2 flex items-center justify-center">
            <div class="text-sm font-medium text-foreground">{{ formatMonthLabel(nextMonth) }}</div>
          </div>
          <div class="grid grid-cols-7 text-center text-xs text-muted-foreground">
            <span v-for="weekday in weekdayLabels" :key="weekday" class="py-1">{{ weekday }}</span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1">
            <button
              v-for="day in monthDays(nextMonth)"
              :key="day.key"
              type="button"
              :class="day.classes"
              :disabled="day.disabled"
              @click="selectDate(day.date)"
            >
              {{ day.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <div>{{ helperLabel }}</div>
        <button class="text-primary hover:underline" type="button" @click="clearRange">Очистить</button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { cn } from "../../lib/utils.js";
const props = defineProps({
  from: { type: String, default: "" },
  to: { type: String, default: "" },
  allowFuture: { type: Boolean, default: false },
  months: { type: Number, default: 2 },
  inline: { type: Boolean, default: false },
  class: { type: String, default: "" },
});
const emit = defineEmits(["update:from", "update:to"]);
const open = ref(false);
const rootRef = ref(null);
const isOpen = computed(() => (props.inline ? true : open.value));
const showTwoMonths = computed(() => props.months === 2);
const panelWidthClass = computed(() => {
  if (props.inline) return "w-full";
  return props.months === 1 ? "w-[360px]" : "w-[680px]";
});
const calendarGridClass = computed(() => (showTwoMonths.value ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"));
const panelPositionClass = computed(() =>
  props.inline ? "mt-2" : "absolute right-0 z-20 mt-2 max-w-[calc(100vw-2rem)]",
);
const parseDate = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const formatISO = (date) => {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const startOfWeek = (date) => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return addDays(date, -diff);
};
const endOfWeek = (date) => addDays(startOfWeek(date), 6);
const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isBefore = (a, b) => a && b && a.getTime() < b.getTime();
const isAfter = (a, b) => a && b && a.getTime() > b.getTime();
const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
const fromDate = computed(() => parseDate(props.from));
const toDate = computed(() => parseDate(props.to));
const currentMonth = ref(startOfMonth(fromDate.value || new Date()));
const nextMonth = computed(() => addMonths(currentMonth.value, 1));
watch(
  () => props.from,
  (value) => {
    const parsed = parseDate(value);
    if (parsed) currentMonth.value = startOfMonth(parsed);
  },
);
const monthLabelFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});
const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const weekdayBase = new Date(2022, 0, 3);
const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(addDays(weekdayBase, index)).replace(".", ""));
const formatMonthLabel = (date) => {
  const label = monthLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const formatDayLabel = (date) => dayLabelFormatter.format(date);
const rangeLabel = computed(() => {
  if (fromDate.value && toDate.value) {
    return `${formatDayLabel(fromDate.value)} — ${formatDayLabel(toDate.value)}`;
  }
  if (fromDate.value) {
    return `${formatDayLabel(fromDate.value)} — ...`;
  }
  return "Выберите диапазон";
});
const rangeLabelClass = computed(() => (fromDate.value ? "text-foreground" : "text-muted-foreground"));
const helperLabel = computed(() => {
  if (fromDate.value && toDate.value) {
    return "Диапазон выбран";
  }
  if (fromDate.value) {
    return "Выберите дату окончания";
  }
  return "Выберите дату начала";
});
const monthDays = (monthDate) => {
  const start = startOfWeek(startOfMonth(monthDate));
  const end = endOfWeek(endOfMonth(monthDate));
  const days = [];
  const now = today();
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const inMonth = cursor.getMonth() === monthDate.getMonth();
    const isStart = isSameDay(cursor, fromDate.value);
    const isEnd = isSameDay(cursor, toDate.value);
    const inRange = fromDate.value && toDate.value && (isAfter(cursor, fromDate.value) || isStart) && (isBefore(cursor, toDate.value) || isEnd);
    const isToday = isSameDay(cursor, now);
    const isFuture = !props.allowFuture && isAfter(cursor, now);
    const classes = cn(
      "h-9 w-9 rounded-md text-sm transition-colors",
      inMonth ? "text-foreground" : "text-muted-foreground/50",
      isFuture ? "cursor-not-allowed opacity-40" : "hover:bg-accent/40",
      inRange ? "bg-primary/10 text-foreground" : "",
      isStart || isEnd ? "bg-primary text-primary-foreground hover:bg-primary" : "",
      isToday && !isStart && !isEnd ? "border border-primary/40" : "",
    );
    days.push({
      date: new Date(cursor),
      label: cursor.getDate(),
      key: formatISO(cursor),
      disabled: isFuture,
      classes,
    });
  }
  return days;
};
const selectDate = (date) => {
  if (!props.allowFuture && isAfter(date, today())) return;
  if (!fromDate.value || (fromDate.value && toDate.value)) {
    emit("update:from", formatISO(date));
    emit("update:to", "");
    return;
  }
  if (isBefore(date, fromDate.value)) {
    emit("update:from", formatISO(date));
    emit("update:to", "");
    return;
  }
  emit("update:to", formatISO(date));
  if (!props.inline) {
    open.value = false;
  }
};
const clearRange = () => {
  emit("update:from", "");
  emit("update:to", "");
};
const shiftMonth = (amount) => {
  const next = addMonths(currentMonth.value, amount);
  if (!props.allowFuture && amount > 0 && isAfter(next, startOfMonth(today()))) {
    currentMonth.value = startOfMonth(today());
    return;
  }
  currentMonth.value = next;
};
const toggleOpen = () => {
  if (props.inline) return;
  open.value = !open.value;
};
const handleClickOutside = (event) => {
  if (props.inline || !open.value || !rootRef.value) return;
  if (!rootRef.value.contains(event.target)) {
    open.value = false;
  }
};
onMounted(() => {
  document.addEventListener("mousedown", handleClickOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});
</script>
