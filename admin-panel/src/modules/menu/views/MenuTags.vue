import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Теги меню" description="Управление тегами для фильтрации блюд">
          <template #actions>
            <Button @click="openModal()">
              <Plus :size="16" />
              Добавить тег
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <Table v-if="isLoading || tags.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead>Тег</TableHead>
              <TableHead>Иконка</TableHead>
              <TableHead>Цвет</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="isLoading">
              <TableRow v-for="index in 6" :key="`loading-${index}`">
                <TableCell><Skeleton class="h-4 w-32" /></TableCell>
                <TableCell><Skeleton class="h-6 w-6 rounded" /></TableCell>
                <TableCell><Skeleton class="h-4 w-20" /></TableCell>
                <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="tag in paginatedTags" :key="tag.id">
                <TableCell>
                  <div class="font-medium text-foreground">{{ tag.name }}</div>
                </TableCell>
                <TableCell>
                  <span class="text-2xl">{{ tag.icon || "—" }}</span>
                </TableCell>
                <TableCell>
                  <div v-if="tag.color" class="flex items-center gap-2">
                    <div class="h-6 w-6 rounded border" :style="{ backgroundColor: tag.color }"></div>
                    <span class="text-xs text-muted-foreground">{{ tag.color }}</span>
                  </div>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" @click="openModal(tag)">
                      <Pencil :size="16" />
                    </Button>
                    <Button variant="ghost" size="icon" @click="deleteTag(tag)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
        <div v-else class="py-12 text-center text-muted-foreground">
          <p>Нет тегов</p>
        </div>
      </CardContent>
    </Card>
    <TablePagination :total="tags.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitTag">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название*</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" required placeholder="Например: Острое, Веган" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Иконка (эмодзи)</FieldLabel>
              <FieldContent>
                <Input v-model="form.icon" placeholder="🌶️" maxlength="10" />
                <p class="text-xs text-muted-foreground">Используйте эмодзи для визуального отображения тега</p>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цвет</FieldLabel>
              <FieldContent>
                <div class="flex gap-2">
                  <Input v-model="form.color" placeholder="#FF6B6B" maxlength="7" class="flex-1" />
                  <input type="color" v-model="form.color" class="h-10 w-12 cursor-pointer rounded border" />
                </div>
                <p class="text-xs text-muted-foreground">Выберите цвет для отображения тега в интерфейсе</p>
              </FieldContent>
            </Field>
          </FieldGroup>
          <Button class="w-full" type="submit">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Plus, Pencil, Trash2, Save } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import Input from "@/shared/components/ui/input/Input.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import api from "@/shared/api/client.js";
const { showErrorNotification, showSuccessNotification } = useNotifications();
const ordersStore = useOrdersStore();
const tags = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const showModal = ref(false);
const editingTag = ref(null);
const form = ref({
  name: "",
  icon: "",
  color: "",
});
const modalTitle = computed(() => (editingTag.value ? "Редактировать тег" : "Новый тег"));
const modalSubtitle = computed(() => (editingTag.value ? "Изменение тега" : "Создание нового тега"));
const paginatedTags = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return tags.value.slice(start, start + pageSize.value);
});
const modalNameTitle = computed(() => {
  if (!showModal.value) return null;
  const name = String(form.value.name || "").trim();
  if (editingTag.value && name) return `Тег: ${name}`;
  if (editingTag.value) return "Тег";
  return "Новый тег";
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
onMounted(() => {
  loadTags();
});
watch(
  () => [modalNameTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(modalNameTitle.value || "Теги меню");
  },
  { immediate: true },
);
async function loadTags() {
  isLoading.value = true;
  try {
    const response = await api.get("/api/menu/admin/tags");
    tags.value = response.data.tags || [];
    page.value = 1;
  } catch (error) {
    showErrorNotification("Ошибка загрузки тегов");
    devError("Failed to load tags:", error);
  } finally {
    isLoading.value = false;
  }
}
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
function openModal(tag = null) {
  editingTag.value = tag;
  if (tag) {
    form.value = {
      name: tag.name,
      icon: tag.icon || "",
      color: tag.color || "",
    };
  } else {
    form.value = {
      name: "",
      icon: "",
      color: "",
    };
  }
  showModal.value = true;
}
function closeModal() {
  showModal.value = false;
  editingTag.value = null;
  form.value = {
    name: "",
    icon: "",
    color: "",
  };
}
async function submitTag() {
  try {
    const payload = {
      name: form.value.name.trim(),
      icon: form.value.icon.trim() || null,
      color: form.value.color.trim() || null,
    };
    if (editingTag.value) {
      await api.put(`/api/menu/admin/tags/${editingTag.value.id}`, payload);
      showSuccessNotification("Тег успешно обновлен");
    } else {
      await api.post("/api/menu/admin/tags", payload);
      showSuccessNotification("Тег успешно создан");
    }
    closeModal();
    loadTags();
  } catch (error) {
    if (error.response?.data?.error) {
      showErrorNotification(error.response.data.error);
    } else {
      showErrorNotification("Ошибка сохранения тега");
    }
    devError("Failed to save tag:", error);
  }
}
async function deleteTag(tag) {
  if (!confirm(`Удалить тег "${tag.name}"? Это действие необратимо.`)) {
    return;
  }
  try {
    await api.delete(`/api/menu/admin/tags/${tag.id}`);
    showSuccessNotification("Тег удален");
    loadTags();
  } catch (error) {
    showErrorNotification("Ошибка удаления тега");
    devError("Failed to delete tag:", error);
  }
}
</script>
