<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Группы модификаторов</CardTitle>
          <CardDescription>Одиночный и множественный выбор</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить группу
        </Button>
      </CardHeader>
    </Card>

    <div class="space-y-4">
      <Card v-for="group in groups" :key="group.id">
        <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{{ group.name }}</CardTitle>
            <CardDescription>
              {{ group.type === "single" ? "Одиночный" : "Множественный" }} ·
              {{ group.is_required ? "Обязательный" : "Опциональный" }}
            </CardDescription>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="icon" @click="openModal(group)">
              <Pencil :size="16" />
            </Button>
            <Button variant="ghost" size="icon" @click="deleteGroup(group)">
              <Trash2 :size="16" class="text-red-600" />
            </Button>
          </div>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-2 text-sm"
          >
            <div>
              <div class="font-medium text-foreground">{{ modifier.name }}</div>
              <div class="text-xs text-muted-foreground">{{ formatCurrency(modifier.price) }}</div>
            </div>
            <div class="flex gap-2">
              <Button variant="ghost" size="icon" @click="editModifier(group, modifier)">
                <Pencil :size="16" />
              </Button>
              <Button variant="ghost" size="icon" @click="deleteModifier(modifier)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
          </div>

          <Button variant="outline" size="sm" @click="openModifierModal(group)">
            <Plus :size="16" />
            Добавить модификатор
          </Button>
        </CardContent>
      </Card>
    </div>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitGroup">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="form.name" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип</label>
          <Select v-model="form.type">
            <option value="single">Одиночный выбор</option>
            <option value="multiple">Множественный выбор</option>
          </Select>
        </div>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input v-model="form.is_required" type="checkbox" class="h-4 w-4 rounded border-border" />
          Обязательная группа
        </label>
        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>

    <BaseModal v-if="showModifierModal" title="Модификатор" subtitle="Добавьте параметр" @close="closeModifierModal">
      <form class="space-y-4" @submit.prevent="submitModifier">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
          <Input v-model="modifierForm.name" required />
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Цена</label>
          <Input v-model.number="modifierForm.price" type="number" />
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
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import { formatCurrency } from "../utils/format.js";

const groups = ref([]);
const showModal = ref(false);
const showModifierModal = ref(false);
const editing = ref(null);
const activeGroup = ref(null);
const editingModifier = ref(null);

const form = ref({
  name: "",
  type: "single",
  is_required: false,
});

const modifierForm = ref({
  name: "",
  price: 0,
});

const modalTitle = computed(() => (editing.value ? "Редактировать группу" : "Новая группа"));
const modalSubtitle = computed(() => (editing.value ? "Параметры группы" : "Создайте группу модификаторов"));

const loadGroups = async () => {
  try {
    const response = await api.get("/api/menu/admin/modifier-groups");
    groups.value = response.data.modifier_groups || [];
  } catch (error) {
    console.error("Failed to load groups:", error);
    alert("Ошибка при загрузке групп: " + (error.response?.data?.error || error.message));
  }
};

const openModal = (group = null) => {
  editing.value = group;
  form.value = group ? { name: group.name, type: group.type, is_required: group.is_required } : { name: "", type: "single", is_required: false };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitGroup = async () => {
  try {
    if (editing.value) {
      await api.put(`/api/menu/admin/modifier-groups/${editing.value.id}`, form.value);
    } else {
      await api.post("/api/menu/admin/modifier-groups", form.value);
    }
    showModal.value = false;
    await loadGroups();
  } catch (error) {
    console.error("Failed to save group:", error);
    alert("Ошибка при сохранении группы: " + (error.response?.data?.error || error.message));
  }
};

const deleteGroup = async (group) => {
  if (!confirm(`Удалить группу "${group.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifier-groups/${group.id}`);
    await loadGroups();
  } catch (error) {
    console.error("Failed to delete group:", error);
    alert("Ошибка при удалении группы: " + (error.response?.data?.error || error.message));
  }
};

const openModifierModal = (group) => {
  activeGroup.value = group;
  editingModifier.value = null;
  modifierForm.value = { name: "", price: 0 };
  showModifierModal.value = true;
};

const editModifier = (group, modifier) => {
  activeGroup.value = group;
  editingModifier.value = modifier;
  modifierForm.value = { name: modifier.name, price: modifier.price };
  showModifierModal.value = true;
};

const closeModifierModal = () => {
  showModifierModal.value = false;
};

const submitModifier = async () => {
  if (!activeGroup.value) {
    console.error("activeGroup is not set");
    alert("Ошибка: не выбрана группа модификаторов");
    return;
  }

  try {
    if (editingModifier.value) {
      await api.put(`/api/menu/admin/modifiers/${editingModifier.value.id}`, modifierForm.value);
    } else {
      const url = `/api/menu/admin/modifier-groups/${activeGroup.value.id}/modifiers`;
      await api.post(url, modifierForm.value);
    }
    showModifierModal.value = false;
    await loadGroups();
  } catch (error) {
    console.error("Failed to save modifier:", error);
    alert("Ошибка при сохранении модификатора: " + (error.response?.data?.error || error.message));
  }
};

const deleteModifier = async (modifier) => {
  if (!confirm(`Удалить модификатор "${modifier.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/modifiers/${modifier.id}`);
    await loadGroups();
  } catch (error) {
    console.error("Failed to delete modifier:", error);
    alert("Ошибка при удалении модификатора: " + (error.response?.data?.error || error.message));
  }
};

onMounted(loadGroups);
</script>
