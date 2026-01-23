<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click="closeDialog">
        <div class="dialog-content" @click.stop>
          <div class="header">
            <h3>{{ isDelivery ? "Доставка" : "Самовывоз" }}</h3>
            <button @click="closeDialog" class="close-btn">
              <X :size="18" />
            </button>
          </div>
          <div class="tabs">
            <button @click="isDelivery = true" class="tab" :class="{ active: isDelivery }">Доставка</button>
            <button @click="isDelivery = false" class="tab" :class="{ active: !isDelivery }">Самовывоз</button>
          </div>
          <div v-if="isDelivery" class="delivery-section">
            <div class="address-input-wrapper">
              <input v-model="deliveryAddress" placeholder="Куда доставить ваш заказ?" class="address-input" />
              <button @click="selectDeliveryAddress" class="select-address-btn">Выбрать</button>
            </div>
          </div>
          <div v-else class="branches-section">
            <div v-if="loading" class="loading-state">
              <div class="spinner"></div>
              <span>Загрузка филиалов...</span>
            </div>
            <div v-else-if="branches.length === 0" class="empty-state">
              <p>Филиалы не найдены</p>
            </div>
            <div v-else class="branches-list">
              <button
                v-for="branch in branches"
                :key="branch.id"
                @click="selectBranch(branch)"
                class="branch-item"
                :class="{ active: branch.id === locationStore.selectedBranch?.id }"
              >
                <div class="branch-info">
                  <div class="branch-name">{{ branch.name }}</div>
                  <div class="branch-address">{{ branch.address }}</div>
                  <div class="branch-hours">{{ branch.work_hours }}</div>
                </div>
                <Check v-if="branch.id === locationStore.selectedBranch?.id" :size="24" class="checkmark" />
              </button>
            </div>
            <div class="map-placeholder">
              <MapPin :size="48" class="map-pin" />
              <p>{{ locationStore.selectedCity?.name || "Когалым" }}</p>
            </div>
          </div>
          <button v-if="!isDelivery && locationStore.selectedBranch" @click="confirmSelection" class="confirm-btn">Забрать отсюда</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { X, Check, MapPin } from "lucide-vue-next";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
const props = defineProps({
  open: Boolean,
});
const emit = defineEmits(["update:open", "branchSelected", "addressSelected"]);
const locationStore = useLocationStore();
const isOpen = ref(props.open);
const isDelivery = ref(true);
const branches = ref([]);
const loading = ref(false);
const deliveryAddress = ref("");
watch(
  () => props.open,
  (value) => {
    isOpen.value = value;
    if (value && !isDelivery.value) {
      loadBranches();
    }
  },
);
watch(isOpen, (value) => {
  emit("update:open", value);
});
watch(isDelivery, (value) => {
  if (!value) {
    loadBranches();
  }
});
onMounted(() => {
  if (locationStore.selectedCity) {
    loadBranches();
  }
});
async function loadBranches() {
  if (!locationStore.selectedCity) return;
  try {
    loading.value = true;
    const response = await citiesAPI.getBranches(locationStore.selectedCity.id);
    branches.value = response.data.branches || [];
    locationStore.setBranches(branches.value);
  } catch (error) {
    console.error("Failed to load branches:", error);
  } finally {
    loading.value = false;
  }
}
function selectBranch(branch) {
  hapticFeedback("light");
  locationStore.setBranch(branch);
}
function confirmSelection() {
  if (locationStore.selectedBranch) {
    hapticFeedback("light");
    closeDialog();
    emit("branchSelected", locationStore.selectedBranch);
  }
}
function selectDeliveryAddress() {
  if (deliveryAddress.value.trim()) {
    hapticFeedback("light");
    closeDialog();
    emit("addressSelected", deliveryAddress.value);
  }
}
function closeDialog() {
  isOpen.value = false;
}
</script>
<style scoped>
.dialog-overlay {
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
}
.dialog-content {
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease;
}
.dialog-enter-active .dialog-content,
.dialog-leave-active .dialog-content {
  transition: transform 0.3s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .dialog-content,
.dialog-leave-to .dialog-content {
  transform: translateY(100%);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  position: relative;
}
.header::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
}
.header h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--color-background-secondary);
  font-size: 20px;
  color: var(--color-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.close-btn:hover {
  background: var(--color-border);
}
.tabs {
  display: flex;
  padding: 8px;
  gap: 8px;
  border-bottom: 1px solid var(--color-border);
}
.tab {
  flex: 1;
  padding: 12px;
  border: none;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-duration) var(--transition-easing);
}
.tab.active {
  background: var(--color-text-primary);
  color: var(--color-background);
  font-weight: var(--font-weight-semibold);
}
.tab:hover:not(.active) {
  background: var(--color-border);
}
.delivery-section,
.branches-section {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.address-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.address-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  background: var(--color-background);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color var(--transition-duration) var(--transition-easing);
}
.address-input:focus {
  border-color: var(--color-primary);
}
.address-input::placeholder {
  color: var(--color-text-muted);
}
.select-address-btn {
  padding: 14px;
  background: var(--color-primary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.select-address-btn:hover {
  background: var(--color-primary-hover);
}
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.branches-list {
  margin-bottom: 16px;
}
.branch-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border: none;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform var(--transition-duration) var(--transition-easing);
  box-shadow: var(--shadow-sm);
}
.branch-item:hover {
  background: var(--color-background-secondary);
}
.branch-item:active {
  transform: scale(0.98);
}
.branch-item.active {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
}
.branch-info {
  flex: 1;
}
.branch-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.branch-address {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.branch-hours {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  background: var(--color-background-secondary);
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  display: inline-block;
  margin-top: 4px;
}
.checkmark {
  color: var(--color-text-primary);
  margin-left: 8px;
  flex-shrink: 0;
}
.map-placeholder {
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-md);
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
}
.map-pin {
  font-size: 48px;
  margin-bottom: 8px;
}
.confirm-btn {
  margin: 16px;
  padding: 14px;
  background: var(--color-primary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    background-color var(--transition-duration) var(--transition-easing),
    transform var(--transition-duration) var(--transition-easing);
}
.confirm-btn:hover {
  background: var(--color-primary-hover);
}
.confirm-btn:active {
  transform: scale(0.98);
}
</style>
