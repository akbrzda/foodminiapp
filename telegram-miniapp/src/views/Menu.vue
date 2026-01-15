<template>
  <div class="menu">
    <PageHeader title="Меню" />

    <div class="categories-wrapper" v-if="menuStore.categories.length">
      <div class="categories" ref="categoriesRef">
        <button
          v-for="category in menuStore.categories"
          :key="category.id"
          :ref="(el) => { if (el) categoryRefs[category.id] = el }"
          :class="['category-btn', { active: activeCategoryId === category.id }]"
          @click="selectCategory(category.id)"
        >
          {{ category.name }}
        </button>
      </div>
    </div>

    <div class="items-container" ref="itemsContainerRef">
      <div
        v-for="category in menuStore.categories"
        :key="category.id"
        :data-category-id="category.id"
        class="category-section"
      >
        <div class="items" v-if="menuStore.getItemsByCategory(category.id).length">
          <div
            v-for="item in menuStore.getItemsByCategory(category.id)"
            :key="item.id"
            class="item-card"
          >
            <div class="item-image" v-if="item.image_url">
              <img :src="item.image_url" :alt="item.name" />
            </div>
            <div class="item-info">
              <h3 class="item-name">{{ item.name }}</h3>
              <p class="item-description" v-if="item.description">{{ item.description }}</p>
              <div class="item-actions">
                <button
                  v-if="!getCartItem(item)"
                  class="add-btn"
                  @click="handleItemClick(item)"
                >
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

    <div class="loading" v-if="menuStore.loading">Загрузка...</div>

    <div class="empty" v-if="!menuStore.loading && menuStore.items.length === 0">
      Позиции не найдены
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { useMenuStore } from "../stores/menu";
import { useCartStore } from "../stores/cart";
import { useLocationStore } from "../stores/location";
import { menuAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import PageHeader from "../components/PageHeader.vue";
import { formatPrice } from "../utils/format";

const router = useRouter();
const menuStore = useMenuStore();
const cartStore = useCartStore();
const locationStore = useLocationStore();

const categoriesRef = ref(null);
const itemsContainerRef = ref(null);
const categoryRefs = ref({});
const activeCategoryId = ref(null);
const scrollTimeout = ref(null);

function getItemPrice(item) {
  if (item.variants && item.variants.length > 0) {
    const prices = item.variants.map((v) => v.price);
    const minPrice = Math.min(...prices);
    return `от ${formatPrice(minPrice)} ₽`;
  }
  if (item.modifier_groups && item.modifier_groups.some((g) => g.is_required)) {
    return `от ${formatPrice(item.price || 0)} ₽`;
  }
  return `${formatPrice(item.price || 0)} ₽`;
}

function hasRequiredOptions(item) {
  return (
    (item.variants && item.variants.length > 0) ||
    (item.modifier_groups && item.modifier_groups.some((g) => g.is_required))
  );
}

function getCartItem(item) {
  // Для позиций без вариантов и модификаторов
  if (!item.variants?.length && !item.modifier_groups?.some((g) => g.is_required)) {
    return cartStore.items.find((cartItem) => {
      return (
        cartItem.id === item.id &&
        !cartItem.variant_id &&
        (!cartItem.modifiers || cartItem.modifiers.length === 0)
      );
    });
  }
  // Для позиций с вариантами или обязательными модификаторами - не показываем количество на главной
  return null;
}

function handleItemClick(item) {
  hapticFeedback("light");
  
  if (hasRequiredOptions(item)) {
    router.push(`/menu/item/${item.id}`);
  } else {
    cartStore.addItem({
      id: item.id,
      name: item.name,
      price: item.price || 0,
      variant_id: null,
      variant_name: null,
      quantity: 1,
      modifiers: [],
      image_url: item.image_url,
    });
    hapticFeedback("success");
  }
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

function scrollToCategory(categoryId) {
  if (!categoriesRef.value || !categoryRefs.value[categoryId]) return;
  
  const categoryBtn = categoryRefs.value[categoryId];
  const categoriesContainer = categoriesRef.value;
  const containerWidth = categoriesContainer.offsetWidth;
  const btnLeft = categoryBtn.offsetLeft;
  const btnWidth = categoryBtn.offsetWidth;
  const currentScroll = categoriesContainer.scrollLeft;
  
  const categoryIndex = menuStore.categories.findIndex((c) => c.id === categoryId);
  const isFirst = categoryIndex === 0;
  const isLast = categoryIndex === menuStore.categories.length - 1;
  
  let targetScroll = 0;
  
  if (isFirst) {
    targetScroll = 0;
  } else if (isLast) {
    targetScroll = categoriesContainer.scrollWidth - containerWidth;
  } else {
    // Центрируем кнопку в контейнере
    targetScroll = btnLeft - (containerWidth / 2) + (btnWidth / 2);
    targetScroll = Math.max(0, Math.min(targetScroll, categoriesContainer.scrollWidth - containerWidth));
  }
  
  // Прокручиваем только если нужно
  if (Math.abs(currentScroll - targetScroll) > 5) {
    categoriesContainer.scrollTo({
      left: targetScroll,
      behavior: "smooth",
    });
  }
}

function updateActiveCategory() {
  if (!itemsContainerRef.value) return;
  
  const container = itemsContainerRef.value;
  const scrollTop = container.scrollTop;
  const containerHeight = container.offsetHeight;
  const viewportCenter = scrollTop + containerHeight / 2;
  
  const sections = container.querySelectorAll(".category-section");
  let newActiveCategory = null;
  
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const sectionTop = rect.top + scrollTop - container.getBoundingClientRect().top;
    const sectionBottom = sectionTop + rect.height;
    
    if (viewportCenter >= sectionTop && viewportCenter <= sectionBottom) {
      newActiveCategory = parseInt(section.dataset.categoryId);
      break;
    }
  }
  
  if (newActiveCategory && newActiveCategory !== activeCategoryId.value) {
    activeCategoryId.value = newActiveCategory;
    scrollToCategory(newActiveCategory);
  }
}

function handleScroll() {
  if (scrollTimeout.value) {
    clearTimeout(scrollTimeout.value);
  }
  
  scrollTimeout.value = setTimeout(() => {
    updateActiveCategory();
  }, 100);
}

async function selectCategory(categoryId) {
  hapticFeedback("light");
  activeCategoryId.value = categoryId;
  
  await nextTick();
  
  if (!itemsContainerRef.value) return;
  
  const section = itemsContainerRef.value.querySelector(`[data-category-id="${categoryId}"]`);
  if (section) {
    const container = itemsContainerRef.value;
    const containerTop = container.getBoundingClientRect().top + window.scrollY;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const offset = containerTop - (window.innerHeight * 0.1);
    
    container.scrollTo({
      top: section.offsetTop - offset,
      behavior: "smooth",
    });
  }
  
  scrollToCategory(categoryId);
}

onMounted(async () => {
  await loadMenu();
  
  if (itemsContainerRef.value) {
    itemsContainerRef.value.addEventListener("scroll", handleScroll);
    updateActiveCategory();
  }
});

onUnmounted(() => {
  if (itemsContainerRef.value) {
    itemsContainerRef.value.removeEventListener("scroll", handleScroll);
  }
  if (scrollTimeout.value) {
    clearTimeout(scrollTimeout.value);
  }
});

async function loadMenu() {
  if (!locationStore.selectedCity) return;

  if (
    menuStore.cityId === locationStore.selectedCity.id &&
    menuStore.categories.length > 0 &&
    menuStore.items.length > 0
  ) {
    activeCategoryId.value = menuStore.categories[0].id;
    await nextTick();
    scrollToCategory(activeCategoryId.value);
    return;
  }

  try {
    menuStore.setLoading(true);
    const response = await menuAPI.getCategories(locationStore.selectedCity.id);
    const categories = response.data.categories || [];
    menuStore.setCategories(categories);

    if (categories.length > 0) {
      const allItems = [];
      for (const category of categories) {
        try {
          const itemsResponse = await menuAPI.getItems(category.id);
          if (itemsResponse.data.items) {
            allItems.push(...itemsResponse.data.items);
          }
        } catch (error) {
          console.error(`Failed to load items for category ${category.id}:`, error);
        }
      }

      menuStore.setMenuData({
        cityId: locationStore.selectedCity.id,
        categories,
        items: allItems,
      });

      activeCategoryId.value = categories[0].id;
      
      await nextTick();
      scrollToCategory(activeCategoryId.value);
    }
  } catch (error) {
    console.error("Failed to load menu:", error);
    menuStore.setError(error.message);
  } finally {
    menuStore.setLoading(false);
  }
}

watch(() => cartStore.items, () => {
  // Обновляем отображение при изменении корзины
}, { deep: true });
</script>

<style scoped>
.menu {
  min-height: 100vh;
  background: var(--color-background-secondary);
}

.categories-wrapper {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}

.categories {
  display: flex;
  gap: 8px;
  padding: 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.categories::-webkit-scrollbar {
  display: none;
}

.category-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  background: var(--color-background-secondary);
  white-space: nowrap;
  cursor: pointer;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  transition: all var(--transition-duration) var(--transition-easing);
  flex-shrink: 0;
}

.category-btn.active {
  background: var(--color-text-primary);
  color: var(--color-background);
  font-weight: var(--font-weight-semibold);
}

.category-btn:hover:not(.active) {
  background: #E0E0E0;
}

.items-container {
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  padding-bottom: 20px;
}

.category-section {
  margin-bottom: 24px;
}

.items {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
}

.item-image {
  width: 80px;
  height: 80px;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-background-secondary);
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

.item-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-description {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.item-actions {
  display: flex;
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
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--border-radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
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
</style>
