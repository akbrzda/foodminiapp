<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Теги меню</CardTitle>
        <CardDescription>Управление тегами для фильтрации блюд</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex justify-end">
          <Button @click="openModal()">
            <Plus :size="16" />
            Добавить тег
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Список тегов</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table v-if="tags.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead>Тег</TableHead>
              <TableHead>Иконка</TableHead>
              <TableHead>Цвет</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="tag in tags" :key="tag.id">
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
          </TableBody>
        </Table>
        <div v-else class="py-12 text-center text-muted-foreground">
          <p>Нет тегов</p>
        </div>
      </CardContent>
    </Card>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitTag">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название*</label>
          <Input v-model="form.name" required placeholder="Например: Острое, Веган" />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Иконка (эмодзи)</label>
          <Input v-model="form.icon" placeholder="🌶️" maxlength="10" />
          <p class="text-xs text-muted-foreground">Используйте эмодзи для визуального отображения тега</p>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цвет</label>
          <div class="flex gap-2">
            <Input v-model="form.color" placeholder="#FF6B6B" maxlength="7" class="flex-1" />
            <input type="color" v-model="form.color" class="h-10 w-12 cursor-pointer rounded border" />
          </div>
          <p class="text-xs text-muted-foreground">Выберите цвет для отображения тега в интерфейсе</p>
        </div>
        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Plus, Pencil, Trash2, Save } from "lucide-vue-next";
import BaseModal from "../components/BaseModal.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import { useNotifications } from "../composables/useNotifications";
import api from "../api/client";

const { showErrorNotification, showSuccessNotification } = useNotifications();

const tags = ref([]);
const showModal = ref(false);
const editingTag = ref(null);

const form = ref({
  name: "",
  icon: "",
  color: "",
});

const modalTitle = computed(() => (editingTag.value ? "Редактировать тег" : "Новый тег"));
const modalSubtitle = computed(() => (editingTag.value ? "Изменение тега" : "Создание нового тега"));

onMounted(() => {
  loadTags();
});

async function loadTags() {
  try {
    const response = await api.get("/api/menu/admin/tags");
    tags.value = response.data.tags || [];
  } catch (error) {
    showErrorNotification("Ошибка загрузки тегов");
    console.error("Failed to load tags:", error);
  }
}

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
    console.error("Failed to save tag:", error);
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
    console.error("Failed to delete tag:", error);
  }
}
</script>
