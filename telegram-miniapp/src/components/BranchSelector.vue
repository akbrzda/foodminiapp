<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click="closeDialog">
        <div class="dialog-content" @click.stop>
          <div class="header">
            <h3>{{ isDelivery ? "Доставка" : "Самовывоз" }}</h3>
            <button @click="closeDialog" class="close-btn">✕</button>
          </div>

          <div class="tabs">
            <button @click="isDelivery = true" class="tab" :class="{ active: isDelivery }">Доставка</button>
            <button @click="isDelivery = false" class="tab" :class="{ active: !isDelivery }">Самовывоз</button>
          </div>

          <!-- Доставка -->
          <div v-if="isDelivery" class="delivery-section">
            <div class="address-input-wrapper">
              <input v-model="deliveryAddress" placeholder="Куда доставить ваш заказ?" class="address-input" />
              <button @click="selectDeliveryAddress" class="select-address-btn">Выбрать</button>
            </div>
          </div>

          <!-- Самовывоз -->
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
                <span v-if="branch.id === locationStore.selectedBranch?.id" class="checkmark">✓</span>
              </button>
            </div>

            <!-- Карта (placeholder) -->
            <div class="map-placeholder">
              <div class="map-pin">📍</div>
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
  }
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
  background: white;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  border-bottom: 1px solid #e5e7eb;
}

.header h3 {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: #e5e7eb;
}

.tabs {
  display: flex;
  padding: 8px;
  gap: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.tab {
  flex: 1;
  padding: 12px;
  border: none;
  background: #f3f4f6;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.tab.active {
  background: #374151;
  color: white;
}

.tab:hover:not(.active) {
  background: #e5e7eb;
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
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 14px;
  outline: none;
}

.address-input:focus {
  border-color: #fbbf24;
}

.select-address-btn {
  padding: 14px;
  background: #fbbf24;
  color: #000;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.select-address-btn:hover {
  background: #f59e0b;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: #6b7280;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #fbbf24;
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
  background: white;
  border-radius: 12px;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.branch-item:hover {
  background: #f9fafb;
}

.branch-item:active {
  transform: scale(0.98);
}

.branch-item.active {
  background: #fef3c7;
  border: 1px solid #fbbf24;
}

.branch-info {
  flex: 1;
}

.branch-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.branch-address {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
}

.branch-hours {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-block;
  margin-top: 4px;
}

.checkmark {
  color: #fbbf24;
  font-size: 24px;
  font-weight: 600;
  margin-left: 8px;
}

.map-placeholder {
  background: #e5e7eb;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  color: #6b7280;
}

.map-pin {
  font-size: 48px;
  margin-bottom: 8px;
}

.confirm-btn {
  margin: 16px;
  padding: 14px;
  background: #fbbf24;
  color: #000;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.confirm-btn:hover {
  background: #f59e0b;
}

.confirm-btn:active {
  transform: scale(0.98);
}
</style>
