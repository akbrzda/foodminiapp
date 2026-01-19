<template>
  <div class="profile">
    <div class="profile-content">
      <div class="form-card phone-card">
        <label class="field-label">Телефон</label>
        <div class="field-value">{{ formatPhone(authStore.user?.phone) || "—" }}</div>
      </div>

      <div class="form-card">
        <label class="field-label" for="first-name">Имя</label>
        <input id="first-name" v-model="profileForm.first_name" class="field-input" type="text" placeholder="Введите имя" />
      </div>

      <div class="form-card">
        <label class="field-label" for="last-name">Фамилия</label>
        <input id="last-name" v-model="profileForm.last_name" class="field-input" type="text" placeholder="Введите фамилию" />
      </div>

      <div class="form-card">
        <label class="field-label" for="email">Email</label>
        <input id="email" v-model="profileForm.email" class="field-input" type="email" placeholder="Введите email" />
      </div>

      <div class="form-card">
        <label class="field-label" for="birthdate">День рождения</label>
        <input id="birthdate" v-model="profileForm.date_of_birth" class="field-input" type="date" />
      </div>

      <button class="save-btn" @click="saveProfile" :disabled="saving">
        {{ saving ? "Сохранение..." : "Сохранить" }}
      </button>
      <p v-if="saveMessage" class="save-message">{{ saveMessage }}</p>
      <p v-if="saveError" class="save-error">{{ saveError }}</p>

      <button class="logout-btn" @click="logout">Выйти</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { authAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
import { formatPhone } from "../utils/phone";

const router = useRouter();
const authStore = useAuthStore();

const saving = ref(false);
const saveMessage = ref("");
const saveError = ref("");
const profileForm = ref({
  first_name: "",
  last_name: "",
  email: "",
  date_of_birth: "",
});

onMounted(async () => {
  hydrateForm();
});

function hydrateForm() {
  profileForm.value = {
    first_name: authStore.user?.first_name || "",
    last_name: authStore.user?.last_name || "",
    email: authStore.user?.email || "",
    date_of_birth: normalizeDateForInput(authStore.user?.date_of_birth),
  };
}

async function saveProfile() {
  if (saving.value) return;
  saving.value = true;
  saveMessage.value = "";
  saveError.value = "";
  hapticFeedback("light");

  try {
    const response = await authAPI.updateProfile({
      first_name: profileForm.value.first_name?.trim() || "",
      last_name: profileForm.value.last_name?.trim() || "",
      email: profileForm.value.email?.trim() || "",
      date_of_birth: profileForm.value.date_of_birth || null,
    });
    if (response?.data?.user) {
      authStore.setUser(response.data.user);
      hydrateForm();
    }
    hapticFeedback("success");
    saveMessage.value = "Профиль обновлен";

    // Автоматически скрываем сообщение через 3 секунды
    setTimeout(() => {
      saveMessage.value = "";
    }, 3000);
  } catch (error) {
    console.error("Failed to update profile:", error);
    hapticFeedback("error");
    saveError.value = error.response?.data?.error || "Не удалось сохранить профиль";

    // Автоматически скрываем ошибку через 5 секунд
    setTimeout(() => {
      saveError.value = "";
    }, 5000);
  } finally {
    saving.value = false;
  }
}

function logout() {
  hapticFeedback("medium");
  authStore.logout();
  router.push("/login");
}

function normalizeDateForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
</script>

<style scoped>
.profile {
  min-height: 100vh;
  background: var(--color-background);
}

.profile-content {
  padding: 16px 12px 32px;
}

.form-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: 8px 12px;
  margin-bottom: 14px;
}
#birthdate {
  text-align: left;
}

.phone-card {
  background: var(--color-background-secondary);
  border: none;
}

.field-label {
  display: block;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.field-value {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.field-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.save-btn {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: var(--border-radius-lg);
  background: var(--color-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--transition-duration) var(--transition-easing);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.logout-btn {
  width: 100%;
  margin-top: 12px;
  padding: 16px;
  border: none;
  border-radius: var(--border-radius-lg);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.save-message {
  margin: 8px 4px 0;
  font-size: var(--font-size-h3);
  color: var(--color-success);
}

.save-error {
  margin: 8px 4px 0;
  font-size: var(--font-size-h3);
  color: var(--color-error);
}
</style>
