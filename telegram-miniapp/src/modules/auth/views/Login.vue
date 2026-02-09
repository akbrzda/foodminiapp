<template>
  <div class="login">
    <div class="login-content">
      <div class="logo"><img src="../../../panda.png" alt="Panda Pizza" /></div>
    </div>

    <div class="login-footer">
      <p>Нажмите кнопку ниже, чтобы войти</p>
      <button class="login-btn" @click="handleLogin" :disabled="loading">
        {{ loading ? "Вход..." : "Поделиться номером" }}
      </button>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useTelegramStore } from "@/shared/stores/telegram.js";
import { authAPI } from "@/shared/api/endpoints.js";
import { getInitData, getTelegramUser, hapticFeedback, requestContact } from "@/shared/services/telegram.js";
import { devError, devLog } from "@/shared/utils/logger.js";
const router = useRouter();
const authStore = useAuthStore();
const telegramStore = useTelegramStore();
const loading = ref(false);
const error = ref("");
onMounted(() => {
  if (window.Telegram?.WebApp) {
    const originalOnEvent = window.Telegram.WebApp.onEvent.bind(window.Telegram.WebApp);
    window.Telegram.WebApp.onEvent = function (eventType, eventHandler) {
      devLog("[Login] WebApp.onEvent registered:", eventType);
      return originalOnEvent(eventType, function (...args) {
        devLog("[Login] WebApp event fired:", eventType, args);
        return eventHandler(...args);
      });
    };
  }
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
    const response = await authAPI.loginWithTelegram(initData);
    authStore.setToken(response.data.token);
    authStore.setUser(response.data.user);
    if (!response.data.user?.phone) {
      devLog("[Login] User has no phone, requesting contact...");
      const phoneNumber = await requestContact();
      devLog("[Login] Received phone number:", phoneNumber);
      if (phoneNumber) {
        try {
          devLog("[Login] Updating profile with phone:", phoneNumber);
          const updated = await authAPI.updateProfile({ phone: phoneNumber });
          devLog("[Login] Profile updated:", updated.data);
          authStore.setUser(updated.data.user);
        } catch (updateError) {
          devError("[Login] Не удалось обновить телефон:", updateError);
        }
      } else {
        devLog("[Login] Номер телефона не получен из requestContact");
      }
    }
    hapticFeedback("success");
    router.push("/");
  } catch (err) {
    error.value = err.message || "Ошибка авторизации";
    hapticFeedback("error");
    devError("Ошибка входа:", err);
  } finally {
    loading.value = false;
  }
}
</script>
<style scoped>
.login {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-background);
  overflow: hidden;
  padding: 16px 12px calc(12px + env(safe-area-inset-bottom));
}
.login-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-primary);
  max-width: 400px;
  width: 100%;
}
.login-footer {
  width: 100%;
  max-width: 400px;
}
/* Контейнер логотипа */
.logo {
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo img {
  width: min(300px, 80vw);
  height: auto;
  animation:
    welcome-entrance 0.8s ease-out,
    welcome-bounce 1.2s ease-in-out 0.8s 2,
    gentle-float 4s ease-in-out 3.2s infinite;
}

/* 1. Плавное появление с небольшим увеличением */
@keyframes welcome-entrance {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 2. Приветственное "подпрыгивание" (2 раза) */
@keyframes welcome-bounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-10px) scale(1.03);
  }
}

/* 3. Спокойное "плавание" после приветствия */
@keyframes gentle-float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-5px);
  }
}

h1 {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}
p {
  font-size: var(--font-size-caption);
  color: var(--color-text-primary);
  opacity: 0.8;
  margin-bottom: 20px;
  text-align: center;
}
.login-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-md);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    transform var(--transition-duration) var(--transition-easing),
    background-color var(--transition-duration) var(--transition-easing);
}
.login-btn:hover:not(:disabled) {
  transform: scale(0.98);
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
