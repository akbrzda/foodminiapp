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
const form = reactive({
  email: "",
  password: "",
});

const handleLogin = async () => {
  const ok = await authStore.login(form);
  if (ok) {
    router.push({ name: "dashboard" });
  }
};
</script>
