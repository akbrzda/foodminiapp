<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Отменить заказ #{{ order?.order_number }}</DialogTitle>
        <DialogDescription>Заказ будет перемещён в завершённые и получит статус отмены.</DialogDescription>
      </DialogHeader>
      <DialogFooter class="mt-6 gap-2">
        <Button variant="outline" @click="$emit('close')">Отмена</Button>
        <Button variant="destructive" :disabled="loading" @click="$emit('confirm')"> Подтвердить </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { computed } from "vue";
import Button from "@/shared/components/ui/button/Button.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";

const props = defineProps({
  open: { type: Boolean, required: true },
  order: { type: Object, default: null },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(["update:open", "close", "confirm"]);

// Двусторонняя привязка для открытия диалога
const dialogOpen = computed({
  get: () => props.open,
  set: (value) => {
    emit("update:open", value);
    if (!value) emit("close");
  },
});
</script>
