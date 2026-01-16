<template>
  <div class="space-y-6">
    <section class="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
      <div class="flex items-center justify-between">
        <div>
          <p class="panel-title text-base font-semibold text-ink">Группы модификаторов</p>
          <p class="text-xs text-ink/60">Одиночный и множественный выбор</p>
        </div>
        <button class="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white" @click="openModal()">
          + Добавить группу
        </button>
      </div>
    </section>

    <section class="space-y-4">
      <div v-for="group in groups" :key="group.id" class="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <div>
            <p class="panel-title text-base font-semibold text-ink">{{ group.name }}</p>
            <p class="text-xs text-ink/60">
              {{ group.type === "single" ? "Одиночный" : "Множественный" }} · {{ group.is_required ? "Обязательный" : "Опциональный" }}
            </p>
          </div>
          <div class="flex gap-2">
            <button class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="openModal(group)">✏️</button>
            <button class="rounded-full border border-red-200 px-3 py-1 text-xs uppercase text-red-600" @click="deleteGroup(group)">🗑️</button>
          </div>
        </div>

        <div class="mt-4 space-y-2">
          <div
            v-for="modifier in group.modifiers"
            :key="modifier.id"
            class="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-2 text-sm"
          >
            <div>
              <div class="font-medium">{{ modifier.name }}</div>
              <div class="text-xs text-ink/60">{{ modifier.price }} ₽</div>
            </div>
            <div class="flex gap-2">
              <button class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="editModifier(group, modifier)">✏️</button>
              <button class="rounded-full border border-red-200 px-3 py-1 text-xs uppercase text-red-600" @click="deleteModifier(modifier)">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <button class="mt-3 rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="openModifierModal(group)">
          + Добавить модификатор
        </button>
      </div>
    </section>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitGroup">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Название</label>
          <input v-model="form.name" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Тип</label>
          <select v-model="form.type" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
            <option value="single">Одиночный выбор</option>
            <option value="multiple">Множественный выбор</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.is_required" type="checkbox" />
          Обязательная группа
        </label>
        <button class="w-full rounded-2xl bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink">Сохранить</button>
      </form>
    </BaseModal>

    <BaseModal v-if="showModifierModal" title="Модификатор" subtitle="Добавьте параметр" @close="closeModifierModal">
      <form class="space-y-4" @submit.prevent="submitModifier">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Название</label>
          <input v-model="modifierForm.name" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Цена</label>
          <input v-model.number="modifierForm.price" type="number" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
        </div>
        <button class="w-full rounded-2xl bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink">Сохранить</button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";

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
      console.log("Updating modifier:", editingModifier.value.id, modifierForm.value);
      await api.put(`/api/menu/admin/modifiers/${editingModifier.value.id}`, modifierForm.value);
    } else {
      const url = `/api/menu/admin/modifier-groups/${activeGroup.value.id}/modifiers`;
      console.log("Creating modifier:", url, modifierForm.value);
      await api.post(url, modifierForm.value);
    }
    showModifierModal.value = false;
    await loadGroups();
  } catch (error) {
    console.error("Failed to save modifier:", error);
    console.error("Response data:", error.response?.data);
    console.error("Status:", error.response?.status);
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
