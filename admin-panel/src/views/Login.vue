<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-10">
    <Card class="w-full max-w-[360px]">
      <CardHeader>
        <UserIcon class="mx-auto mb-2" :size="56" />
        <CardTitle class="text-center">Панель управления</CardTitle>
        <CardDescription class="text-center">Вход для администраторов и менеджеров</CardDescription>
      </CardHeader>
      <CardContent class="p-4">
        <form class="space-y-5" @submit.prevent="handleLogin">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground" for="email">Email</label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
              <Input id="email" v-model="form.email" class="pl-9" type="email" autocomplete="email" required />
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground" for="password">Пароль</label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
              <Input id="password" v-model="form.password" class="pl-9" type="password" autocomplete="current-password" required />
            </div>
          </div>
          <div v-if="authStore.error" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ authStore.error }}
          </div>
          <Button class="w-full" type="submit" :disabled="authStore.loading">
            <LogIn :size="16" />
            {{ authStore.loading ? "Входим..." : "Войти" }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { LogIn, Lock, Mail, UserIcon } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth.js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
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
