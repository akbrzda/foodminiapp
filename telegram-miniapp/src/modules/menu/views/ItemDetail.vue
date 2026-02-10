<template>
  <div class="item-detail">
    <PageHeader :title="pageTitle" />
    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="item" class="content page-container">
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
        <p class="item-composition" v-if="item.composition">Состав: {{ item.composition }}</p>
        <p class="item-weight" v-if="displayWeight">{{ displayWeight }}</p>
        <div class="kbju" v-if="kbjuPer100 || kbjuPerServing">
          <div class="kbju-title">КБЖУ на 100{{ kbjuUnitLabel }}</div>
          <div class="kbju-values">{{ kbjuPer100 || "—" }}</div>
          <div class="kbju-title">КБЖУ на порцию</div>
          <div class="kbju-values">{{ kbjuPerServing || "—" }}</div>
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
          <div
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            class="modifier-card"
            :class="{
              active: isModifierSelected(group.id, modifier.id),
              disabled: isModifierUnavailable(modifier),
            }"
            @click="increaseModifier(group, modifier)"
          >
            <div v-if="getModifierCount(group.id, modifier.id) > 0" class="modifier-count-badge">x{{ getModifierCount(group.id, modifier.id) }}</div>
            <div class="modifier-card-image">
              <img v-if="modifier.image_url" :src="normalizeImageUrl(modifier.image_url)" :alt="modifier.name" />
            </div>
            <div class="modifier-card-name">
              {{ modifier.name }}
              <span v-if="getModifierWeight(modifier)" class="modifier-weight">{{ getModifierWeight(modifier) }}</span>
            </div>
            <div class="modifier-card-footer" :class="{ 'has-controls': getModifierCount(group.id, modifier.id) > 0 }">
              <button
                v-if="getModifierCount(group.id, modifier.id) > 0"
                type="button"
                class="modifier-ctrl"
                aria-label="Уменьшить количество добавки"
                @click.stop="decreaseModifier(group, modifier)"
              >
                <Minus size="12" />
              </button>
              <span v-else class="modifier-ctrl-placeholder"></span>
              <span class="modifier-card-price">{{ formatPrice(getModifierPrice(modifier)) }} ₽</span>
              <button
                v-if="getModifierCount(group.id, modifier.id) > 0"
                type="button"
                class="modifier-ctrl"
                aria-label="Увеличить количество добавки"
                @click.stop="increaseModifier(group, modifier)"
              >
                <Plus size="12" />
              </button>
              <span v-else class="modifier-ctrl-placeholder"></span>
            </div>
            <span v-if="isModifierUnavailable(modifier)" class="modifier-stop">Недоступно</span>
          </div>
        </div>
      </div>
      <div class="section" v-for="group in optionalModifierGroups" :key="group.id">
        <h2 class="section-title">{{ group.name }}</h2>
        <div class="modifiers">
          <div
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            class="modifier-card"
            :class="{
              active: isModifierSelected(group.id, modifier.id),
              disabled: isModifierUnavailable(modifier),
            }"
            @click="increaseModifier(group, modifier)"
          >
            <div v-if="getModifierCount(group.id, modifier.id) > 0" class="modifier-count-badge">x{{ getModifierCount(group.id, modifier.id) }}</div>
            <div class="modifier-card-image">
              <img v-if="modifier.image_url" :src="normalizeImageUrl(modifier.image_url)" :alt="modifier.name" />
            </div>
            <div class="modifier-card-name">
              {{ modifier.name }}
              <span v-if="getModifierWeight(modifier)" class="modifier-weight">· {{ getModifierWeight(modifier) }}</span>
            </div>
            <div class="modifier-card-footer" :class="{ 'has-controls': getModifierCount(group.id, modifier.id) > 0 }">
              <button
                v-if="getModifierCount(group.id, modifier.id) > 0"
                type="button"
                class="modifier-ctrl"
                aria-label="Уменьшить количество добавки"
                @click.stop="decreaseModifier(group, modifier)"
              >
                <Minus size="12" />
              </button>
              <span v-else class="modifier-ctrl-placeholder"></span>
              <span class="modifier-card-price">{{ formatPrice(getModifierPrice(modifier)) }} ₽</span>
              <button
                v-if="getModifierCount(group.id, modifier.id) > 0"
                type="button"
                class="modifier-ctrl"
                aria-label="Увеличить количество добавки"
                @click.stop="increaseModifier(group, modifier)"
              >
                <Plus size="12" />
              </button>
              <span v-else class="modifier-ctrl-placeholder"></span>
            </div>
            <span v-if="isModifierUnavailable(modifier)" class="modifier-stop">Недоступно</span>
          </div>
        </div>
      </div>
    </div>
    <div class="footer" :class="{ 'hidden-on-keyboard': isKeyboardOpen }" v-if="item">
      <div class="footer-content">
        <div v-if="!cartItem" class="add-button-wrapper">
          <button class="add-to-cart-btn action-btn btn-primary" :disabled="!canAddToCart" @click="addToCart">
            {{ canAddToCart ? `Добавить за ${formatPrice(totalPrice)} ₽` : addDisabledReason }}
          </button>
        </div>
        <div v-else class="quantity-button-wrapper">
          <button class="qty-btn" aria-label="Уменьшить количество" :disabled="!canOrder" @click="decreaseQuantity"><Minus size="12" /></button>
          <div class="qty-info">
            <span class="qty-price"> {{ formatPrice(cartItem.totalPrice) }} ₽ × {{ cartItem.quantity }} </span>
          </div>
          <button class="qty-btn" aria-label="Увеличить количество" :disabled="!canOrder" @click="increaseQuantity"><Plus size="12" /></button>
        </div>
        <button v-if="ordersEnabled && cartStore.itemsCount > 0" class="cart-btn" aria-label="Перейти в корзину" @click="goToCart">
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
import { ShoppingCart, Minus, Plus } from "lucide-vue-next";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useMenuStore } from "@/modules/menu/stores/menu.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { useKeyboardHandler } from "@/shared/composables/useKeyboardHandler";
import { menuAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { formatPrice, normalizeImageUrl } from "@/shared/utils/format";
import { formatModifierWeight, formatWeight, formatWeightValue } from "@/shared/utils/weight";
import { devError } from "@/shared/utils/logger.js";
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
const pageTitle = computed(() => item.value?.name || "Блюдо");
const ordersEnabled = computed(() => settingsStore.ordersEnabled);
const canOrder = computed(() => {
  if (!ordersEnabled.value) return false;
  if (locationStore.isDelivery) return settingsStore.deliveryEnabled;
  if (locationStore.isPickup) return settingsStore.pickupEnabled;
  return false;
});
const requiredModifierGroups = computed(() => {
  if (!item.value?.modifier_groups) return [];
  return item.value.modifier_groups.filter((g) => g.is_required);
});
const normalizeNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const getGroupMax = (group) => {
  const max = normalizeNumber(group?.max_selections);
  return max !== null && max > 0 ? max : null;
};
const getGroupMin = (group) => {
  const min = normalizeNumber(group?.min_selections);
  return min !== null && min > 0 ? min : 0;
};
const displayImageUrl = computed(() => {
  if (item.value?.image_url) return normalizeImageUrl(item.value.image_url);
  const fallbackItem = menuStore.getItemById?.(parseInt(route.params.id, 10));
  return normalizeImageUrl(fallbackItem?.image_url);
});
const kbjuUnitLabel = computed(() => {
  const unit = selectedVariant.value?.weight_unit || item.value?.weight_unit;
  return unit === "ml" || unit === "l" ? "мл" : "г";
});
const kbjuPer100 = computed(() => {
  const source = selectedVariant.value || item.value;
  if (!source) return "";
  const values = {
    calories: source.calories_per_100g,
    proteins: source.proteins_per_100g,
    fats: source.fats_per_100g,
    carbs: source.carbs_per_100g,
  };
  const hasData = Object.values(values).some((value) => Number.isFinite(Number(value)));
  if (!hasData) return "";
  const formatPair = (label, per100) => {
    if (per100 === null || per100 === undefined) return "";
    const first = Number.isFinite(Number(per100)) ? formatPrice(per100) : "—";
    return `${label}: ${first}`;
  };
  return [formatPair("К", values.calories), formatPair("Б", values.proteins), formatPair("Ж", values.fats), formatPair("У", values.carbs)]
    .filter(Boolean)
    .join(" • ");
});
const kbjuPerServing = computed(() => {
  const source = selectedVariant.value || item.value;
  if (!source) return "";
  const values = {
    calories: source.calories_per_serving,
    proteins: source.proteins_per_serving,
    fats: source.fats_per_serving,
    carbs: source.carbs_per_serving,
  };
  const hasData = Object.values(values).some((value) => Number.isFinite(Number(value)));
  if (!hasData) return "";
  const formatPair = (label, value) => {
    if (value === null || value === undefined) return "";
    const first = Number.isFinite(Number(value)) ? formatPrice(value) : "—";
    return `${label}: ${first}`;
  };
  return [formatPair("К", values.calories), formatPair("Б", values.proteins), formatPair("Ж", values.fats), formatPair("У", values.carbs)]
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
      const groupMap = selectedModifiers.value[group.id] || {};
      for (const [modifierId, count] of Object.entries(groupMap)) {
        const qty = Number(count) || 0;
        if (qty <= 0) continue;
        const modifier = group.modifiers.find((m) => m.id === Number(modifierId));
        if (!modifier) continue;
        const weightValue = modifier.weight ?? null;
        const weightUnit = modifier.weight_unit ?? null;
        for (let i = 0; i < qty; i += 1) {
          modifiers.push({
            id: modifier.id,
            name: modifier.name,
            price: getModifierPrice(modifier),
            group_id: group.id,
            group_name: group.name,
            weight_value: weightValue,
            weight_unit: weightUnit,
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
      if (menuStore.isCacheFresh(locationStore.selectedCity.id, fulfillmentType, branchId)) {
        item.value = menuStore.getItemById?.(itemId) || null;
        if (item.value) return;
      } else {
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
    }
    const fulfillmentType = locationStore.isPickup ? "pickup" : "delivery";
    const cityId = locationStore.selectedCity?.id || null;
    const response = await menuAPI.getItemDetails(route.params.id, { city_id: cityId, fulfillment_type: fulfillmentType });
    item.value = response.data.item;
  } catch (err) {
    devError("Не удалось загрузить блюдо:", err);
    error.value = "Не удалось загрузить позицию";
  } finally {
    loading.value = false;
  }
}
function selectVariant(variant) {
  hapticFeedback("light");
  selectedVariant.value = variant;
}
const getGroupTotalCount = (groupId) => {
  const groupMap = selectedModifiers.value[groupId] || {};
  return Object.values(groupMap).reduce((sum, value) => sum + (Number(value) || 0), 0);
};
const getModifierCount = (groupId, modifierId) => {
  const groupMap = selectedModifiers.value[groupId] || {};
  return Number(groupMap[modifierId] || 0);
};
const increaseModifier = (group, modifier) => {
  hapticFeedback("light");
  if (isModifierUnavailable(modifier)) return;
  const newSelectedModifiers = { ...selectedModifiers.value };
  const groupMap = { ...(newSelectedModifiers[group.id] || {}) };
  if (group.type === "single") {
    newSelectedModifiers[group.id] = { [modifier.id]: 1 };
    selectedModifiers.value = newSelectedModifiers;
    return;
  }
  const current = Number(groupMap[modifier.id] || 0);
  const groupMax = getGroupMax(group);
  if (groupMax !== null && current >= groupMax) {
    return;
  }
  groupMap[modifier.id] = current + 1;
  newSelectedModifiers[group.id] = groupMap;
  selectedModifiers.value = newSelectedModifiers;
};
const decreaseModifier = (group, modifier) => {
  hapticFeedback("light");
  const newSelectedModifiers = { ...selectedModifiers.value };
  const groupMap = { ...(newSelectedModifiers[group.id] || {}) };
  const current = Number(groupMap[modifier.id] || 0);
  if (current <= 1) {
    delete groupMap[modifier.id];
  } else {
    groupMap[modifier.id] = current - 1;
  }
  newSelectedModifiers[group.id] = groupMap;
  selectedModifiers.value = newSelectedModifiers;
};
function isModifierSelected(groupId, modifierId) {
  return getModifierCount(groupId, modifierId) > 0;
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
  return parseFloat(modifier.price) || 0;
}
function getModifierWeight(modifier) {
  if (!modifier) return "";
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
      const selectedCount = getGroupTotalCount(group.id);
      const minValue = getGroupMin(group);
      const minSelections = group.is_required ? Math.max(1, minValue || 1) : minValue || 0;
      if (selectedCount < minSelections) return false;
      const groupMax = getGroupMax(group);
      if (groupMax !== null) {
        const groupMap = selectedModifiers.value[group.id] || {};
        const exceedsMax = Object.values(groupMap).some((value) => Number(value || 0) > groupMax);
        if (exceedsMax) return false;
      }
      if (group.type === "single" && selectedCount > 1) return false;
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
      const groupMap = selectedModifiers.value[group.id] || {};
      for (const [modifierId, count] of Object.entries(groupMap)) {
        const qty = Number(count) || 0;
        if (qty <= 0) continue;
        const modifier = group.modifiers.find((m) => m.id === Number(modifierId));
        if (modifier) {
          price += getModifierPrice(modifier) * qty;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.modifier-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background: var(--color-background);
  cursor: pointer;
  transition: border-color 0.2s;
  height: 178px;
  padding: 4px;
}
.modifier-card.disabled {
  opacity: 0.6;
  pointer-events: none;
}
.modifier-card.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px rgba(255, 210, 0, 0.25);
}
.modifier-count-badge {
  width: 22px;
  height: 22px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  border-radius: 999px;
}
.modifier-card-image {
  width: 100%;
  height: 104px;
  border-radius: var(--border-radius-md);
  background: var(--color-background-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.modifier-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.modifier-card-name {
  font-size: var(--font-size-caption);
  color: var(--color-text-primary);
  text-align: center;
  line-height: 1.2;
  min-height: 30px;
}
.modifier-weight {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-left: 6px;
}
.modifier-card-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
}
.modifier-card-price {
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-align: center;
}
.modifier-ctrl {
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.modifier-ctrl-placeholder {
  width: 24px;
  height: 24px;
}
.modifier-stop {
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-error);
  text-align: center;
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
