<template>
  <header class="page-header">
    <h1 class="page-title">{{ title }}</h1>
  </header>
</template>
<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
});
</script>
<style scoped>
.page-header {
  --page-header-safe-top: env(safe-area-inset-top, 0px);
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  /* Учитываем safe area insets для правильного позиционирования под нативным header */
  /* Нативные кнопки Telegram занимают примерно 48px слева и справа */
  padding-left: 48px;
  padding-right: 48px;
  padding-top: calc(12px + var(--tg-content-safe-area-inset-top, var(--page-header-safe-top)));
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  min-height: calc(44px + var(--tg-content-safe-area-inset-top, var(--page-header-safe-top)));
}
.page-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  text-align: center;
  margin: 0;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
