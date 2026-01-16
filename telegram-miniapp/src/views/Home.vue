<template>
  <div class="home">
    <AppHeader @toggleMenu="showMenu = true" />

    <div class="location-bar">
      <div class="location-tabs">
        <button @click="setDeliveryType('delivery')" class="pill-tab" :class="{ active: locationStore.isDelivery }">Доставка</button>
        <button @click="setDeliveryType('pickup')" class="pill-tab" :class="{ active: locationStore.isPickup }">Самовывоз</button>
      </div>

      <div class="location-actions">
        <button @click="openDeliverySelector" class="action-pill">
          <span class="action-text">{{ actionButtonText }}</span>
        </button>
      </div>
    </div>

    <!-- Меню с категориями -->
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

      <div class="menu-content" v-if="!menuStore.loading">
        <div v-for="category in menuStore.categories" :key="category.id" :id="`category-${category.id}`" class="category-section">
          <h2 class="category-title">{{ category.name }}</h2>
          <div class="items">
            <div v-for="item in getItemsByCategory(category.id)" :key="item.id" class="item-card" @click="openItem(item)">
              <div class="item-image" v-if="item.image_url">
                <img :src="normalizeImageUrl(item.image_url)" :alt="item.name" />
              </div>
              <div class="item-info">
                <div class="item-text">
                  <h3>{{ item.name }}</h3>
                  <p class="description">{{ item.description }}</p>
                  <p class="item-weight" v-if="getDisplayWeight(item)">{{ getDisplayWeight(item) }}</p>
                </div>
                <div class="item-footer">
                  <button v-if="!getCartItem(item)" class="add-btn" @click.stop="handleItemAction(item)">
                    {{ getItemPrice(item) }}
                  </button>
                  <div v-else class="quantity-controls">
                    <button class="qty-btn" @click.stop="decreaseItemQuantity(item)">−</button>
                    <span class="qty-value">{{ getCartItem(item).quantity }}</span>
                    <button class="qty-btn" @click.stop="increaseItemQuantity(item)">+</button>
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

    <button v-if="cartStore.itemsCount > 0" class="floating-cart" @click="goToCart">
      <span class="cart-left">
        <span class="cart-icon">
          <ShoppingCart :size="20" />
          <span class="cart-count">{{ cartStore.itemsCount }}</span>
        </span>
        <span class="cart-text">В корзину</span>
      </span>
      <span class="cart-total">{{ formatPrice(cartStore.totalPrice) }} ₽</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ShoppingCart } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";
import { useCartStore } from "../stores/cart";
import { useMenuStore } from "../stores/menu";
import { bonusesAPI, menuAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import AppHeader from "../components/AppHeader.vue";
import { formatPrice, normalizeImageUrl } from "../utils/format";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const locationStore = useLocationStore();
const cartStore = useCartStore();
const menuStore = useMenuStore();

const categoriesRef = ref(null);
const categoryRefs = ref({});
const showMenu = ref(false);
const activeCategory = ref(null);
const isScrolling = ref(false);
let observer = null;

const cityName = computed(() => locationStore.selectedCity?.name || "Когалым");
const actionButtonText = computed(() => {
  if (locationStore.isDelivery) {
    return locationStore.deliveryAddress ? truncateText(locationStore.deliveryAddress, 48) : "Укажите адрес";
  }

  if (locationStore.isPickup) {
    return locationStore.selectedBranch ? truncateText(locationStore.selectedBranch.name, 22) : "Выбрать филиал";
  }

  return "Укажите адрес";
});

onMounted(async () => {
  // Попытка определить местоположение
  try {
    await locationStore.detectUserLocation();
  } catch (error) {
    console.log("Location detection failed:", error);
  }

  if (route.query.openCity === "1") {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    router.replace({ query: {} });
  }

  // Загружаем меню если город выбран
  if (locationStore.selectedCity) {
    await loadMenu();
  }
});

// Загружаем меню при изменении города
watch(
  () => locationStore.selectedCity,
  async (newCity) => {
    if (newCity) {
      await loadMenu();
    }
  }
);

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});

watch(
  () => activeCategory.value,
  async (categoryId) => {
    if (!categoryId) return;
    await nextTick();
    scrollCategoryIntoView(categoryId);
  }
);

function openCitySelector() {
  window.dispatchEvent(new CustomEvent("open-city-popup"));
}

function openDeliverySelector() {
  if (!locationStore.selectedCity) {
    window.dispatchEvent(new CustomEvent("open-city-popup"));
    return;
  }
  if (locationStore.isPickup) {
    router.push("/pickup-map");
    return;
  }
  router.push("/delivery-map");
}

function setDeliveryType(type) {
  locationStore.setDeliveryType(type);
}

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

async function loadMenu() {
  if (!locationStore.selectedCity) return;

  if (menuStore.cityId === locationStore.selectedCity.id && menuStore.categories.length > 0 && menuStore.items.length > 0) {
    await nextTick();
    setupIntersectionObserver();
    return;
  }

  try {
    menuStore.setLoading(true);

    const menuResponse = await menuAPI.getMenu(locationStore.selectedCity.id);
    const categories = menuResponse.data.categories || [];
    menuStore.setCategories(categories);
    const allItems = categories.flatMap((category) => category.items || []);

    menuStore.setMenuData({
      cityId: locationStore.selectedCity.id,
      categories,
      items: allItems,
    });

    // Устанавливаем первую категорию как активную
    if (categories.length > 0) {
      activeCategory.value = categories[0].id;
    }

    // Настраиваем Intersection Observer после загрузки
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
  return menuStore.getItemsByCategory(categoryId);
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

  if (hasRequiredOptions(item)) {
    openItem(item);
    return;
  }

  cartStore.addItem({
    id: item.id,
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
  hapticFeedback("light");
  const cartItem = getCartItem(item);
  if (cartItem) {
    cartStore.updateQuantity(cartStore.items.indexOf(cartItem), cartItem.quantity + 1);
  }
}

function decreaseItemQuantity(item) {
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

  // Наблюдаем за всеми секциями категорий
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
    const prices = item.variants.map((v) => v.price);
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

function openItem(item) {
  hapticFeedback("light");
  router.push(`/item/${item.id}`);
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
  padding-bottom: 100px;
  background: var(--color-background);
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
  transition: background-color var(--transition-duration) var(--transition-easing), transform 0.15s ease;
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
