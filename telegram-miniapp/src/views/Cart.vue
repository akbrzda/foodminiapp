<template>
  <div class="cart">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Корзина</h1>
    </div>

    <div v-if="cartStore.items.length === 0" class="empty">
      <p>Корзина пуста</p>
      <button class="btn-primary" @click="$router.push('/menu')">Перейти в меню</button>
    </div>

    <div v-else class="cart-content">
      <div class="items">
        <div v-for="(item, index) in cartStore.items" :key="index" class="cart-item">
          <div class="item-info">
            <h3>{{ item.name }}</h3>
            <div class="modifiers" v-if="item.modifiers?.length">
              <span v-for="mod in item.modifiers" :key="mod.id" class="modifier"> + {{ mod.name }} </span>
            </div>
            <div class="price">{{ item.price }} ₽</div>
          </div>

          <div class="quantity-controls">
            <button @click="decreaseQuantity(index)">-</button>
            <span>{{ item.quantity }}</span>
            <button @click="increaseQuantity(index)">+</button>
          </div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-row">
          <span>Товары ({{ cartStore.itemsCount }})</span>
          <span>{{ cartStore.totalPrice }} ₽</span>
        </div>
        <div class="summary-row">
          <span>Доставка</span>
          <span>0 ₽</span>
        </div>
        <div class="summary-row total">
          <span>Итого</span>
          <span>{{ cartStore.totalPrice }} ₽</span>
        </div>
      </div>

      <button class="checkout-btn" @click="checkout">Оформить заказ</button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { useCartStore } from "../stores/cart";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const cartStore = useCartStore();

function increaseQuantity(index) {
  hapticFeedback("light");
  cartStore.updateQuantity(index, cartStore.items[index].quantity + 1);
}

function decreaseQuantity(index) {
  hapticFeedback("light");
  cartStore.updateQuantity(index, cartStore.items[index].quantity - 1);
}

function checkout() {
  hapticFeedback("medium");
  // TODO: Переход на экран оформления заказа
  console.log("Checkout");
}
</script>

<style scoped>
.cart {
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

.empty {
  text-align: center;
  padding: 64px 16px;
}

.empty p {
  font-size: 18px;
  color: #666;
  margin-bottom: 24px;
}

.btn-primary {
  padding: 12px 24px;
  border: none;
  border-radius: 12px;
  background: #667eea;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.cart-content {
  padding: 16px;
}

.items {
  margin-bottom: 16px;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.item-info h3 {
  font-size: 16px;
  margin-bottom: 4px;
}

.modifiers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.modifier {
  font-size: 12px;
  color: #666;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
}

.price {
  font-weight: 600;
  margin-top: 8px;
}

.quantity-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quantity-controls button {
  width: 32px;
  height: 32px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  font-size: 18px;
  cursor: pointer;
}

.quantity-controls span {
  font-weight: 600;
  min-width: 24px;
  text-align: center;
}

.summary {
  padding: 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.summary-row.total {
  font-weight: 600;
  font-size: 18px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
  margin-bottom: 0;
}

.checkout-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: #4caf50;
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
}
</style>
