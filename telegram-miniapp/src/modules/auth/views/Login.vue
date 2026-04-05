<template>
  <div class="login">
    <div class="page-container page-container--safe-bottom login-shell">
      <div class="login-content">
        <div class="logo"><img src="../../../panda.png" alt="Panda Pizza" /></div>
      </div>

      <div class="login-footer">
        <p>Нажмите кнопку ниже, чтобы войти</p>
        <button class="login-btn" @click="handleLogin" :disabled="loading">
          {{ loading ? "Вход..." : "Войти" }}
        </button>
        <div v-if="error" class="error">{{ error }}</div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { getPlatformBridge } from "@/shared/platform/index.js";
import { trackGoalByKey } from "@/shared/services/metrika.js";
import { devError } from "@/shared/utils/logger.js";
const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const error = ref("");
onMounted(() => {
  if (authStore.isAuthenticated) {
    router.push("/");
    return;
  }
});
async function handleLogin() {
  try {
    loading.value = true;
    error.value = "";
    const bridge = getPlatformBridge();
    bridge.hapticFeedback("light");
    const isMaxPlatform = bridge.platform === "max";

    // Для MAX запрос контакта должен стартовать сразу по пользовательскому клику.
    // Иначе после await-цепочки backend может отклонить вызов (loss of user gesture).
    const earlyContactPromise = isMaxPlatform
      ? bridge.requestContact({ timeoutMs: 20000 }).catch(() => null)
      : Promise.resolve(null);

    let loginResult = await authStore.loginWithMiniAppInitData();
    if (loginResult?.phoneRequired) {
      const phoneNumber = await earlyContactPromise;

      if (phoneNumber) {
        loginResult = await authStore.loginWithMiniAppInitData({ phone: phoneNumber });
      }
    }

    if (!loginResult?.ok) {
      error.value = loginResult?.errorMessage || "Ошибка авторизации";
      if (loginResult?.errorCode === "AUTH_PHONE_REQUIRED") {
        error.value = "Для регистрации нужен номер телефона. Разрешите доступ к контактам в MAX и повторите вход.";
      }
      trackGoalByKey("login_failed", {
        code: String(loginResult?.errorCode || "unknown"),
      });
      bridge.hapticFeedback("error");
      return;
    }

    trackGoalByKey("login_success");
    bridge.hapticFeedback("success");
    router.push("/");
  } catch (err) {
    error.value = err.message || "Ошибка авторизации";
    trackGoalByKey("login_failed", {
      code: "exception",
    });
    getPlatformBridge().hapticFeedback("error");
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
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-background);
  overflow: hidden;
}
.login-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  margin: 0 auto;
}
.login-footer {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
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
