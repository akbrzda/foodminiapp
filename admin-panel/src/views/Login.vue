<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <div class="glass w-full max-w-lg rounded-[32px] border border-white/70 p-10 shadow-card">
      <div class="mb-8">
        <p class="panel-title text-3xl font-semibold text-ink">Panda Admin</p>
        <p class="text-sm text-ink/60">Вход для администраторов и менеджеров</p>
      </div>

      <form class="space-y-5" @submit.prevent="handleLogin">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60" for="email">Email</label>
          <input
            id="email"
            v-model="form.email"
            class="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm text-ink shadow-sm focus:border-accent focus:outline-none"
            type="email"
            autocomplete="email"
            required
          />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60" for="password">Пароль</label>
          <input
            id="password"
            v-model="form.password"
            class="mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm text-ink shadow-sm focus:border-accent focus:outline-none"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>

        <div v-if="authStore.error" class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ authStore.error }}
        </div>

        <button
          class="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-ink/90"
          :disabled="authStore.loading"
        >
          {{ authStore.loading ? "Входим..." : "Войти" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const authStore = useAuthStore();
const router = useRouter();

const form = reactive({
  email: "",
  password: "",
});

const handleLogin = async () => {
  const ok = await authStore.login(form);
  if (ok) {
    router.push({ name: "orders" });
  }
};
</script>
