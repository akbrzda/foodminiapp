<template>
  <Dialog :open="open">
    <DialogContent class="shift-branch-dialog">
      <DialogHeader>
        <DialogTitle>Выберите филиал</DialogTitle>
        <DialogDescription>Для работы со сменой нужно указать активный филиал.</DialogDescription>
      </DialogHeader>
      <div class="mt-4">
        <Select :model-value="selectedBranchId" @update:model-value="$emit('update:selectedBranchId', $event)">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Выберите филиал" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="branch in branchOptions" :key="branch.id" :value="String(branch.id)">
              {{ branch.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter class="mt-6">
        <Button :disabled="!selectedBranchId" @click="$emit('confirm')">Продолжить</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import Button from "@/shared/components/ui/button/Button.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";

defineProps({
  open: { type: Boolean, required: true },
  selectedBranchId: { type: String, required: true },
  branchOptions: { type: Array, required: true },
});

defineEmits(["update:selectedBranchId", "confirm"]);
</script>

<style scoped>
:deep(.shift-branch-dialog > button) {
  display: none;
}
</style>
