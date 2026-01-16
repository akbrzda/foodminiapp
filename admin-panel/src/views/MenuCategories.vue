<template>
  <div class="space-y-6">
    <section class="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
      <div class="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Город</label>
          <select v-model="cityId" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" @change="loadCategories">
            <option value="">Выберите город</option>
            <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button class="w-full rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white" @click="openModal()">
            + Добавить категорию
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <div
        v-for="category in categories"
        :key="category.id"
        class="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="panel-title text-base font-semibold text-ink">{{ category.name }}</p>
            <p class="text-xs text-ink/60">Порядок: {{ category.sort_order || 0 }}</p>
          </div>
          <div class="flex gap-2">
            <button class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="openModal(category)">✏️</button>
            <button class="rounded-full border border-red-200 px-3 py-1 text-xs uppercase text-red-600" @click="deleteCategory(category)">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </section>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitCategory">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Название</label>
          <input v-model="form.name" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Описание</label>
          <textarea v-model="form.description" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" rows="3" />
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="text-xs uppercase tracking-widest text-ink/60">Порядок</label>
            <input v-model.number="form.sort_order" type="number" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-widest text-ink/60">Статус</label>
            <select v-model="form.is_active" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </select>
          </div>
        </div>
        <button class="w-full rounded-2xl bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-ink">
          Сохранить
        </button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import BaseModal from "../components/BaseModal.vue";

const referenceStore = useReferenceStore();
const cityId = ref("");
const categories = ref([]);
const showModal = ref(false);
const editing = ref(null);
const form = ref({
  name: "",
  description: "",
  sort_order: 0,
  is_active: true,
});

const modalTitle = computed(() => (editing.value ? "Редактировать категорию" : "Новая категория"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры категории" : "Создайте категорию меню"));

const loadCategories = async () => {
  if (!cityId.value) {
    categories.value = [];
    return;
  }
  const response = await api.get("/api/menu/admin/categories", { params: { city_id: cityId.value } });
  categories.value = response.data.categories || [];
};

const openModal = (category = null) => {
  if (!cityId.value) {
    alert("Сначала выберите город");
    return;
  }
  editing.value = category;
  form.value = category
    ? {
        name: category.name,
        description: category.description || "",
        sort_order: category.sort_order || 0,
        is_active: category.is_active,
      }
    : { name: "", description: "", sort_order: 0, is_active: true };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitCategory = async () => {
  if (!cityId.value) return;
  if (editing.value) {
    await api.put(`/api/menu/admin/categories/${editing.value.id}`, form.value);
  } else {
    await api.post("/api/menu/admin/categories", { ...form.value, city_id: cityId.value });
  }
  showModal.value = false;
  await loadCategories();
};

const deleteCategory = async (category) => {
  if (!confirm(`Удалить категорию "${category.name}"?`)) return;
  await api.delete(`/api/menu/admin/categories/${category.id}`);
  await loadCategories();
};

onMounted(async () => {
  await referenceStore.loadCities();
});
</script>
