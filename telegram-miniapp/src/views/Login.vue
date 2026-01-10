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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px;
}

.login-content {
  text-align: center;
  color: white;
  max-width: 400px;
  width: 100%;
}

.logo {
  font-size: 80px;
  margin-bottom: 24px;
}

h1 {
  font-size: 32px;
  margin-bottom: 12px;
}

p {
  font-size: 16px;
  opacity: 0.9;
  margin-bottom: 48px;
}

.login-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: white;
  color: #667eea;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.login-btn:hover {
  transform: scale(1.02);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  margin-top: 16px;
  padding: 12px;
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.5);
  border-radius: 8px;
  color: white;
}
</style>
