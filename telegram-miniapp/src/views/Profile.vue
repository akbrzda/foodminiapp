<template>
  <div class="profile">
    <PageHeader title="Профиль" />

    <div class="profile-content">
      <div class="user-info">
        <div class="avatar">{{ userInitials }}</div>
        <div>
          <h2>{{ authStore.user?.first_name }} {{ authStore.user?.last_name }}</h2>
          <p>{{ authStore.user?.phone }}</p>
        </div>
      </div>

      <div class="bonus-card">
        <div class="bonus-label">Ваши бонусы</div>
        <div class="bonus-amount">{{ bonusBalance }}</div>
        <button class="history-btn" @click="showBonusHistory">История бонусов</button>
      </div>

      <div class="menu-list">
        <button class="menu-item" @click="$router.push('/orders')">
          <span>📦 Мои заказы</span>
          <span>→</span>
        </button>
        <button class="menu-item" @click="openCityPopup">
          <span>📍 Изменить город</span>
          <span>→</span>
        </button>
        <button class="menu-item" @click="logout">
          <span>🚪 Выйти</span>
          <span>→</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { Package, ArrowRight, MapPin, LogOut } from "lucide-vue-next";
import PageHeader from "../components/PageHeader.vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { bonusesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const authStore = useAuthStore();

const bonusBalance = ref(0);

const userInitials = computed(() => {
  const firstName = authStore.user?.first_name || "";
  const lastName = authStore.user?.last_name || "";
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
});

onMounted(async () => {
  await loadBonusBalance();
});

async function loadBonusBalance() {
  try {
    const response = await bonusesAPI.getBalance();
    bonusBalance.value = response.data.balance;
  } catch (error) {
    console.error("Failed to load bonus balance:", error);
  }
}

function showBonusHistory() {
  hapticFeedback("light");
  // TODO: Показать историю бонусов
  console.log("Show bonus history");
}

function logout() {
  hapticFeedback("medium");
  authStore.logout();
  router.push("/login");
}

function openCityPopup() {
  hapticFeedback("light");
  window.dispatchEvent(new CustomEvent("open-city-popup"));
}
</script>

<style scoped>
.profile {
  min-height: 100vh;
  background: var(--color-background-secondary);
}

.profile-content {
  padding: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
}

.user-info h2 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.user-info p {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}

.bonus-card {
  padding: 24px;
  background: var(--color-primary);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  margin-bottom: 16px;
  text-align: center;
  box-shadow: var(--shadow-sm);
}

.bonus-label {
  font-size: var(--font-size-caption);
  color: var(--color-text-primary);
  opacity: 0.8;
  margin-bottom: 8px;
}

.bonus-amount {
  font-size: 48px;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 16px;
}

.history-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-text-primary);
  border-radius: var(--border-radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.history-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

.menu-list {
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.menu-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: none;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.menu-item span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--color-background-secondary);
}
</style>
