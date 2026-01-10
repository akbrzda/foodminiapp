<template>
  <div class="menu">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Меню</h1>
    </div>

    <div class="categories" v-if="menuStore.categories.length">
      <button
        v-for="category in menuStore.categories"
        :key="category.id"
        :class="['category-btn', { active: selectedCategory === category.id }]"
        @click="selectCategory(category.id)"
      >
        {{ category.name }}
      </button>
    </div>

    <div class="items" v-if="selectedCategory">
      <div v-for="item in currentItems" :key="item.id" class="item-card" @click="openItem(item)">
        <div class="item-image" v-if="item.image_url">
          <img :src="item.image_url" :alt="item.name" />
        </div>
        <div class="item-info">
          <h3>{{ item.name }}</h3>
          <p class="description">{{ item.description }}</p>
          <div class="item-footer">
            <span class="price">{{ item.price }} ₽</span>
            <button class="add-btn" @click.stop="addToCart(item)">+ В корзину</button>
          </div>
        </div>
      </div>
    </div>

    <div class="loading" v-if="menuStore.loading">Загрузка...</div>

    <div class="empty" v-if="!menuStore.loading && !currentItems.length">Позиции не найдены</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useMenuStore } from "../stores/menu";
import { useCartStore } from "../stores/cart";
import { useLocationStore } from "../stores/location";
import { menuAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const menuStore = useMenuStore();
const cartStore = useCartStore();
const locationStore = useLocationStore();

const selectedCategory = ref(null);

const currentItems = computed(() => {
  if (!selectedCategory.value) return [];
  return menuStore.getItemsByCategory(selectedCategory.value);
});

onMounted(async () => {
  await loadMenu();
});

async function loadMenu() {
  try {
    menuStore.setLoading(true);
    const response = await menuAPI.getCategories(locationStore.selectedCity.id);
    menuStore.setCategories(response.data.categories);

    if (response.data.categories.length > 0) {
      selectedCategory.value = response.data.categories[0].id;
      await loadItems(selectedCategory.value);
    }
  } catch (error) {
    console.error("Failed to load menu:", error);
    menuStore.setError(error.message);
  } finally {
    menuStore.setLoading(false);
  }
}

async function selectCategory(categoryId) {
  hapticFeedback("light");
  selectedCategory.value = categoryId;
  await loadItems(categoryId);
}

async function loadItems(categoryId) {
  try {
    const response = await menuAPI.getItems(categoryId);
    menuStore.setItems(response.data.items);
  } catch (error) {
    console.error("Failed to load items:", error);
  }
}

function addToCart(item) {
  hapticFeedback("success");
  cartStore.addItem({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: 1,
    modifiers: [],
  });
}

function openItem(item) {
  // TODO: Открыть модальное окно с деталями и модификаторами
  console.log("Open item:", item);
}
</script>

<style scoped>
.menu {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.back-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  margin-right: 12px;
}

.header h1 {
  font-size: 20px;
}

.categories {
  display: flex;
  gap: 8px;
  padding: 16px;
  overflow-x: auto;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.category-btn {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  background: white;
  white-space: nowrap;
  cursor: pointer;
}

.category-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.items {
  padding: 16px;
}

.item-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.item-image {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
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
}

.item-info h3 {
  font-size: 16px;
  margin-bottom: 4px;
}

.description {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
  flex: 1;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.price {
  font-weight: 600;
  font-size: 16px;
}

.add-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: #667eea;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.loading,
.empty {
  text-align: center;
  padding: 32px;
  color: #666;
}
</style>
