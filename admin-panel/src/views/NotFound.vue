<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <Card class="w-full max-w-md text-center">
      <CardContent class="space-y-3 py-10">
        <div class="text-5xl font-semibold text-foreground">404</div>
        <div class="text-sm text-muted-foreground">Страница не найдена</div>
        <RouterLink to="/">
          <Button class="mt-4">
            <Home :size="16" />
            На главную
          </Button>
        </RouterLink>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { Home } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
</script>
