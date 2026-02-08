<template>
  <div class="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
    <div class="w-full max-w-sm">
      <Card class="p-3">
        <CardHeader>
          <CardTitle>Вход в админ‑панель</CardTitle>
          <CardDescription>Введите данные администратора или менеджера</CardDescription>
        </CardHeader>
        <CardContent class="pt-0">
          <form @submit.prevent="handleLogin">
            <FieldGroup>
              <Field>
                <FieldLabel for="email">Email</FieldLabel>
                <div class="relative">
                  <Input id="email" v-model="form.email" type="email" autocomplete="email" required />
                </div>
              </Field>
              <Field>
                <FieldLabel for="password">Пароль</FieldLabel>
                <div class="relative">
                  <Input id="password" v-model="form.password" type="password" autocomplete="current-password" required />
                </div>
              </Field>
              <FieldError v-if="authStore.error">{{ authStore.error }}</FieldError>
              <Button class="w-full" type="submit" :disabled="authStore.loading">
                {{ authStore.loading ? "Входим..." : "Войти" }}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";

const authStore = useAuthStore();
const router = useRouter();
const POST_LOGIN_REDIRECT_KEY = "admin_post_login_redirect";
const form = reactive({
  email: "",
  password: "",
});

const normalizeRedirectPath = (value) => {
  if (!value || typeof value !== "string") return "";
  const path = value.trim();
  if (!path.startsWith("/")) return "";
  if (path === "/login" || path.startsWith("/login?")) return "";
  return path;
};

const handleLogin = async () => {
  const ok = await authStore.login(form);
  if (ok) {
    const queryRedirect = normalizeRedirectPath(router.currentRoute.value.query?.redirect);
    const storedRedirect = normalizeRedirectPath(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) || "");
    const redirectTarget = queryRedirect || storedRedirect || "/dashboard";
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    router.push(redirectTarget);
  }
};
</script>
