<template>
  <div class="home">
    <AppHeader @toggleMenu="showMenu = true" />
    <div class="location-bar">
      <div v-if="!ordersEnabled" class="order-disabled">{{ orderDisabledReason }}</div>
      <template v-else>
        <div class="location-tabs" v-if="deliveryEnabled || pickupEnabled">
          <button v-if="deliveryEnabled" @click="setDeliveryType('delivery')" class="pill-tab" :class="{ active: locationStore.isDelivery }">
            Доставка
          </button>
          <button v-if="pickupEnabled" @click="setDeliveryType('pickup')" class="pill-tab" :class="{ active: locationStore.isPickup }">
            Самовывоз
          </button>
        </div>
        <div class="location-actions">
          <button @click="openDeliverySelector" class="action-pill">
            <span class="action-text">{{ actionButtonText }}</span>
          </button>
        </div>
      </template>
    </div>
    <div v-if="activeOrders.length > 0" class="active-orders-container">
      <div class="active-orders" :class="{ 'has-scroll': activeOrders.length > 1 }">
        <div v-for="order in activeOrders" :key="order.id" class="active-order" @click="router.push(`/order/${order.id}`)">
          <div class="order-status">
            <div class="order-type-icon">
              <svg
                v-if="order.order_type === 'delivery'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </div>
            <div class="status-indicator" :class="getStatusClass(order.status)"></div>
            <div class="order-info">
              <div class="order-title">{{ getStatusText(order.status, order.order_type) }}</div>
              <div class="order-subtitle">Заказ #{{ order.order_number }} • {{ formatPrice(order.total) }} ₽</div>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
      <div v-if="activeOrders.length > 1" class="scroll-hint">← Пролистайте →</div>
    </div>
    <div class="menu-section" v-if="locationStore.selectedCity">
      <div class="categories-sticky" v-if="menuStore.categories.length">
        <div class="categories" ref="categoriesRef">
          <button
            v-for="category in menuStore.categories"
            :key="category.id"
            :ref="
              (el) => {
                if (el) categoryRefs[category.id] = el;
              }
            "
            :class="['category-btn', { active: activeCategory === category.id }]"
            @click="scrollToCategory(category.id)"
          >
            {{ category.name }}
          </button>
        </div>
      </div>
      <div v-if="availableTags.length > 0" class="tags-filter">
        <button :class="['tag-pill', { active: selectedTagId === null }]" @click="selectTag(null)">Все</button>
        <button v-for="tag in availableTags" :key="tag.id" :class="['tag-pill', { active: selectedTagId === tag.id }]" @click="selectTag(tag.id)">
          <span class="tag-icon" v-if="tag.icon">{{ tag.icon }}</span>
          {{ tag.name }}
        </button>
      </div>
      <div class="menu-content" v-if="!menuStore.loading">
        <div v-for="category in menuStore.categories" :key="category.id" :id="`category-${category.id}`" class="category-section">
          <h2 class="category-title">{{ category.name }}</h2>
          <div class="items">
            <div
              v-for="item in getItemsByCategory(category.id)"
              :key="item.id"
              :class="['item-card', { disabled: isItemUnavailable(item) || !canOrder }]"
              @click="handleItemCardClick(item)"
            >
              <div class="item-image" v-if="item.image_url">
                <img :src="normalizeImageUrl(item.image_url)" :alt="item.name" />
              </div>
              <div class="item-info">
                <div class="item-text">
                  <h3>{{ item.name }}</h3>
                  <p class="description">{{ item.description }}</p>
                  <p class="item-weight" v-if="getDisplayWeight(item)">{{ getDisplayWeight(item) }}</p>
                  <div class="item-tags" v-if="item.tags && item.tags.length > 0">
                    <span v-for="tag in item.tags" :key="tag.id" class="item-tag">
                      <span v-if="tag.icon">{{ tag.icon }}</span>
                      {{ tag.name }}
                    </span>
                  </div>
                  <div v-if="isItemUnavailable(item)" class="item-unavailable">Временно недоступно</div>
                </div>
                <div class="item-footer">
                  <button
                    v-if="!getCartItem(item)"
                    class="add-btn"
                    :disabled="isItemUnavailable(item) || !canOrder"
                    @click.stop="handleItemAction(item)"
                  >
                    {{ getAddButtonLabel(item) }}
                  </button>
                  <div v-else class="quantity-controls">
                    <button class="qty-btn" :disabled="!canOrder" @click.stop="decreaseItemQuantity(item)">−</button>
                    <span class="qty-value">{{ getCartItem(item).quantity }}</span>
                    <button class="qty-btn" :disabled="!canOrder" @click.stop="increaseItemQuantity(item)">+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="loading" v-if="menuStore.loading">Меню загружается...</div>
      <div class="empty" v-if="!menuStore.loading && menuStore.categories.length === 0">Меню загружается...</div>
    </div>
    <button
      v-if="ordersEnabled && cartStore.itemsCount > 0"
      class="floating-cart"
      :class="{ 'hidden-on-keyboard': isKeyboardOpen }"
      @click="goToCart"
    >
      <span class="cart-left">
        <span class="cart-icon">
          <ShoppingCart :size="20" />
          <span class="cart-count">{{ cartStore.itemsCount }}</span>
        </span>
        <span class="cart-text">В корзину</span>
      </span>
      <span class="cart-total">{{ formatPrice(cartTotalWithDelivery) }} ₽</span>
    </button>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ShoppingCart } from "lucide-vue-next";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { useCartStore } from "@/modules/cart/stores/cart.js";
import { useMenuStore } from "@/modules/menu/stores/menu.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { useKeyboardHandler } from "@/shared/composables/useKeyboardHandler";
import { bonusesAPI, menuAPI, ordersAPI } from "@/shared/api/endpoints.js";
import { hapticFeedback } from "@/shared/services/telegram.js";
import { wsService } from "@/shared/services/websocket.js";
import AppHeader from "@/shared/components/AppHeader.vue";
import { formatPrice, normalizeImageUrl } from "@/shared/utils/format";
import { formatWeight, formatWeightValue } from "@/shared/utils/weight";
import { calculateDeliveryCost } from "@/shared/utils/deliveryTariffs";
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const locationStore = useLocationStore();
const cartStore = useCartStore();
const menuStore = useMenuStore();
const settingsStore = useSettingsStore();
const { isKeyboardOpen } = useKeyboardHandler();
const categoriesRef = ref(null);
const categoryRefs = ref({});
const showMenu = ref(false);
const activeCategory = ref(null);
const isScrolling = ref(false);
const activeOrders = ref([]);
const selectedTagId = ref(null);
let observer = null;
let orderStatusHandler = null;
const cityName = computed(() => locationStore.selectedCity?.name || "Когалым");
const ordersEnabled = computed(() => settingsStore.ordersEnabled);
const deliveryEnabled = computed(() => settingsStore.deliveryEnabled);
const pickupEnabled = computed(() => settingsStore.pickupEnabled);
const canOrder = computed(() => {
  if (!ordersEnabled.value) return false;
  if (locationStore.isDelivery) return deliveryEnabled.value;
  if (locationStore.isPickup) return pickupEnabled.value;
  return false;
});
const orderDisabledReason = computed(() => {
  if (!settingsStore.ordersEnabled) return "Прием заказов временно отключен";
  return "";
});
const actionButtonText = computed(() => {
  if (!ordersEnabled.value) return "Заказы недоступны";
  if (!deliveryEnabled.value && !pickupEnabled.value) return "Нет доступных способов";
  if (locationStore.isDelivery) {
    return locationStore.deliveryAddress ? truncateText(locationStore.deliveryAddress, 48) : "Укажите адрес";
  }
  if (locationStore.isPickup) {
    return locationStore.selectedBranch ? truncateText(locationStore.selectedBranch.name, 22) : "Выбрать филиал";
  }
  return "Укажите адрес";
});
onMounted(async () => {
  resolveDeliveryType();
  if (route.query.openCity === "1") {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    router.replace({ query: {} });
  }
  if (locationStore.selectedCity) {
    await loadMenu();
  }
  if (authStore.isAuthenticated) {
    await loadActiveOrder();
    setupOrderStatusListener();
  }
});
watch(
  () => [ordersEnabled.value, deliveryEnabled.value, pickupEnabled.value],
  () => {
    resolveDeliveryType();
  },
);
watch(
  () => locationStore.selectedCity,
  async (newCity) => {
    if (newCity) {
      await loadMenu();
    }
  },
);
watch(
  () => authStore.isAuthenticated,
  async (isAuth) => {
    if (!isAuth) {
      activeOrders.value = [];
      return;
    }
    await loadActiveOrder();
    setupOrderStatusListener();
  },
);
watch(
  () => [locationStore.deliveryType, locationStore.selectedBranch?.id],
  async () => {
    if (locationStore.selectedCity) {
      await loadMenu();
    }
  },
);
onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
  if (orderStatusHandler) {
    wsService.off("order-status-updated", orderStatusHandler);
  }
});
watch(
  () => activeCategory.value,
  async (categoryId) => {
    if (!categoryId) return;
    await nextTick();
    scrollCategoryIntoView(categoryId);
  },
);
async function loadActiveOrder() {
  try {
    const response = await ordersAPI.getMyOrders();
    const orders = response.data.orders || [];
    const active = orders.filter((order) => order.status !== "completed" && order.status !== "cancelled");
    activeOrders.value = active;
  } catch (error) {
    console.error("Failed to load active order:", error);
  }
}
function setupOrderStatusListener() {
  if (orderStatusHandler) return;
  orderStatusHandler = (data) => {
    if (!data?.orderId || !data?.newStatus) return;
    const orderId = String(data.orderId);
    const index = activeOrders.value.findIndex((order) => String(order.id) === orderId);
    if (index === -1) return;
    if (["completed", "cancelled"].includes(data.newStatus)) {
      activeOrders.value = activeOrders.value.filter((order) => order.id !== data.orderId);
      return;
    }
    const updated = { ...activeOrders.value[index], status: data.newStatus };
    activeOrders.value = [...activeOrders.value.slice(0, index), updated, ...activeOrders.value.slice(index + 1)];
  };
  wsService.on("order-status-updated", orderStatusHandler);
}
function getStatusText(status, orderType) {
  const isDelivery = orderType === "delivery";
  const deliveryStatuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: "Готов",
    delivering: "В пути",
    completed: "Доставлен",
    cancelled: "Отменён",
  };
  const pickupStatuses = {
    pending: "Ожидает подтверждения",
    confirmed: "Принят",
    preparing: "Готовится",
    ready: "Готов к выдаче",
    completed: "Выдан",
    cancelled: "Отменён",
  };
  const statuses = isDelivery ? deliveryStatuses : pickupStatuses;
  return statuses[status] || status;
}
function getStatusClass(status) {
  if (["pending"].includes(status)) return "status-pending";
  if (["confirmed", "preparing"].includes(status)) return "status-preparing";
  if (["ready", "delivering"].includes(status)) return "status-ready";
  if (["completed"].includes(status)) return "status-delivered";
  if (["cancelled"].includes(status)) return "status-cancelled";
  return "";
}
function openCitySelector() {
  window.dispatchEvent(new CustomEvent("open-city-popup"));
}
function openDeliverySelector() {
  if (!ordersEnabled.value) return;
  if (!locationStore.selectedCity) {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    return;
  }
  if (locationStore.isDelivery && !deliveryEnabled.value) return;
  if (locationStore.isPickup && !pickupEnabled.value) return;
  if (locationStore.isPickup) {
    router.push("/pickup-map");
    return;
  }
  router.push("/delivery-map");
}
function setDeliveryType(type) {
  if (!ordersEnabled.value) return;
  if (type === "delivery" && !deliveryEnabled.value) return;
  if (type === "pickup" && !pickupEnabled.value) return;
  locationStore.setDeliveryType(type);
}
function resolveDeliveryType() {
  if (!ordersEnabled.value) return;
  if (deliveryEnabled.value && pickupEnabled.value) return;
  if (deliveryEnabled.value) {
    locationStore.setDeliveryType("delivery");
  } else if (pickupEnabled.value) {
    locationStore.setDeliveryType("pickup");
  }
}
const deliveryCost = computed(() => {
  if (locationStore.deliveryType !== "delivery") return 0;
  const tariffs = locationStore.deliveryZone?.tariffs || [];
  return calculateDeliveryCost(tariffs, cartStore.totalPrice);
});
const cartTotalWithDelivery = computed(() => {
  return cartStore.totalPrice + deliveryCost.value;
});
function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
async function loadMenu() {
  if (!locationStore.selectedCity) return;
  const fulfillmentType = locationStore.isPickup ? "pickup" : "delivery";
  const branchId = locationStore.selectedBranch?.id || null;
  if (
    menuStore.cityId === locationStore.selectedCity.id &&
    menuStore.fulfillmentType === fulfillmentType &&
    menuStore.branchId === branchId &&
    menuStore.categories.length > 0 &&
    menuStore.items.length > 0
  ) {
    await nextTick();
    setupIntersectionObserver();
    return;
  }
  try {
    menuStore.setLoading(true);
    const menuResponse = await menuAPI.getMenu(locationStore.selectedCity.id, { fulfillmentType, branchId });
    const categories = menuResponse.data.categories || [];
    menuStore.setCategories(categories);
    const allItems = categories.flatMap((category) => category.items || []);
    menuStore.setMenuData({
      cityId: locationStore.selectedCity.id,
      fulfillmentType,
      branchId,
      categories,
      items: allItems,
    });
    selectedTagId.value = null;
    cartStore.refreshPricesFromMenu(allItems);
    if (categories.length > 0) {
      activeCategory.value = categories[0].id;
    }
    await nextTick();
    setupIntersectionObserver();
  } catch (error) {
    console.error("Failed to load menu:", error);
    menuStore.setError(error.message);
  } finally {
    menuStore.setLoading(false);
  }
}
function getItemsByCategory(categoryId) {
  const items = menuStore.getItemsByCategory(categoryId);
  if (selectedTagId.value === null) return items;
  return items.filter((item) => item.tags && item.tags.some((tag) => tag.id === selectedTagId.value));
}
function hasRequiredOptions(item) {
  return (item.variants && item.variants.length > 0) || (item.modifier_groups && item.modifier_groups.some((group) => group.is_required));
}
function getCartItem(item) {
  if (!hasRequiredOptions(item)) {
    return cartStore.items.find((cartItem) => {
      return cartItem.id === item.id && !cartItem.variant_id && (!cartItem.modifiers || cartItem.modifiers.length === 0);
    });
  }
  return null;
}
function handleItemAction(item) {
  hapticFeedback("light");
  if (isItemUnavailable(item)) return;
  if (hasRequiredOptions(item)) {
    openItem(item);
    return;
  }
  if (!canOrder.value) return;
  cartStore.addItem({
    id: item.id,
    category_id: item.category_id,
    name: item.name,
    price: item.price || 0,
    weight: item.weight || null,
    weight_value: item.weight_value || null,
    weight_unit: item.weight_unit || null,
    variant_id: null,
    variant_name: null,
    quantity: 1,
    modifiers: [],
    image_url: item.image_url,
  });
  hapticFeedback("success");
}
function getAddButtonLabel(item) {
  if (!canOrder.value) return "Заказы недоступны";
  if (isItemUnavailable(item)) return "Недоступно";
  return getItemPrice(item);
}
function getDisplayWeight(item) {
  if (!item) return "";
  if (item.variants && item.variants.length > 0) {
    const sorted = [...item.variants].sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    const cheapest = sorted[0];
    const variantWeight = formatWeightValue(cheapest?.weight_value, cheapest?.weight_unit);
    if (variantWeight) return variantWeight;
  }
  const itemWeight = formatWeightValue(item.weight_value, item.weight_unit);
  if (itemWeight) return itemWeight;
  return formatWeight(item.weight);
}
function increaseItemQuantity(item) {
  if (!canOrder.value) return;
  hapticFeedback("light");
  const cartItem = getCartItem(item);
  if (cartItem) {
    cartStore.updateQuantity(cartStore.items.indexOf(cartItem), cartItem.quantity + 1);
  }
}
function decreaseItemQuantity(item) {
  if (!canOrder.value) return;
  hapticFeedback("light");
  const cartItem = getCartItem(item);
  if (cartItem) {
    const index = cartStore.items.indexOf(cartItem);
    if (cartItem.quantity > 1) {
      cartStore.updateQuantity(index, cartItem.quantity - 1);
    } else {
      cartStore.removeItem(index);
    }
  }
}
function setupIntersectionObserver() {
  if (observer) {
    observer.disconnect();
  }
  const options = {
    root: null,
    rootMargin: "-100px 0px -50% 0px",
    threshold: 0,
  };
  observer = new IntersectionObserver((entries) => {
    if (isScrolling.value) return;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const categoryId = parseInt(entry.target.id.replace("category-", ""));
        activeCategory.value = categoryId;
        scrollCategoryIntoView(categoryId);
        break;
      }
    }
  }, options);
  menuStore.categories.forEach((category) => {
    const element = document.getElementById(`category-${category.id}`);
    if (element) {
      observer.observe(element);
    }
  });
}
function scrollToCategory(categoryId) {
  hapticFeedback("light");
  isScrolling.value = true;
  activeCategory.value = categoryId;
  const element = document.getElementById(`category-${categoryId}`);
  if (element) {
    const categoriesSticky = document.querySelector(".categories-sticky");
    const offset = categoriesSticky ? categoriesSticky.offsetHeight : 0;
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
    const offsetPosition = elementPosition - offset - 20;
    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
    setTimeout(() => {
      isScrolling.value = false;
    }, 1000);
  }
}
function getItemPrice(item) {
  if (item.variants && item.variants.length > 0) {
    const prices = item.variants
      .filter((variant) => !variant.in_stop_list && variant.price !== null && variant.price !== undefined)
      .map((variant) => parseFloat(variant.price) || 0);
    if (prices.length === 0) {
      return `${formatPrice(item.price || 0)} ₽`;
    }
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (minPrice === maxPrice) {
      return `${formatPrice(minPrice)} ₽`;
    }
    return `от ${formatPrice(minPrice)} ₽`;
  }
  if (item.modifier_groups && item.modifier_groups.some((group) => group.is_required)) {
    return `от ${formatPrice(item.price || 0)} ₽`;
  }
  return `${formatPrice(item.price || 0)} ₽`;
}
function handleItemCardClick(item) {
  if (isItemUnavailable(item)) return;
  openItem(item);
}
function openItem(item) {
  hapticFeedback("light");
  router.push(`/item/${item.id}`);
}
const availableTags = computed(() => {
  const tagsMap = new Map();
  menuStore.items.forEach((item) => {
    if (Array.isArray(item.tags)) {
      item.tags.forEach((tag) => {
        if (!tagsMap.has(tag.id)) {
          tagsMap.set(tag.id, tag);
        }
      });
    }
  });
  return Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
});
function selectTag(tagId) {
  selectedTagId.value = tagId;
}
function isItemUnavailable(item) {
  if (item.in_stop_list) return true;
  if (item.variants && item.variants.length > 0) {
    return item.variants.every((variant) => variant.in_stop_list || variant.price === null || variant.price === undefined);
  }
  return false;
}
function scrollCategoryIntoView(categoryId) {
  if (!categoriesRef.value || !categoryRefs.value[categoryId]) return;
  const categoryBtn = categoryRefs.value[categoryId];
  const categoriesContainer = categoriesRef.value;
  const containerWidth = categoriesContainer.clientWidth;
  const btnLeft = categoryBtn.offsetLeft;
  const btnWidth = categoryBtn.offsetWidth;
  const currentScroll = categoriesContainer.scrollLeft;
  const categoryIndex = menuStore.categories.findIndex((category) => category.id === categoryId);
  const isStartGroup = categoryIndex <= 1;
  const maxScroll = Math.max(0, categoriesContainer.scrollWidth - containerWidth);
  let targetScroll = 0;
  if (isStartGroup) {
    targetScroll = 0;
  } else {
    targetScroll = btnLeft - containerWidth / 2 + btnWidth / 2;
    targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
  }
  if (Math.abs(currentScroll - targetScroll) > 5) {
    categoriesContainer.scrollTo({
      left: targetScroll,
      behavior: "smooth",
    });
  }
}
function goToCart() {
  router.push("/cart");
}
</script>
<style scoped>
.home {
  min-height: 100vh;
  padding-bottom: 96px;
  background: var(--color-background);
}
.order-disabled {
  padding: 12px 16px;
  border-radius: var(--border-radius-lg);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
  text-align: center;
}
.active-orders-container {
  padding: 12px 0;
}
.active-orders {
  display: flex;
  gap: 12px;
  padding: 0 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.active-orders::-webkit-scrollbar {
  display: none;
}
.active-orders.has-scroll {
  padding-right: 12px;
}
.active-order {
  min-width: 320px;
  padding: 16px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all var(--transition-duration) var(--transition-easing);
  scroll-snap-align: start;
  flex-shrink: 0;
}
.active-order:active {
  opacity: 0.8;
  transform: scale(0.98);
}
.scroll-hint {
  text-align: center;
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  margin-top: 4px;
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.order-status {
  display: flex;
  align-items: center;
  gap: 10px;
}
.order-type-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  border-radius: var(--border-radius-md);
  flex-shrink: 0;
}
.order-type-icon svg {
  color: var(--color-text-primary);
}
.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  animation: pulse 2s infinite;
  flex-shrink: 0;
}
.status-pending {
  background: #fbbf24;
}
.status-preparing {
  background: #3b82f6;
}
.status-ready {
  background: #10b981;
}
.status-delivered {
  background: #6b7280;
}
.status-cancelled {
  background: #ef4444;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.order-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.order-title {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.order-subtitle {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
}
.location-bar {
  padding: 12px;
  background: var(--color-background);
}
.location-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.pill-tab {
  width: 100%;
  padding: 8px 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-duration) var(--transition-easing);
}
.pill-tab.active {
  background: var(--color-text-primary);
  border-color: var(--color-text-primary);
  color: var(--color-background);
}
.pill-tab:hover:not(.active) {
  background: var(--color-background-secondary);
}
.location-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.action-pill {
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text-primary);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.action-text {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
.action-pill:hover {
  background: var(--color-primary-hover);
}
.action-pill:active {
  transform: scale(0.98);
}
.quick-order {
  padding: 16px 12px;
}
.quick-order h3 {
  margin-bottom: 12px;
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.order-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}
.order-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}
.order-info {
  flex: 1;
}
.order-number {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.order-items {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.repeat-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--border-radius-sm);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.repeat-btn:hover {
  background: var(--color-primary-hover);
}
.categories-sticky {
  position: sticky;
  top: 0;
  z-index: 90;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}
.categories {
  display: flex;
  gap: 6px;
  padding: 12px;
  overflow-x: auto;
}
.categories::-webkit-scrollbar {
  display: none;
}
.categories {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.category-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-xl);
  background: var(--color-background);
  white-space: nowrap;
  cursor: pointer;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  transition: all var(--transition-duration) var(--transition-easing);
}
.category-btn.active {
  background: var(--color-text-primary);
  color: var(--color-background);
  border-color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}
.category-btn:hover:not(.active) {
  background: var(--color-background-secondary);
}
.menu-content {
  padding: 0 12px 12px;
}
.tags-filter {
  display: flex;
  gap: 8px;
  padding: 8px 12px 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tags-filter::-webkit-scrollbar {
  display: none;
}
.tag-pill {
  background: #f0f3f7;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: var(--font-size-caption);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.tag-pill.active {
  background: var(--color-primary);
  color: var(--color-text-primary);
  border-color: var(--color-primary);
}
.tag-icon {
  margin-right: 4px;
}
.category-section {
  scroll-margin-top: 80px;
}
.category-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
  padding-top: 12px;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item-card {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}
.item-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.item-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}
.item-image {
  border-radius: 16px;
  overflow: hidden;
  max-width: 128px;
  max-height: 128px;
  flex-shrink: 0;
}
.item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}
.item-text {
  flex: 1;
  min-width: 0;
}
.item-text h3 {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.description {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  flex: 1;
}
.item-weight {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
  margin: 0;
}
.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}
.item-tag {
  background: #eef2f6;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.item-unavailable {
  margin-top: 6px;
  font-size: 11px;
  color: #c0392b;
}
.item-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.add-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
  white-space: nowrap;
}
.add-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.add-btn:hover {
  background: var(--color-primary-hover);
}
.quantity-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-primary);
  border-radius: var(--border-radius-md);
  padding: 4px;
}
.qty-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--border-radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.qty-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}
.qty-value {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  min-width: 24px;
  text-align: center;
}
.loading,
.empty {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.floating-cart {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 40px;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform 0.15s ease;
}
.floating-cart:active {
  transform: scale(0.98);
}
.cart-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cart-icon {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cart-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-text-primary);
  color: var(--color-background);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cart-text {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
}
.cart-total {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
}
</style>
