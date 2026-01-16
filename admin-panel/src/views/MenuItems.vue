<template>
  <div class="space-y-6">
    <section class="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Город</label>
          <select v-model="cityId" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" @change="loadCategories">
            <option value="">Выберите город</option>
            <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Категория</label>
          <select v-model="categoryId" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" @change="loadItems">
            <option value="">Выберите категорию</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button class="w-full rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white" @click="openModal()">
            + Добавить позицию
          </button>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <div v-for="item in items" :key="item.id" class="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="panel-title text-base font-semibold text-ink">{{ item.name }}</p>
            <p class="text-xs text-ink/60">{{ item.description || "Без описания" }}</p>
          </div>
          <img
            v-if="item.image_url"
            :src="normalizeImageUrl(item.image_url)"
            :alt="item.name"
            class="h-12 w-12 rounded-xl object-cover"
          />
          <div class="flex gap-2">
            <button class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="openModal(item)">✏️</button>
            <button class="rounded-full border border-red-200 px-3 py-1 text-xs uppercase text-red-600" @click="deleteItem(item)">
              🗑️
            </button>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-ink/60">
          <span>Цена: {{ formatCurrency(item.price) }}</span>
          <span>{{ item.is_active ? "Активна" : "Скрыта" }}</span>
        </div>
      </div>
    </section>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitItem">
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Название</label>
          <input v-model="form.name" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Описание</label>
          <textarea v-model="form.description" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" rows="3" />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Изображение</label>
          <div
            class="mt-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-white/70 px-4 py-6 text-center text-xs text-ink/60"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
            <button type="button" class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="triggerFile">
              Загрузить (до 500KB)
            </button>
            <span>или перетащите файл сюда</span>
            <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
            <span v-if="uploadState.loading" class="text-xs text-ink/60">Загрузка...</span>
          </div>
          <div v-if="uploadState.preview || form.image_url" class="mt-3 flex items-center gap-3">
            <img :src="normalizeImageUrl(uploadState.preview || form.image_url)" class="h-16 w-16 rounded-2xl object-cover" alt="preview" />
            <input v-model="form.image_url" class="w-full rounded-2xl border border-line bg-white px-3 py-2 text-xs" />
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="text-xs uppercase tracking-widest text-ink/60">Цена (если без вариантов)</label>
            <input v-model.number="form.price" type="number" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs uppercase tracking-widest text-ink/60">Статус</label>
            <select v-model="form.is_active" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
              <option :value="true">Активна</option>
              <option :value="false">Скрыта</option>
            </select>
          </div>
        </div>

        <div class="rounded-2xl border border-line bg-paper p-4">
          <div class="flex items-center justify-between">
            <p class="text-xs uppercase tracking-widest text-ink/60">Варианты позиции</p>
            <button type="button" class="rounded-full border border-ink/10 px-3 py-1 text-xs uppercase" @click="addVariant">
              + Добавить
            </button>
          </div>
          <div class="mt-3 space-y-3">
            <div v-for="(variant, index) in form.variants" :key="index" class="grid gap-3 md:grid-cols-[1.2fr_0.6fr_auto]">
              <input v-model="variant.name" placeholder="Название" class="rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
              <input v-model.number="variant.price" type="number" placeholder="Цена" class="rounded-2xl border border-line bg-white px-3 py-2 text-sm" />
              <button type="button" class="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600" @click="removeVariant(index)">
                Удалить
              </button>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-line bg-paper p-4">
          <p class="text-xs uppercase tracking-widest text-ink/60">Группы модификаторов</p>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            <label v-for="group in modifierGroups" :key="group.id" class="flex items-center gap-2 text-sm">
              <input v-model="form.modifier_group_ids" type="checkbox" :value="group.id" />
              <span>{{ group.name }}</span>
            </label>
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
import { formatCurrency, normalizeImageUrl } from "../utils/format.js";

const referenceStore = useReferenceStore();
const cityId = ref("");
const categoryId = ref("");
const categories = ref([]);
const items = ref([]);
const modifierGroups = ref([]);
const showModal = ref(false);
const editing = ref(null);

const form = ref({
  name: "",
  description: "",
  image_url: "",
  price: 0,
  is_active: true,
  variants: [],
  modifier_group_ids: [],
});

const fileInput = ref(null);
const uploadState = ref({
  loading: false,
  error: "",
  preview: "",
});

const removedVariantIds = ref([]);
const originalGroupIds = ref([]);

const modalTitle = computed(() => (editing.value ? "Редактировать позицию" : "Новая позиция"));
const modalSubtitle = computed(() => (editing.value ? "Обновите параметры позиции" : "Создайте позицию меню"));

const loadCategories = async () => {
  if (!cityId.value) {
    categories.value = [];
    categoryId.value = "";
    items.value = [];
    return;
  }
  const response = await api.get("/api/menu/admin/categories", { params: { city_id: cityId.value } });
  categories.value = response.data.categories || [];
  categoryId.value = "";
  items.value = [];
};

const loadItems = async () => {
  if (!categoryId.value) {
    items.value = [];
    return;
  }
  const response = await api.get(`/api/menu/admin/categories/${categoryId.value}/items`);
  items.value = response.data.items || [];
};

const loadModifierGroups = async () => {
  const response = await api.get("/api/menu/admin/modifier-groups");
  modifierGroups.value = response.data.modifier_groups || [];
};

const openModal = async (item = null) => {
  if (!categoryId.value && !item) {
    alert("Сначала выберите категорию");
    return;
  }
  editing.value = item;
  removedVariantIds.value = [];
  originalGroupIds.value = [];
  form.value = item
    ? {
        name: item.name,
        description: item.description || "",
        image_url: item.image_url || "",
        price: item.price || 0,
        is_active: item.is_active,
        variants: [],
        modifier_group_ids: [],
      }
    : {
        name: "",
        description: "",
        image_url: "",
        price: 0,
        is_active: true,
        variants: [],
        modifier_group_ids: [],
      };

  uploadState.value = {
    loading: false,
    error: "",
    preview: item?.image_url || "",
  };

  if (item?.id) {
    const [variantsResponse, groupsResponse] = await Promise.all([
      api.get(`/api/menu/admin/items/${item.id}/variants`),
      api.get(`/api/menu/admin/items/${item.id}/modifier-groups`),
    ]);
    form.value.variants = variantsResponse.data.variants || [];
    form.value.modifier_group_ids = (groupsResponse.data.modifier_groups || []).map((group) => group.id);
    originalGroupIds.value = [...form.value.modifier_group_ids];
  }

  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const addVariant = () => {
  form.value.variants.push({ name: "", price: 0 });
};

const triggerFile = () => {
  fileInput.value?.click();
};

const onFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    handleFile(file);
  }
};

const onDrop = (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) {
    handleFile(file);
  }
};

const handleFile = async (file) => {
  uploadState.value.error = "";

  if (!file.type.startsWith("image/")) {
    uploadState.value.error = "Нужен файл изображения";
    return;
  }

  if (file.size > 500 * 1024) {
    uploadState.value.error = "Файл больше 500KB";
    return;
  }

  uploadState.value.loading = true;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      uploadState.value.preview = reader.result;
      const response = await api.post("/api/admin/uploads/images", {
        data: reader.result,
        filename: file.name,
      });
      form.value.image_url = response.data.file?.url || form.value.image_url;
    } catch (error) {
      uploadState.value.error = error.response?.data?.error || "Не удалось загрузить";
    } finally {
      uploadState.value.loading = false;
    }
  };
  reader.readAsDataURL(file);
};

const removeVariant = (index) => {
  const [removed] = form.value.variants.splice(index, 1);
  if (removed?.id) {
    removedVariantIds.value.push(removed.id);
  }
};

const submitItem = async () => {
  if (!categoryId.value) return;
  const payload = { ...form.value, category_id: categoryId.value };

  if (editing.value) {
    await api.put(`/api/menu/admin/items/${editing.value.id}`, payload);

    for (const variant of form.value.variants) {
      if (variant.id) {
        await api.put(`/api/menu/admin/variants/${variant.id}`, {
          name: variant.name,
          price: variant.price,
          sort_order: variant.sort_order || 0,
        });
      } else if (variant.name) {
        await api.post(`/api/menu/admin/items/${editing.value.id}/variants`, {
          name: variant.name,
          price: variant.price,
          sort_order: variant.sort_order || 0,
        });
      }
    }

    for (const variantId of removedVariantIds.value) {
      await api.delete(`/api/menu/admin/variants/${variantId}`);
    }

    const addedGroups = form.value.modifier_group_ids.filter((id) => !originalGroupIds.value.includes(id));
    const removedGroups = originalGroupIds.value.filter((id) => !form.value.modifier_group_ids.includes(id));

    for (const groupId of addedGroups) {
      await api.post(`/api/menu/admin/items/${editing.value.id}/modifier-groups`, { modifier_group_id: groupId });
    }

    for (const groupId of removedGroups) {
      await api.delete(`/api/menu/admin/items/${editing.value.id}/modifier-groups/${groupId}`);
    }
  } else {
    await api.post("/api/menu/admin/items", payload);
  }

  showModal.value = false;
  await loadItems();
};

const deleteItem = async (item) => {
  if (!confirm(`Удалить позицию "${item.name}"?`)) return;
  await api.delete(`/api/menu/admin/items/${item.id}`);
  await loadItems();
};

onMounted(async () => {
  await referenceStore.loadCities();
  await loadModifierGroups();
});
</script>
