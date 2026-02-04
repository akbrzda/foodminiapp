<template>
  <Dialog v-if="open" :open="open" @update:open="(value) => (value ? null : emit('close'))">
    <DialogContent class="w-full max-w-3xl">
      <DialogHeader>
        <DialogTitle>Скопировать тарифы</DialogTitle>
        <DialogDescription>Выберите полигон того же филиала с настроенными тарифами.</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-2">
          <Label class="text-xs font-medium text-muted-foreground">Полигон-источник</Label>
          <Select v-model="selected">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Выберите полигон" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Выберите полигон</SelectItem>
              <SelectItem v-for="source in sources" :key="source.id" :value="source.id">
                {{ source.name || `Полигон #${source.id}` }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="preview.length" class="overflow-hidden rounded-lg border border-border">
          <div class="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Предпросмотр</div>
          <div class="divide-y divide-border">
            <div v-for="(tariff, index) in preview" :key="index" class="flex items-center justify-between px-4 py-2 text-sm">
              <span>От {{ tariff.amount_from }} ₽ до {{ tariff.amount_to ?? "∞" }} ₽</span>
              <span class="font-medium">{{ tariff.delivery_cost }} ₽</span>
            </div>
          </div>
        </div>
        <div v-else class="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          Нет выбранного полигона для предпросмотра.
        </div>
      </div>
      <DialogFooter class="mt-6 gap-2">
        <Button variant="outline" @click="emit('close')">Отмена</Button>
        <Button :disabled="!selected" @click="confirm">Скопировать</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import Button from "@/shared/components/ui/button/Button.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

const props = defineProps({
  open: Boolean,
  sources: {
    type: Array,
    default: () => [],
  },
  previewTariffs: {
    type: Array,
    default: () => [],
  },
  selectedSourceId: {
    type: [String, Number],
    default: "",
  },
});

const emit = defineEmits(["close", "select", "confirm"]);

const selected = ref("");

const preview = computed(() => props.previewTariffs || []);

const confirm = () => {
  emit("confirm", selected.value);
};

watch(
  () => props.selectedSourceId,
  (value) => {
    selected.value = value ? String(value) : "";
  },
  { immediate: true },
);

watch(selected, (value) => {
  emit("select", value || "");
});
</script>
