<template>
  <Card v-if="total > 0">
    <CardContent class="px-3 py-4 sm:px-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="text-sm text-muted-foreground sm:pr-4">
          Показаны записи {{ from }} - {{ to }} из {{ total }}
        </div>
        <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div class="flex items-center justify-between gap-2 sm:justify-start">
            <span class="text-sm text-muted-foreground">На странице</span>
            <Select :model-value="String(pageSize)" @update:model-value="onPageSizeChange">
              <SelectTrigger class="h-9 w-[88px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in pageSizeOptions" :key="option" :value="String(option)">{{ option }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              class="w-full sm:w-auto"
              :disabled="page <= 1"
              @click="$emit('update:page', page - 1)"
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="w-full sm:w-auto"
              :disabled="page >= totalPages"
              @click="$emit('update:page', page + 1)"
            >
              Вперед
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup>
import { computed } from "vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

const props = defineProps({
  total: {
    type: Number,
    default: 0,
  },
  page: {
    type: Number,
    required: true,
  },
  pageSize: {
    type: Number,
    required: true,
  },
  pageSizeOptions: {
    type: Array,
    default: () => [20, 50, 75, 100],
  },
});

const emit = defineEmits(["update:page", "update:pageSize"]);

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const to = computed(() => (props.total === 0 ? 0 : Math.min(props.page * props.pageSize, props.total)));

const onPageSizeChange = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  emit("update:pageSize", numeric);
};
</script>
