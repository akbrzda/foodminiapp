<template>
  <div class="home">
    <div class="header">
      <div class="location" @click="$router.push('/select-city')">
        <span class="location-icon">📍</span>
        <div>
          <div class="city">{{ locationStore.selectedCity?.name || "Выберите город" }}</div>
          <div class="branch" v-if="locationStore.selectedBranch">
            {{ locationStore.selectedBranch.name }}
          </div>
        </div>
      </div>
      <div class="bonus-badge" @click="$router.push('/profile')">🎁 {{ bonusBalance }} б.</div>
    </div>

    <div class="banner">
      <h1>Быстрая доставка вкусной еды</h1>
      <p>Закажите любимые блюда прямо сейчас</p>
    </div>

    <div class="actions">
      <button class="action-btn primary" @click="$router.push('/menu')">📋 Меню</button>
      <button class="action-btn" @click="$router.push('/orders')">📦 Заказы</button>
    </div>

    <div class="quick-order" v-if="lastOrder">
      <h3>Последний заказ</h3>
      <div class="order-card" @click="repeatOrder">
        <div class="order-info">
          <div class="order-number">#{{ lastOrder.order_number }}</div>
          <div class="order-items">{{ lastOrder.items_count }} позиций</div>
        </div>
        <button class="repeat-btn">Повторить</button>
      </div>
    </div>

    <nav class="bottom-nav">
      <button class="nav-btn active">🏠 Главная</button>
      <button class="nav-btn" @click="$router.push('/menu')">📋 Меню</button>
      <button class="nav-btn" @click="$router.push('/cart')">
        🛒 Корзина
        <span class="badge" v-if="cartStore.itemsCount">{{ cartStore.itemsCount }}</span>
      </button>
      <button class="nav-btn" @click="$router.push('/profile')">👤 Профиль</button>
    </nav>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLocationStore } from "../stores/location";
import { useCartStore } from "../stores/cart";
import { bonusesAPI, ordersAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const authStore = useAuthStore();
const locationStore = useLocationStore();
const cartStore = useCartStore();

const bonusBalance = ref(0);
const lastOrder = ref(null);

onMounted(async () => {
  await loadBonusBalance();
  await loadLastOrder();
});

async function loadBonusBalance() {
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = response.data.balance;
  } catch (error) {
    console.error("Failed to load bonus balance:", error);
  }
}

async function loadLastOrder() {
  try {
    const response = await ordersAPI.getMyOrders();
    if (response.data.orders?.length > 0) {
      lastOrder.value = response.data.orders[0];
    }
  } catch (error) {
    console.error("Failed to load last order:", error);
  }
}

async function repeatOrder() {
  try {
    hapticFeedback("light");
    const response = await ordersAPI.repeatOrder(lastOrder.value.id);

    // Добавляем позиции в корзину
    response.data.items.forEach((item) => {
      cartStore.addItem(item);
    });

    hapticFeedback("success");
    router.push("/cart");
  } catch (error) {
    hapticFeedback("error");
    console.error("Failed to repeat order:", error);
  }
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  padding-bottom: 70px;
  background: #f5f5f5;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.location {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.location-icon {
  font-size: 20px;
}

.city {
  font-weight: 600;
  font-size: 16px;
}

.branch {
  font-size: 12px;
  color: #666;
}

.bonus-badge {
  padding: 8px 12px;
  background: #4caf50;
  color: white;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}

.banner {
  padding: 32px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
}

.banner h1 {
  font-size: 24px;
  margin-bottom: 8px;
}

.banner p {
  font-size: 14px;
  opacity: 0.9;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}

.action-btn {
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.action-btn.primary {
  background: #667eea;
  color: white;
}

.quick-order {
  padding: 16px;
}

.quick-order h3 {
  margin-bottom: 12px;
  font-size: 18px;
}

.order-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.order-number {
  font-weight: 600;
  font-size: 16px;
}

.order-items {
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.repeat-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #667eea;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: white;
  border-top: 1px solid #e0e0e0;
  padding: 8px;
}

.nav-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  position: relative;
}

.nav-btn.active {
  color: #667eea;
  font-weight: 600;
}

.badge {
  position: absolute;
  top: 4px;
  right: 8px;
  background: #f44336;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
}
</style>
