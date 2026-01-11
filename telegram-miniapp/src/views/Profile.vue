<template>
  <div class="profile">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Профиль</h1>
    </div>

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

.profile-content {
  padding: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
}

.avatar {
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background: #667eea;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
}

.user-info h2 {
  font-size: 18px;
  margin-bottom: 4px;
}

.user-info p {
  font-size: 14px;
  color: #666;
}

.bonus-card {
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  margin-bottom: 16px;
  text-align: center;
}

.bonus-label {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.bonus-amount {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 16px;
}

.history-btn {
  padding: 8px 16px;
  border: 1px solid white;
  border-radius: 8px;
  background: transparent;
  color: white;
  cursor: pointer;
}

.menu-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

.menu-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: none;
  background: white;
  border-bottom: 1px solid #f5f5f5;
  text-align: left;
  font-size: 16px;
  cursor: pointer;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: #f9f9f9;
}
</style>
