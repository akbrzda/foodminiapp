<template>
  <div class="cart">
    <PageHeader title="Корзина" />

    <div v-if="cartStore.items.length === 0" class="empty">
      <p>Корзина пуста</p>
      <button class="btn-primary" @click="$router.push('/')">Перейти в меню</button>
    </div>

    <div v-else class="cart-content">
      <div class="items">
        <div v-for="(item, index) in cartStore.items" :key="index" class="cart-item">
          <div class="item-info">
            <h3>{{ item.name }}</h3>
            <div class="variant" v-if="item.variant_name">
              <span class="variant-text">{{ item.variant_name }}</span>
            </div>
            <div class="modifiers" v-if="item.modifiers?.length">
              <div v-for="mod in item.modifiers" :key="`${mod.id}-${mod.group_id}`" class="modifier">
                + {{ mod.name }}
              </div>
            </div>
            <div class="price">{{ getItemTotalPrice(item) }} ₽</div>
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
          <span>{{ formatPrice(cartStore.totalPrice) }} ₽</span>
        </div>
        <div class="summary-row">
          <span>Доставка</span>
          <span>0 ₽</span>
        </div>
        <div class="summary-row total">
          <span>Итого</span>
          <span>{{ formatPrice(cartStore.totalPrice) }} ₽</span>
        </div>
      </div>

      <button class="checkout-btn" @click="checkout">Оформить заказ</button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import PageHeader from "../components/PageHeader.vue";
import { useCartStore } from "../stores/cart";
import { hapticFeedback } from "../services/telegram";
import { formatPrice } from "../utils/format";

const router = useRouter();
const cartStore = useCartStore();

function getItemTotalPrice(item) {
  // item.price уже включает цену варианта и всех модификаторов
  const price = parseFloat(item.price) || 0;
  const quantity = parseInt(item.quantity) || 1;
  const total = price * quantity;
  
  if (isNaN(total)) {
    console.error("Invalid price calculation:", { item, price, quantity, total });
    return "0";
  }
  
  return formatPrice(total);
}

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
  router.push("/checkout");
}
</script>

<style scoped>
.cart {
  min-height: 100vh;
  background: var(--color-background-secondary);
}

.empty {
  text-align: center;
  padding: 64px 16px;
}

.empty p {
  font-size: var(--font-size-h3);
  color: var(--color-text-secondary);
  margin-bottom: 24px;
}

.cart-content {
  padding: 16px;
  padding-bottom: 100px;
}

.items {
  margin-bottom: 16px;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.item-info {
  flex: 1;
}

.item-info h3 {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.modifiers {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.variant {
  margin-top: 4px;
  margin-bottom: 4px;
}

.variant-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  font-style: italic;
}

.modifier {
  font-size: var(--font-size-small);
  color: var(--color-text-secondary);
  padding: 2px 8px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-sm);
}

.price {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-h3);
  color: var(--color-text-primary);
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
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-sm);
  background: var(--color-background);
  font-size: 18px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.quantity-controls button:hover {
  background: var(--color-background-secondary);
}

.quantity-controls span {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-body);
  min-width: 24px;
  text-align: center;
  color: var(--color-text-primary);
}

.summary {
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.summary-row.total {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-h2);
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  margin-bottom: 0;
}

.checkout-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.checkout-btn:hover {
  background: var(--color-primary-hover);
}

.checkout-btn:active {
  transform: scale(0.98);
}
</style>
