<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click="close">
        <div class="modal-content" @click.stop>
          <div class="sheet-handle" @click="close"></div>
          
          <div class="modal-header">
            <button class="close-btn" @click="close">
              <X :size="24" />
            </button>
          </div>

          <div class="modal-body" v-if="item">
            <!-- Изображение товара -->
            <div class="item-image-wrapper" v-if="item.image_url">
              <img :src="item.image_url" :alt="item.name" class="item-image" />
            </div>

            <!-- Название и описание -->
            <div class="item-header">
              <h2 class="item-name">{{ item.name }}</h2>
              <p class="item-description" v-if="item.description">{{ item.description }}</p>
            </div>

            <!-- Выбор варианта -->
            <div class="section" v-if="item.variants && item.variants.length > 0">
              <h3 class="section-title">Выберите размер</h3>
              <div class="variants">
                <button
                  v-for="variant in item.variants"
                  :key="variant.id"
                  :class="['variant-btn', { active: selectedVariant?.id === variant.id }]"
                  @click="selectVariant(variant)"
                >
                  <span class="variant-name">{{ variant.name }}</span>
                  <span class="variant-price">{{ formatPrice(variant.price) }} ₽</span>
                </button>
              </div>
            </div>

            <!-- Группы модификаторов -->
            <div class="section" v-for="group in item.modifier_groups" :key="group.id">
              <h3 class="section-title">
                {{ group.name }}
                <span v-if="group.is_required" class="required-star">*</span>
              </h3>
              <p class="section-subtitle" v-if="group.type === 'single'">Выберите один вариант</p>
              <p class="section-subtitle" v-else>Можно выбрать несколько</p>
              
              <div class="modifiers">
                <label
                  v-for="modifier in group.modifiers"
                  :key="modifier.id"
                  :class="['modifier-item', { active: isModifierSelected(group.id, modifier.id) }]"
                >
                  <input
                    :type="group.type === 'single' ? 'radio' : 'checkbox'"
                    :name="`group-${group.id}`"
                    :value="modifier.id"
                    :checked="isModifierSelected(group.id, modifier.id)"
                    @change="toggleModifier(group, modifier)"
                  />
                  <span class="modifier-name">{{ modifier.name }}</span>
                  <span class="modifier-price" v-if="modifier.price > 0">+{{ formatPrice(modifier.price) }} ₽</span>
                </label>
              </div>
            </div>

          </div>

          <!-- Кнопка добавления в корзину -->
          <div class="modal-footer">
            <button
              class="add-to-cart-btn"
              :disabled="!canAddToCart"
              @click="addToCart"
            >
              {{ canAddToCart ? `В корзину за ${formatPrice(totalPrice)} ₽` : "Выберите обязательные параметры" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { X } from "lucide-vue-next";
import { useCartStore } from "../stores/cart";
import { hapticFeedback } from "../services/telegram";
import { formatPrice } from "../utils/format";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:isOpen", "added"]);

const cartStore = useCartStore();

const selectedVariant = ref(null);
const selectedModifiers = ref({}); // { groupId: [modifierId, ...] }
const quantity = ref(1);

// Сброс при открытии
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && props.item) {
    reset();
    // Выбираем первый вариант по умолчанию, если есть
    if (props.item.variants && props.item.variants.length > 0) {
      selectedVariant.value = props.item.variants[0];
    }
  }
});

function reset() {
  selectedVariant.value = null;
  selectedModifiers.value = {};
  quantity.value = 1;
}

function selectVariant(variant) {
  hapticFeedback("light");
  selectedVariant.value = variant;
}

function toggleModifier(group, modifier) {
  hapticFeedback("light");
  
  if (group.type === "single") {
    // Для одиночного выбора заменяем значение
    selectedModifiers.value[group.id] = [modifier.id];
  } else {
    // Для множественного выбора добавляем/удаляем
    if (!selectedModifiers.value[group.id]) {
      selectedModifiers.value[group.id] = [];
    }
    const index = selectedModifiers.value[group.id].indexOf(modifier.id);
    if (index > -1) {
      selectedModifiers.value[group.id].splice(index, 1);
    } else {
      selectedModifiers.value[group.id].push(modifier.id);
    }
  }
}

function isModifierSelected(groupId, modifierId) {
  if (!props.item?.modifier_groups) return false;
  const group = props.item.modifier_groups.find((g) => g.id === groupId);
  if (!group) return false;
  
  if (group.type === "single") {
    return selectedModifiers.value[groupId]?.[0] === modifierId;
  } else {
    return selectedModifiers.value[groupId]?.includes(modifierId) || false;
  }
}

function increaseQuantity() {
  hapticFeedback("light");
  quantity.value++;
}

function decreaseQuantity() {
  hapticFeedback("light");
  if (quantity.value > 1) {
    quantity.value--;
  }
}

const canAddToCart = computed(() => {
  if (!props.item) return false;
  
  // Если есть варианты, должен быть выбран вариант
  if (props.item.variants && props.item.variants.length > 0) {
    if (!selectedVariant.value) return false;
  }
  
  // Проверяем обязательные группы модификаторов
  if (props.item.modifier_groups) {
    for (const group of props.item.modifier_groups) {
      if (group.is_required) {
        if (!selectedModifiers.value[group.id] || selectedModifiers.value[group.id].length === 0) {
          return false;
        }
      }
    }
  }
  
  return true;
});

const totalPrice = computed(() => {
  let price = 0;
  
  // Цена варианта или базовая цена товара
  if (selectedVariant.value) {
    price = selectedVariant.value.price;
  } else if (props.item) {
    price = props.item.price || 0;
  }
  
  // Добавляем цены модификаторов
  if (props.item?.modifier_groups) {
    for (const group of props.item.modifier_groups) {
      const selectedIds = selectedModifiers.value[group.id] || [];
      if (selectedIds.length > 0) {
        for (const modifierId of selectedIds) {
          const modifier = group.modifiers.find((m) => m.id === modifierId);
          if (modifier) {
            price += modifier.price || 0;
          }
        }
      }
    }
  }
  
  return price * quantity.value;
});

function addToCart() {
  if (!canAddToCart.value) return;
  
  hapticFeedback("success");
  
  // Собираем все выбранные модификаторы в плоский массив
  const modifiers = [];
  if (props.item?.modifier_groups) {
    for (const group of props.item.modifier_groups) {
      const selectedIds = selectedModifiers.value[group.id] || [];
      for (const modifierId of selectedIds) {
        const modifier = group.modifiers.find((m) => m.id === modifierId);
        if (modifier) {
          modifiers.push({
            id: modifier.id,
            name: modifier.name,
            price: modifier.price || 0,
            group_id: group.id,
            group_name: group.name,
          });
        }
      }
    }
  }
  
  cartStore.addItem({
    id: props.item.id,
    name: props.item.name,
    price: selectedVariant.value?.price || props.item.price || 0,
    variant_id: selectedVariant.value?.id || null,
    variant_name: selectedVariant.value?.name || null,
    quantity: quantity.value,
    modifiers: modifiers,
    image_url: props.item.image_url,
  });
  
  emit("added");
  close();
}

function close() {
  emit("update:isOpen", false);
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.modal-content {
  background: var(--color-background);
  border-radius: 24px 24px 0 0;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0px -4px 16px rgba(0, 0, 0, 0.12);
  animation: slideUp 0.3s ease-out;
  overflow: hidden;
}

.sheet-handle {
  width: 40px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin: 8px auto;
  cursor: pointer;
}

.modal-header {
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px;
}

.close-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.item-image-wrapper {
  width: 100%;
  height: 200px;
  margin: -8px -16px 16px;
  overflow: hidden;
  background: var(--color-background-secondary);
}

.item-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-header {
  margin-bottom: 24px;
}

.item-name {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.item-description {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.variant-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s;
}

.variant-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.variant-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
}

.variant-btn.active .variant-name {
  font-weight: var(--font-weight-semibold);
}

.variant-price {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.modifiers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modifier-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s;
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

.modifier-price {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}


.modal-footer {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
}

.add-to-cart-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color 0.2s;
}

.add-to-cart-btn:disabled {
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.add-to-cart-btn:not(:disabled):hover {
  background: var(--color-primary-hover);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
