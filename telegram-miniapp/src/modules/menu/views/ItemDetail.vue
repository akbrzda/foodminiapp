<template>
  <div class="item-detail">
    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="item" class="content">
      <div class="item-image-wrapper" v-if="displayImageUrl">
        <img :src="displayImageUrl" :alt="item.name" class="item-image" />
      </div>
      <div class="item-header">
        <h1 class="item-name">{{ item.name }}</h1>
        <div v-if="item.tags && item.tags.length > 0" class="tag-row">
          <span v-for="tag in item.tags" :key="tag.id" class="tag-pill">
            <span v-if="tag.icon">{{ tag.icon }}</span>
            {{ tag.name }}
          </span>
        </div>
        <p class="item-description" v-if="item.description">{{ item.description }}</p>
        <p class="item-composition" v-if="item.composition">Состав: {{ item.composition }}</p>
        <p class="item-weight" v-if="displayWeight">{{ displayWeight }}</p>
        <div class="kbju" v-if="kbjuLine">
          <div class="kbju-title">КБЖУ на 100{{ kbjuUnitLabel }} / на порцию</div>
          <div class="kbju-values">{{ kbjuLine }}</div>
        </div>
        <div v-if="item.in_stop_list" class="item-stop">Временно недоступно</div>
      </div>
      <div class="section" v-if="item.variants && item.variants.length > 0">
        <div class="variants">
          <button
            v-for="variant in item.variants"
            :key="variant.id"
            :class="['variant-btn', { active: selectedVariant?.id === variant.id, disabled: isVariantUnavailable(variant) }]"
            :disabled="isVariantUnavailable(variant)"
            @click="selectVariant(variant)"
          >
            <span class="variant-name">{{ variant.name }}</span>
            <span class="variant-price">{{ isVariantUnavailable(variant) ? "Недоступно" : `${formatPrice(variant.price)} ₽` }}</span>
          </button>
        </div>
      </div>
      <div class="section" v-for="group in requiredModifierGroups" :key="group.id">
        <h2 class="section-title">
          {{ group.name }}
          <span class="required-star">*</span>
        </h2>
        <div class="modifiers">
          <label
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            :class="['modifier-item', { active: isModifierSelected(group.id, modifier.id), disabled: isModifierUnavailable(modifier) }]"
          >
            <input
              :type="group.type === 'single' ? 'radio' : 'checkbox'"
              :name="`group-${group.id}`"
              :value="modifier.id"
              :checked="isModifierSelected(group.id, modifier.id)"
              :disabled="isModifierUnavailable(modifier)"
              @change="toggleModifier(group, modifier)"
            />
            <img v-if="modifier.image_url" :src="normalizeImageUrl(modifier.image_url)" :alt="modifier.name" class="modifier-image" />
            <span class="modifier-name">
              {{ modifier.name }}
              <span v-if="getModifierWeight(modifier)" class="modifier-weight">· {{ getModifierWeight(modifier) }}</span>
            </span>
            <span class="modifier-price" v-if="getModifierPrice(modifier) > 0">+{{ formatPrice(getModifierPrice(modifier)) }} ₽</span>
            <span v-if="isModifierUnavailable(modifier)" class="modifier-stop">Недоступно</span>
          </label>
        </div>
      </div>
      <div class="section" v-for="group in optionalModifierGroups" :key="group.id">
        <h2 class="section-title">{{ group.name }}</h2>
        <div class="modifiers">
          <label
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            :class="['modifier-item', { active: isModifierSelected(group.id, modifier.id), disabled: isModifierUnavailable(modifier) }]"
          >
            <input
              :type="group.type === 'single' ? 'radio' : 'checkbox'"
              :name="`group-${group.id}`"
              :value="modifier.id"
              :checked="isModifierSelected(group.id, modifier.id)"
              :disabled="isModifierUnavailable(modifier)"
              @change="toggleModifier(group, modifier)"
            />
            <img v-if="modifier.image_url" :src="normalizeImageUrl(modifier.image_url)" :alt="modifier.name" class="modifier-image" />
            <span class="modifier-name">
              {{ modifier.name }}
              <span v-if="getModifierWeight(modifier)" class="modifier-weight">· {{ getModifierWeight(modifier) }}</span>
            </span>
            <span class="modifier-price" v-if="getModifierPrice(modifier) > 0">+{{ formatPrice(getModifierPrice(modifier)) }} ₽</span>
            <span v-if="isModifierUnavailable(modifier)" class="modifier-stop">Недоступно</span>
          </label>
        </div>
      </div>
    </div>
    <div class="footer" :class="{ 'hidden-on-keyboard': isKeyboardOpen }" v-if="item">
      <div class="footer-content">
        <div v-if="!cartItem" class="add-button-wrapper">
          <button class="add-to-cart-btn" :disabled="!canAddToCart" @click="addToCart">
            {{ canAddToCart ? `Добавить за ${formatPrice(totalPrice)} ₽` : addDisabledReason }}
          </button>
        </div>
        <div v-else class="quantity-button-wrapper">
          <button class="qty-btn" :disabled="!canOrder" @click="decreaseQuantity">−</button>
          <div class="qty-info">
            <span class="qty-price"> {{ formatPrice(cartItem.totalPrice) }} ₽ × {{ cartItem.quantity }} </span>
          </div>
          <button class="qty-btn" :disabled="!canOrder" @click="increaseQuantity">+</button>
        </div>
        <button v-if="ordersEnabled && cartStore.itemsCount > 0" class="cart-btn" @click="goToCart">
          <ShoppingCart :size="24" />
          <span v-if="cartStore.itemsCount > 0" class="cart-badge">{{ cartStore.itemsCount }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ShoppingCart } from "lucide-vue-next";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useMenuStore } from "@/modules/menu/stores/menu.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { useKeyboardHandler } from "@/shared/composables/useKeyboardHandler";
import { menuAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { formatPrice, normalizeImageUrl } from "@/shared/utils/format";
const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const menuStore = useMenuStore();
const locationStore = useLocationStore();
const settingsStore = useSettingsStore();
const { isKeyboardOpen } = useKeyboardHandler();
const item = ref(null);
const loading = ref(true);
const error = ref(null);
const selectedVariant = ref(null);
const selectedModifiers = ref({});
const quantity = ref(1);
const isAdded = ref(false);
const ordersEnabled = computed(() => settingsStore.ordersEnabled);
const canOrder = computed(() => {
  if (!settingsStore.ordersEnabled) return false;
  if (locationStore.isDelivery) return settingsStore.deliveryEnabled;
  if (locationStore.isPickup) return settingsStore.pickupEnabled;
  return false;
});
const requiredModifierGroups = computed(() => {
  if (!item.value?.modifier_groups) return [];
  return item.value.modifier_groups.filter((g) => g.is_required);
});
const displayImageUrl = computed(() => {
  if (item.value?.image_url) return normalizeImageUrl(item.value.image_url);
  const fallbackItem = menuStore.getItemById?.(parseInt(route.params.id, 10));
  return normalizeImageUrl(fallbackItem?.image_url);
});
const kbjuUnitLabel = computed(() => {
  const unit = selectedVariant.value?.weight_unit || item.value?.weight_unit;
  return unit === "ml" || unit === "l" ? "мл" : "г";
});
const kbjuLine = computed(() => {
  const source = selectedVariant.value || item.value;
  if (!source) return "";
  const values = {
    calories: source.calories_per_100g,
    proteins: source.proteins_per_100g,
    fats: source.fats_per_100g,
    carbs: source.carbs_per_100g,
    caloriesServing: source.calories_per_serving,
    proteinsServing: source.proteins_per_serving,
    fatsServing: source.fats_per_serving,
    carbsServing: source.carbs_per_serving,
  };
  const hasData = Object.values(values).some((value) => Number.isFinite(Number(value)));
  if (!hasData) return "";
  const formatPair = (label, per100, perServing) => {
    if (per100 === null && perServing === null) return "";
    const first = Number.isFinite(Number(per100)) ? formatPrice(per100) : "—";
    const second = Number.isFinite(Number(perServing)) ? formatPrice(perServing) : "—";
    return `${label}: ${first} (${second})`;
  };
  return [
    formatPair("К", values.calories, values.caloriesServing),
    formatPair("Б", values.proteins, values.proteinsServing),
    formatPair("Ж", values.fats, values.fatsServing),
    formatPair("У", values.carbs, values.carbsServing),
  ]
    .filter(Boolean)
    .join(" • ");
});
const optionalModifierGroups = computed(() => {
  if (!item.value?.modifier_groups) return [];
  return item.value.modifier_groups.filter((g) => !g.is_required);
});
const cartItem = computed(() => {
  if (!item.value) return null;
  const matchingItems = cartStore.items.filter((cartItem) => {
    const sameId = cartItem.id === item.value.id;
    const sameVariant = (cartItem.variant_id || null) === (selectedVariant.value?.id || null);
    const sameModifiers = JSON.stringify(cartItem.modifiers || []) === JSON.stringify(getSelectedModifiersArray());
    return sameId && sameVariant && sameModifiers;
  });
  if (matchingItems.length === 0) return null;
  const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const totalPrice = matchingItems.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    return sum + price * (item.quantity || 1);
  }, 0);
  return {
    ...matchingItems[0],
    quantity: totalQuantity,
    totalPrice: totalPrice,
  };
});
function getSelectedModifiersArray() {
  const modifiers = [];
  if (item.value?.modifier_groups) {
    for (const group of item.value.modifier_groups) {
      const selectedIds = selectedModifiers.value[group.id] || [];
      for (const modifierId of selectedIds) {
        const modifier = group.modifiers.find((m) => m.id === modifierId);
        if (modifier) {
          modifiers.push({
            id: modifier.id,
            name: modifier.name,
            price: getModifierPrice(modifier),
            group_id: group.id,
            group_name: group.name,
          });
        }
      }
    }
  }
  return modifiers;
}
onMounted(async () => {
  await loadItem();
  if (item.value?.variants && item.value.variants.length > 0) {
    const firstAvailable = item.value.variants.find((variant) => !isVariantUnavailable(variant)) || item.value.variants[0];
    selectedVariant.value = firstAvailable;
  }
  if (cartItem.value) {
    isAdded.value = true;
    quantity.value = cartItem.value.quantity;
  }
});
watch(
  () => [selectedVariant.value, selectedModifiers.value],
  () => {
    if (cartItem.value) {
      isAdded.value = true;
      quantity.value = cartItem.value.quantity;
    } else {
      isAdded.value = false;
    }
  },
  { deep: true },
);
watch(
  () => cartStore.items,
  () => {
    if (cartItem.value) {
      isAdded.value = true;
      quantity.value = cartItem.value.quantity;
    } else {
      isAdded.value = false;
    }
  },
  { deep: true },
);
async function loadItem() {
  try {
    loading.value = true;
    error.value = null;
    const itemId = parseInt(route.params.id, 10);
    const cachedItem = menuStore.getItemById?.(itemId);
    if (cachedItem) {
      item.value = cachedItem;
      return;
    }
    if (locationStore.selectedCity) {
      const fulfillmentType = locationStore.isPickup ? "pickup" : "delivery";
      const branchId = locationStore.selectedBranch?.id || null;
      const menuResponse = await menuAPI.getMenu(locationStore.selectedCity.id, { fulfillmentType, branchId });
      const categories = menuResponse.data.categories || [];
      const allItems = categories.flatMap((category) => category.items || []);
      menuStore.setMenuData({
        cityId: locationStore.selectedCity.id,
        fulfillmentType,
        branchId,
        categories,
        items: allItems,
      });
      item.value = allItems.find((entry) => entry.id === itemId) || null;
      if (item.value) return;
    }
    const response = await menuAPI.getItemDetails(route.params.id);
    item.value = response.data.item;
  } catch (err) {
    console.error("Failed to load item:", err);
    error.value = "Не удалось загрузить позицию";
  } finally {
    loading.value = false;
  }
}
function selectVariant(variant) {
  hapticFeedback("light");
  selectedVariant.value = variant;
}
function toggleModifier(group, modifier) {
  hapticFeedback("light");
  if (isModifierUnavailable(modifier)) return;
  const newSelectedModifiers = { ...selectedModifiers.value };
  if (group.type === "single") {
    newSelectedModifiers[group.id] = [modifier.id];
  } else {
    if (!newSelectedModifiers[group.id]) {
      newSelectedModifiers[group.id] = [];
    } else {
      newSelectedModifiers[group.id] = [...newSelectedModifiers[group.id]];
    }
    const index = newSelectedModifiers[group.id].indexOf(modifier.id);
    if (index > -1) {
      newSelectedModifiers[group.id].splice(index, 1);
    } else {
      if (group.max_selections && newSelectedModifiers[group.id].length >= group.max_selections) {
        return;
      }
      newSelectedModifiers[group.id].push(modifier.id);
    }
  }
  selectedModifiers.value = newSelectedModifiers;
}
function isModifierSelected(groupId, modifierId) {
  if (!item.value?.modifier_groups) return false;
  const group = item.value.modifier_groups.find((g) => g.id === groupId);
  if (!group) return false;
  if (group.type === "single") {
    return selectedModifiers.value[groupId]?.[0] === modifierId;
  } else {
    return selectedModifiers.value[groupId]?.includes(modifierId) || false;
  }
}
function isVariantUnavailable(variant) {
  if (!variant) return true;
  if (variant.in_stop_list) return true;
  return variant.price === null || variant.price === undefined;
}
function isModifierUnavailable(modifier) {
  return !!modifier?.in_stop_list;
}
function getModifierPrice(modifier) {
  if (!modifier) return 0;
  if (selectedVariant.value && Array.isArray(modifier.variant_prices)) {
    const match = modifier.variant_prices.find((price) => price.variant_id === selectedVariant.value.id);
    if (match && match.price !== undefined && match.price !== null) {
      return parseFloat(match.price) || 0;
    }
  }
  return parseFloat(modifier.price) || 0;
}
function getModifierWeight(modifier) {
  if (!modifier) return "";
  if (selectedVariant.value && Array.isArray(modifier.variant_prices)) {
    const match = modifier.variant_prices.find((price) => price.variant_id === selectedVariant.value.id);
    const variantWeight = formatModifierWeight(match?.weight, match?.weight_unit);
    if (variantWeight) return variantWeight;
  }
  return formatModifierWeight(modifier.weight, modifier.weight_unit);
}
function increaseQuantity() {
  if (!canOrder.value) return;
  hapticFeedback("light");
  if (!item.value) return;
  const modifiers = getSelectedModifiersArray();
  const finalPrice = parseFloat(totalPrice.value) || 0;
  cartStore.addItem({
    id: item.value.id,
    category_id: item.value.category_id,
    name: item.value.name,
    price: finalPrice,
    weight: item.value.weight || null,
    variant_id: selectedVariant.value?.id || null,
    variant_name: selectedVariant.value?.name || null,
    quantity: 1,
    modifiers: modifiers,
    image_url: item.value.image_url,
  });
}
function getMatchingCartItems() {
  if (!item.value) return [];
  const modifiers = getSelectedModifiersArray();
  return cartStore.items.filter((cartItem) => {
    const sameId = cartItem.id === item.value.id;
    const sameVariant = (cartItem.variant_id || null) === (selectedVariant.value?.id || null);
    const sameModifiers = JSON.stringify(cartItem.modifiers || []) === JSON.stringify(modifiers);
    return sameId && sameVariant && sameModifiers;
  });
}
function decreaseQuantity() {
  if (!canOrder.value) return;
  hapticFeedback("light");
  if (!item.value) return;
  const matchingItems = getMatchingCartItems();
  if (matchingItems.length === 0) {
    isAdded.value = false;
    return;
  }
  const firstItem = matchingItems[0];
  const index = cartStore.items.indexOf(firstItem);
  if (index === -1) {
    isAdded.value = false;
    return;
  }
  if (firstItem.quantity > 1) {
    cartStore.updateQuantity(index, firstItem.quantity - 1);
  } else {
    cartStore.removeItem(index);
    isAdded.value = false;
  }
}
function goToCart() {
  router.push("/cart");
}
const canAddToCart = computed(() => {
  if (!item.value) return false;
  if (!canOrder.value) return false;
  if (item.value.variants && item.value.variants.length > 0) {
    if (!selectedVariant.value) return false;
    if (selectedVariant.value.in_stop_list) return false;
  }
  if (item.value.modifier_groups) {
    for (const group of item.value.modifier_groups) {
      const selectedCount = selectedModifiers.value[group.id]?.length || 0;
      const minSelections = group.is_required ? Math.max(1, group.min_selections || 1) : group.min_selections || 0;
      if (selectedCount < minSelections) return false;
      if (group.max_selections && selectedCount > group.max_selections) return false;
    }
  }
  if (item.value.in_stop_list) return false;
  return true;
});
const addDisabledReason = computed(() => {
  if (!item.value) return "Недоступно";
  if (!canOrder.value) return "Заказы недоступны";
  if (item.value.in_stop_list) return "Недоступно";
  if (selectedVariant.value?.in_stop_list) return "Недоступно";
  return "Выберите обязательные параметры";
});
const totalPrice = computed(() => {
  let price = 0;
  if (selectedVariant.value) {
    price = parseFloat(selectedVariant.value.price) || 0;
  } else if (item.value) {
    price = parseFloat(item.value.price) || 0;
  }
  if (item.value?.modifier_groups) {
    for (const group of item.value.modifier_groups) {
      const selectedIds = selectedModifiers.value[group.id] || [];
      if (selectedIds.length > 0) {
        for (const modifierId of selectedIds) {
          const modifier = group.modifiers.find((m) => m.id === modifierId);
          if (modifier) {
            price += getModifierPrice(modifier);
          }
        }
      }
    }
  }
  return price;
});
const displayWeight = computed(() => {
  if (!item.value) return "";
  if (selectedVariant.value) {
    const variantWeight = formatWeightValue(selectedVariant.value.weight_value, selectedVariant.value.weight_unit);
    if (variantWeight) return variantWeight;
  }
  const itemWeight = formatWeightValue(item.value.weight_value, item.value.weight_unit);
  if (itemWeight) return itemWeight;
  return formatWeight(item.value.weight);
});
function addToCart() {
  if (!canAddToCart.value) return;
  hapticFeedback("success");
  const modifiers = getSelectedModifiersArray();
  const finalPrice = totalPrice.value;
  cartStore.addItem({
    id: item.value.id,
    category_id: item.value.category_id,
    name: item.value.name,
    price: finalPrice,
    weight: item.value.weight || null,
    weight_value: selectedVariant.value?.weight_value ?? item.value.weight_value ?? null,
    weight_unit: selectedVariant.value?.weight_unit ?? item.value.weight_unit ?? null,
    variant_id: selectedVariant.value?.id || null,
    variant_name: selectedVariant.value?.name || null,
    quantity: 1,
    modifiers: modifiers,
    image_url: item.value.image_url,
  });
  isAdded.value = true;
}
function formatWeight(value) {
  if (!value) return "";
  return String(value);
}
function getUnitLabel(unit) {
  const units = {
    g: "г",
    kg: "кг",
    ml: "мл",
    l: "л",
    pcs: "шт",
  };
  return units[unit] || "";
}
function formatWeightValue(value, unit) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0 || !unit) {
    return "";
  }
  const unitLabel = getUnitLabel(unit);
  if (!unitLabel) return "";
  return `${formatPrice(parsedValue)} ${unitLabel}`;
}
function formatModifierWeight(value, unit) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return "";
  }
  const normalizedUnit = unit || "g";
  const unitLabel = getUnitLabel(normalizedUnit);
  if (unitLabel) {
    return `${formatPrice(parsedValue)} ${unitLabel}`;
  }
  if (unit) {
    return `${formatPrice(parsedValue)} ${unit}`;
  }
  return `${formatPrice(parsedValue)} г`;
}
</script>
<style scoped>
.item-detail {
  min-height: 100vh;
  background: var(--color-background);
  padding-bottom: 96px;
}
.loading,
.error {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.error {
  color: #ff0000;
}
.content {
  padding: 12px;
}
.item-image-wrapper {
  width: 100%;
  max-height: 300px;
  overflow: hidden;
}
.item-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-header {
  margin-bottom: 16px;
}
.item-name {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.tag-pill {
  background: #eef2f6;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.item-description {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
}
.item-composition {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin: 8px 0 0;
}
.item-weight {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
  margin-top: 6px;
}
.kbju {
  margin-top: 10px;
  background: #f4f7fa;
  border-radius: var(--border-radius-md);
  padding: 10px;
}
.kbju-title {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.kbju-values {
  font-size: 12px;
  color: var(--color-text-primary);
}
.item-stop {
  margin-top: 8px;
  font-size: 12px;
  color: #c0392b;
}
.section {
  margin-bottom: 24px;
}
.section-title {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.required-star {
  color: #ff0000;
}
.section-subtitle {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin: 0 0 12px 0;
}
.variants {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 4px;
  padding: 2px;
  border-radius: var(--border-radius-md);
  background: #f5f7f9;
}
.variants::-webkit-scrollbar {
  display: none;
}
.variant-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
  flex-shrink: 0;
  background: none;
  border: none;
}
.variant-btn.active {
  border-radius: var(--border-radius-md);
  border-color: var(--color-primary);
  background: var(--color-primary);
  margin: 1px;
}
.variant-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-align: center;
}
.variant-btn.active .variant-name {
  color: var(--color-text-primary);
}
.variant-price {
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-secondary);
  text-align: center;
}
.variant-btn.active .variant-price {
  color: var(--color-text-primary);
}
.variant-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.modifiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.modifier-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s;
}
.modifier-item.disabled {
  opacity: 0.6;
}
.modifier-image {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
}
.modifier-item:hover {
  background: var(--color-background-secondary);
}
.modifier-item.active {
  border-color: var(--color-primary);
  background: var(--color-background-secondary);
}
.modifier-item input[type="radio"],
.modifier-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.modifier-name {
  flex: 1;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}
.modifier-weight {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-left: 6px;
}
.modifier-price {
  margin-left: auto;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.modifier-stop {
  margin-left: auto;
  font-size: 11px;
  color: #c0392b;
}
.footer {
  position: fixed;
  bottom: 40px;
  left: 12px;
  right: 12px;
  z-index: 120;
}
.footer-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.add-button-wrapper {
  flex: 1;
}
.add-to-cart-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform 0.15s ease;
  min-height: 56px;
}
.add-to-cart-btn:disabled {
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  cursor: not-allowed;
  transform: none;
}
.add-to-cart-btn:not(:disabled):hover {
  background: var(--color-primary-hover);
}
.add-to-cart-btn:active {
  transform: scale(0.98);
}
.quantity-button-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-primary);
  border-radius: var(--border-radius-md);
  min-height: 52px;
}
.qty-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--border-radius-sm);
  background: rgba(0, 0, 0, 0.08);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  flex-shrink: 0;
}
.qty-btn:hover {
  background: rgba(0, 0, 0, 0.15);
}
.qty-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 140px;
}
.qty-value {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
}
.qty-price {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
}
.cart-btn {
  width: 56px;
  height: 56px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform 0.15s ease;
  flex-shrink: 0;
}
.cart-btn:hover {
  background: var(--color-primary-hover);
}
.cart-btn:active {
  transform: scale(0.98);
}
.cart-badge {
  position: absolute;
  top: 8px;
  right: 12px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--color-text-primary);
  color: var(--color-background);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
