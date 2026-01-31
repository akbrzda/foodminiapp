<template>
  <nav v-if="items.length" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <template v-for="(item, index) in items" :key="`${item.label}-${index}`">
      <RouterLink v-if="item.to && index < items.length - 1" :to="item.to" class="hover:text-foreground">
        {{ item.label }}
      </RouterLink>
      <span v-else class="text-foreground">{{ item.label }}</span>
      <span v-if="index < items.length - 1" class="text-muted-foreground/60">/</span>
    </template>
  </nav>
</template>
<script setup>
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";

const route = useRoute();

const normalizePath = (path) => {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const items = computed(() => {
  const metaCrumbs = route.meta?.breadcrumbs;
  if (Array.isArray(metaCrumbs) && metaCrumbs.length) {
    return metaCrumbs.map((crumb) => ({
      label: crumb.label,
      to: crumb.to || null,
    }));
  }
  const matched = route.matched.filter((record) => record.meta?.title);
  return matched.map((record, index) => ({
    label: record.meta.title,
    to: index < matched.length - 1 ? normalizePath(record.path) : null,
  }));
});
</script>
