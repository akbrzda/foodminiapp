<template>
  <div class="login">
    <div class="login-content">
      <div class="logo">🍔</div>
      <h1>Добро пожаловать</h1>
      <p>Войдите с помощью Telegram для продолжения</p>

      <button class="login-btn" @click="handleLogin" :disabled="loading">
        {{ loading ? "Вход..." : "🚀 Войти через Telegram" }}
      </button>

      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useTelegramStore } from "../stores/telegram";
import { authAPI } from "../api/endpoints";
import { getInitData, getTelegramUser, hapticFeedback, requestContact } from "../services/telegram";

const router = useRouter();
const authStore = useAuthStore();
const telegramStore = useTelegramStore();

const loading = ref(false);
const error = ref("");

onMounted(() => {
  // Добавляем глобальный обработчик для отладки
  if (window.Telegram?.WebApp) {
    const originalOnEvent = window.Telegram.WebApp.onEvent.bind(window.Telegram.WebApp);
    window.Telegram.WebApp.onEvent = function (eventType, eventHandler) {
      console.log("[Login] WebApp.onEvent registered:", eventType);
      return originalOnEvent(eventType, function (...args) {
        console.log("[Login] WebApp event fired:", eventType, args);
        return eventHandler(...args);
      });
    };
  }

  // Если уже авторизован - редирект
  if (authStore.isAuthenticated) {
    router.push("/");
  }
});

async function handleLogin() {
  try {
    loading.value = true;
    error.value = "";
    hapticFeedback("light");

    const initData = getInitData();
    const telegramUser = getTelegramUser();

    if (!initData || !telegramUser) {
      error.value = "Не удалось получить данные Telegram";
      hapticFeedback("error");
      return;
    }

    // Отправляем initData на backend для проверки
    const response = await authAPI.loginWithTelegram(initData);

    // Сохраняем токен и данные пользователя
    authStore.setToken(response.data.token);
    authStore.setUser(response.data.user);

    if (!response.data.user?.phone) {
      console.log("[Login] User has no phone, requesting contact...");
      const phoneNumber = await requestContact();
      console.log("[Login] Received phone number:", phoneNumber);
      if (phoneNumber) {
        try {
          console.log("[Login] Updating profile with phone:", phoneNumber);
          const updated = await authAPI.updateProfile({ phone: phoneNumber });
          console.log("[Login] Profile updated:", updated.data);
          authStore.setUser(updated.data.user);
        } catch (updateError) {
          console.error("[Login] Failed to update phone:", updateError);
        }
      } else {
        console.log("[Login] No phone number received from requestContact");
      }
    }

    hapticFeedback("success");
    router.push("/");
  } catch (err) {
    error.value = err.message || "Ошибка авторизации";
    hapticFeedback("error");
    console.error("Login error:", err);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  padding: 16px 12px;
}

.login-content {
  text-align: center;
  color: var(--color-text-primary);
  max-width: 400px;
  width: 100%;
}

.logo {
  font-size: 80px;
  margin-bottom: 24px;
}

h1 {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

p {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  opacity: 0.8;
  margin-bottom: 48px;
}

.login-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: transform var(--transition-duration) var(--transition-easing), background-color var(--transition-duration) var(--transition-easing);
}

.login-btn:hover:not(:disabled) {
  transform: scale(1.02);
  background: var(--color-background-secondary);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.error {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 0, 0, 0.1);
  border: 1px solid var(--color-error);
  border-radius: var(--border-radius-sm);
  color: var(--color-error);
  font-size: var(--font-size-body);
}
</style>
