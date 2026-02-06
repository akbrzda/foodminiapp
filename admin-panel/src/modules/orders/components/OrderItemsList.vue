<template>
  <div class="rounded-lg border border-border bg-muted/50 p-3">
    <div v-for="(item, index) in items" :key="item.id" class="py-2">
      <div class="flex items-center justify-between text-sm font-semibold text-foreground">
        <span>{{ item.item_name }}</span>
        <span>{{ formatCurrency(item.subtotal) }}</span>
      </div>
      <div v-if="item.modifiers?.length" class="text-xs text-muted-foreground">
        {{ formatOrderModifiers(item.modifiers) }}
      </div>
      <div v-if="index < items.length - 1" class="mt-2 h-px bg-border"></div>
    </div>
  </div>
</template>

<script setup>
import { formatCurrency } from "@/shared/utils/format.js";

defineProps({
  items: { type: Array, default: () => [] },
});

// Форматирование веса модификатора
const formatModifierWeight = (value, unit) => {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const units = {
    g: "г",
    kg: "кг",
    ml: "мл",
    l: "л",
    pcs: "шт",
  };
  const label = units[unit] || unit || "";
  return label ? `${numeric} ${label}` : `${numeric}`;
};

// Форматирование модификаторов заказа
const formatOrderModifiers = (modifiers = []) => {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return "";
  const grouped = new Map();
  modifiers.forEach((modifier) => {
    const name = modifier.modifier_name || "Дополнение";
    const weightText = formatModifierWeight(modifier.modifier_weight, modifier.modifier_weight_unit);
    const key = `${name}__${weightText || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, { name, weightText, count: 0 });
    }
    grouped.get(key).count += 1;
  });
  return Array.from(grouped.values())
    .map((entry) => {
      const weightPart = entry.weightText ? ` (${entry.weightText})` : "";
      const countPart = entry.count > 1 ? ` x${entry.count}` : "";
      return `${entry.name}${weightPart}${countPart}`;
    })
    .join(", ");
};
</script>
