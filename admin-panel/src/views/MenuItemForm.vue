<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="modalTitle" :description="modalSubtitle">
          <template #actions>
            <Button variant="outline" @click="goBack">
              <ArrowLeft :size="16" />
              Назад к списку
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Tabs :tabs="tabLabels" v-model="activeTab">
      <div v-show="activeTab === 0" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Основная информация</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название *</label>
              <Input v-model="form.name" required />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</label>
              <Textarea v-model="form.description" rows="3" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Состав</label>
              <Textarea v-model="form.composition" rows="2" placeholder="Например: тесто, томаты, моцарелла" />
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</label>
              <div
                class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
                @dragover.prevent
                @drop.prevent="onDrop"
              >
                <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
                <Button type="button" variant="outline" size="sm" @click="triggerFile">
                  <UploadCloud :size="16" />
                  Загрузить (до 500KB)
                </Button>
                <span>или перетащите файл сюда</span>
                <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
                <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
              </div>
              <div v-if="uploadState.preview || form.image_url" class="mt-3 flex items-center gap-3">
                <img :src="normalizeImageUrl(uploadState.preview || form.image_url)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
                <Input v-model="form.image_url" class="text-xs" />
              </div>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес *</label>
                <Input v-model.number="form.weight_value" type="number" step="0.01" required />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</label>
                <Select v-model="form.weight_unit">
                  <option value="g">г (граммы)</option>
                  <option value="kg">кг (килограммы)</option>
                  <option value="ml">мл (миллилитры)</option>
                  <option value="l">л (литры)</option>
                  <option value="pcs">шт (штуки)</option>
                </Select>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">КБЖУ на 100{{ form.weight_unit === "ml" || form.weight_unit === "l" ? "мл" : "г" }}</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="grid gap-4 md:grid-cols-4">
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Калории (ккал)</label>
                    <Input v-model.number="form.calories_per_100g" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Белки (г)</label>
                    <Input v-model.number="form.proteins_per_100g" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Жиры (г)</label>
                    <Input v-model.number="form.fats_per_100g" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Углеводы (г)</label>
                    <Input v-model.number="form.carbs_per_100g" type="number" step="0.01" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">КБЖУ на порцию</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="grid gap-4 md:grid-cols-4">
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Калории (ккал)</label>
                    <Input v-model.number="form.calories_per_serving" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Белки (г)</label>
                    <Input v-model.number="form.proteins_per_serving" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Жиры (г)</label>
                    <Input v-model.number="form.fats_per_serving" type="number" step="0.01" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs text-muted-foreground">Углеводы (г)</label>
                    <Input v-model.number="form.carbs_per_serving" type="number" step="0.01" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
                <Input v-model.number="form.sort_order" type="number" placeholder="0 = автоматически" />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
                <Select v-model="form.is_active">
                  <option :value="true">Активна</option>
                  <option :value="false">Скрыта</option>
                </Select>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">Категории</CardTitle>
                <CardDescription>Выберите одну или несколько категорий</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="grid gap-2 md:grid-cols-2">
                  <label v-for="category in allCategories" :key="category.id" class="flex items-center gap-2 text-sm text-foreground">
                    <input
                      v-model="form.category_ids"
                      type="checkbox"
                      :value="category.id"
                      class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    {{ category.name }}
                  </label>
                </div>
              </CardContent>
            </Card>
            <Button class="w-full" @click="saveItem" :disabled="saving">
              <Save :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div v-show="activeTab === 1" class="space-y-4">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between">
            <div>
              <CardTitle class="text-base">Вариации блюда</CardTitle>
              <CardDescription>Размеры, порции и их параметры</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" @click="addVariant">
              <Plus :size="16" />
              Добавить
            </Button>
          </CardHeader>
          <CardContent>
            <div v-if="form.variants.length === 0" class="py-8 text-center text-sm text-muted-foreground">Вариации не добавлены</div>
          </CardContent>
        </Card>
        <Card v-for="(variant, index) in form.variants" :key="index">
          <CardHeader class="flex flex-row items-center justify-between">
            <CardTitle class="text-base">{{ variant.name || `Вариация ${index + 1}` }}</CardTitle>
            <Button type="button" variant="ghost" size="icon" @click="removeVariant(index)">
              <Trash2 :size="16" class="text-red-600" />
            </Button>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название *</label>
                <Input v-model="variant.name" placeholder="Например: 23 см" required />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Базовая цена *</label>
                <Input v-model.number="variant.price" type="number" step="0.01" required />
              </div>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес *</label>
                <Input v-model.number="variant.weight_value" type="number" step="0.01" required />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</label>
                <Select v-model="variant.weight_unit">
                  <option value="g">г</option>
                  <option value="kg">кг</option>
                  <option value="ml">мл</option>
                  <option value="l">л</option>
                  <option value="pcs">шт</option>
                </Select>
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">КБЖУ на 100г</label>
              <div class="grid gap-4 md:grid-cols-4">
                <Input v-model.number="variant.calories_per_100g" type="number" step="0.01" placeholder="Ккал" />
                <Input v-model.number="variant.proteins_per_100g" type="number" step="0.01" placeholder="Белки" />
                <Input v-model.number="variant.fats_per_100g" type="number" step="0.01" placeholder="Жиры" />
                <Input v-model.number="variant.carbs_per_100g" type="number" step="0.01" placeholder="Углеводы" />
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">КБЖУ на порцию</label>
              <div class="grid gap-4 md:grid-cols-4">
                <Input v-model.number="variant.calories_per_serving" type="number" step="0.01" placeholder="Ккал" />
                <Input v-model.number="variant.proteins_per_serving" type="number" step="0.01" placeholder="Белки" />
                <Input v-model.number="variant.fats_per_serving" type="number" step="0.01" placeholder="Жиры" />
                <Input v-model.number="variant.carbs_per_serving" type="number" step="0.01" placeholder="Углеводы" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Button v-if="form.variants.length > 0" class="w-full" @click="saveVariants" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить вариации" }}
        </Button>
      </div>
      <div v-show="activeTab === 2" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Модификаторы</CardTitle>
            <CardDescription>Привязка групп модификаторов к позиции</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <label v-for="group in modifierGroups" :key="group.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.modifier_group_ids"
                  type="checkbox"
                  :value="group.id"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ group.name }}
              </label>
            </div>
          </CardContent>
        </Card>
        <Card v-if="selectedModifierGroups.length > 0">
          <CardHeader>
            <CardTitle class="text-base">Отключение модификаторов</CardTitle>
            <CardDescription>Можно скрыть отдельные модификаторы из выбранных групп</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div v-for="group in selectedModifierGroups" :key="group.id" class="space-y-2">
              <div class="text-sm font-semibold text-foreground">{{ group.name }}</div>
              <div class="grid gap-2 md:grid-cols-2">
                <label v-for="modifier in group.modifiers" :key="modifier.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input
                    v-model="form.disabled_modifier_ids"
                    type="checkbox"
                    :value="modifier.id"
                    class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  {{ modifier.name }} <span class="text-xs text-muted-foreground">· отключить</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button class="w-full" @click="saveModifiers" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить модификаторы" }}
        </Button>
      </div>
      <div v-show="activeTab === 3" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Доступность по городам</CardTitle>
            <CardDescription>В каких городах отображается позиция</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.city_ids"
                  type="checkbox"
                  :value="city.id"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ city.name }}
              </label>
            </div>
          </CardContent>
        </Card>
        <Button class="w-full" @click="saveCities" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить доступность" }}
        </Button>
        <Card v-if="isEditing">
          <CardHeader>
            <CardTitle class="text-base">Цены</CardTitle>
            <CardDescription>Установка цен по городам и способам получения</CardDescription>
          </CardHeader>
          <CardContent class="pt-6">
            <div class="space-y-4">
              <div v-for="(priceItem, index) in form.prices" :key="index" class="flex items-end gap-2 p-3 border rounded-lg">
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Город</label>
                  <Select v-model="priceItem.city_id">
                    <option :value="null">Все города</option>
                    <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
                  </Select>
                </div>
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Способ получения</label>
                  <Select v-model="priceItem.fulfillment_type">
                    <option value="delivery">Доставка</option>
                    <option value="pickup">Самовывоз</option>
                    <option value="dine_in">В зале</option>
                  </Select>
                </div>
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Цена</label>
                  <Input v-model.number="priceItem.price" type="number" step="0.01" placeholder="0.00" />
                </div>
                <Button variant="ghost" size="icon" @click="form.prices.splice(index, 1)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
              <Button variant="outline" class="w-full" @click="addPrice">
                <Plus :size="16" />
                Добавить цену
              </Button>
            </div>
          </CardContent>
        </Card>
        <Button v-if="isEditing" class="w-full" @click="savePrices" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить цены" }}
        </Button>
        <Card v-if="isEditing && form.variants.length > 0">
          <CardHeader>
            <CardTitle class="text-base">Цены вариаций</CardTitle>
            <CardDescription>Укажите цены для каждой вариации по городам и способам получения</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div v-for="(variant, variantIndex) in form.variants" :key="variant.id || variantIndex" class="space-y-4">
              <div class="text-sm font-semibold text-foreground">
                {{ variant.name || `Вариация ${variantIndex + 1}` }}
              </div>
              <div v-if="!variant.prices || variant.prices.length === 0" class="text-xs text-muted-foreground">Цены не заданы</div>
              <div v-for="(priceItem, index) in variant.prices" :key="index" class="flex items-end gap-2 p-3 border rounded-lg">
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Город</label>
                  <Select v-model="priceItem.city_id">
                    <option :value="null">Все города</option>
                    <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
                  </Select>
                </div>
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Способ получения</label>
                  <Select v-model="priceItem.fulfillment_type">
                    <option value="delivery">Доставка</option>
                    <option value="pickup">Самовывоз</option>
                    <option value="dine_in">В зале</option>
                  </Select>
                </div>
                <div class="flex-1 space-y-2">
                  <label class="text-xs text-muted-foreground">Цена</label>
                  <Input v-model.number="priceItem.price" type="number" step="0.01" placeholder="0.00" />
                </div>
                <Button variant="ghost" size="icon" @click="variant.prices.splice(index, 1)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
              <Button variant="outline" class="w-full" @click="addVariantPrice(variant)">
                <Plus :size="16" />
                Добавить цену вариации
              </Button>
            </div>
          </CardContent>
        </Card>
        <Button v-if="isEditing && form.variants.length > 0" class="w-full" @click="saveVariantPrices" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить цены вариаций" }}
        </Button>
      </div>
      <div v-show="activeTab === 4" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Теги</CardTitle>
            <CardDescription>Добавление тегов к позиции (острое, новинка и т.д.)</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <label v-for="tag in tags" :key="tag.id" class="flex items-center gap-2 text-sm text-foreground">
                <input v-model="form.tag_ids" type="checkbox" :value="tag.id" class="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <Badge :style="`background-color: ${tag.color_hex}`">{{ tag.name }}</Badge>
              </label>
            </div>
          </CardContent>
        </Card>
        <Button class="w-full" @click="saveTags" :disabled="saving">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Сохранить теги" }}
        </Button>
      </div>
    </Tabs>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ArrowLeft, Plus, Save, Trash2, UploadCloud } from "lucide-vue-next";
import api from "../api/client.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import PageHeader from "../components/PageHeader.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import Textarea from "../components/ui/Textarea.vue";
import Tabs from "../components/ui/Tabs.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { useReferenceStore } from "../stores/reference.js";
import { useOrdersStore } from "../stores/orders.js";
const router = useRouter();
const route = useRoute();
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const allCategories = ref([]);
const modifierGroups = ref([]);
const tags = ref([]);
const saving = ref(false);
const activeTab = ref(0);
const fileInput = ref(null);
const uploadState = ref({ loading: false, error: null, preview: null });
const tabLabels = ["Основное", "Вариации", "Модификаторы", "Доступность и цены", "Теги"];
const itemId = computed(() => route.params.id);
const isEditing = computed(() => !!itemId.value && itemId.value !== "new");
const form = ref({
  name: "",
  description: "",
  composition: "",
  image_url: "",
  weight_value: null,
  weight_unit: "g",
  calories_per_100g: null,
  proteins_per_100g: null,
  fats_per_100g: null,
  carbs_per_100g: null,
  calories_per_serving: null,
  proteins_per_serving: null,
  fats_per_serving: null,
  carbs_per_serving: null,
  sort_order: 0,
  is_active: true,
  category_ids: [],
  variants: [],
  modifier_group_ids: [],
  disabled_modifier_ids: [],
  city_ids: [],
  tag_ids: [],
  prices: [],
});
const modalTitle = computed(() => (isEditing.value ? "Редактировать позицию" : "Новая позиция"));
const modalSubtitle = computed(() => (isEditing.value ? "Измените параметры позиции" : "Создайте позицию меню"));
const formTitle = computed(() => {
  if (!isEditing.value) return "Новая позиция";
  const name = String(form.value.name || "").trim();
  return name ? `Позиция: ${name}` : "Позиция меню";
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const normalizeIsActive = (value, fallback = true) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return Boolean(value);
};
const normalizeImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env.VITE_UPLOADS_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
};
const goBack = () => {
  router.push({ name: "menu-items" });
};
const loadCategories = async () => {
  try {
    const response = await api.get("/api/menu/admin/all-categories");
    allCategories.value = response.data.categories || [];
  } catch (error) {
    console.error("Failed to load categories:", error);
  }
};
const loadModifierGroups = async () => {
  try {
    const response = await api.get("/api/menu/admin/modifier-groups");
    modifierGroups.value = response.data.groups || [];
  } catch (error) {
    console.error("Failed to load modifier groups:", error);
  }
};
const loadTags = async () => {
  try {
    const response = await api.get("/api/menu/admin/tags");
    tags.value = response.data.tags || [];
  } catch (error) {
    console.error("Failed to load tags:", error);
  }
};
const loadItem = async () => {
  if (!isEditing.value) return;
  try {
    const [itemRes, categoriesRes, variantsRes, modifiersRes, citiesRes, tagsRes, pricesRes, disabledModsRes] = await Promise.all([
      api.get(`/api/menu/admin/items/${itemId.value}`),
      api.get(`/api/menu/admin/items/${itemId.value}/categories`),
      api.get(`/api/menu/admin/items/${itemId.value}/variants`),
      api.get(`/api/menu/admin/items/${itemId.value}/modifiers`),
      api.get(`/api/menu/admin/items/${itemId.value}/cities`),
      api.get(`/api/menu/admin/items/${itemId.value}/tags`),
      api.get(`/api/menu/admin/items/${itemId.value}/prices`),
      api.get(`/api/menu/admin/items/${itemId.value}/disabled-modifiers`),
    ]);
    const item = itemRes.data.item;
    const variants = variantsRes.data.variants || [];
    const variantPricesResponses = await Promise.all(
      variants.map((variant) =>
        api
          .get(`/api/menu/admin/variants/${variant.id}/prices`)
          .then((response) => response.data.prices || [])
          .catch((error) => {
            console.error("Failed to load variant prices:", error);
            return [];
          }),
      ),
    );
    const variantsWithPrices = variants.map((variant, index) => ({
      ...variant,
      prices: variantPricesResponses[index] || [],
    }));
    form.value = {
      name: item.name,
      description: item.description || "",
      composition: item.composition || "",
      image_url: item.image_url || "",
      weight_value: item.weight_value,
      weight_unit: item.weight_unit || "g",
      calories_per_100g: item.calories_per_100g,
      proteins_per_100g: item.proteins_per_100g,
      fats_per_100g: item.fats_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      calories_per_serving: item.calories_per_serving,
      proteins_per_serving: item.proteins_per_serving,
      fats_per_serving: item.fats_per_serving,
      carbs_per_serving: item.carbs_per_serving,
      sort_order: item.sort_order || 0,
      is_active: normalizeIsActive(item.is_active),
      category_ids: categoriesRes.data.category_ids || [],
      variants: variantsWithPrices,
      modifier_group_ids: modifiersRes.data.modifier_group_ids || [],
      disabled_modifier_ids: (disabledModsRes.data.modifiers || []).map((modifier) => modifier.id),
      city_ids: citiesRes.data.city_ids || [],
      tag_ids: tagsRes.data.tag_ids || [],
      prices: pricesRes.data.prices || [],
    };
  } catch (error) {
    console.error("Failed to load item:", error);
    showErrorNotification("Ошибка при загрузке позиции");
    goBack();
  }
};
const saveItem = async () => {
  saving.value = true;
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      composition: form.value.composition,
      image_url: form.value.image_url,
      weight_value: form.value.weight_value,
      weight_unit: form.value.weight_unit,
      calories_per_100g: form.value.calories_per_100g,
      proteins_per_100g: form.value.proteins_per_100g,
      fats_per_100g: form.value.fats_per_100g,
      carbs_per_100g: form.value.carbs_per_100g,
      calories_per_serving: form.value.calories_per_serving,
      proteins_per_serving: form.value.proteins_per_serving,
      fats_per_serving: form.value.fats_per_serving,
      carbs_per_serving: form.value.carbs_per_serving,
      sort_order: form.value.sort_order,
      is_active: form.value.is_active,
    };
    let savedItemId;
    if (isEditing.value) {
      await api.put(`/api/menu/admin/items/${itemId.value}`, payload);
      savedItemId = itemId.value;
    } else {
      const res = await api.post("/api/menu/admin/items", payload);
      savedItemId = res.data.item.id;
      router.replace({ name: "menu-item-form", params: { id: savedItemId } });
    }
    await api.put(`/api/menu/admin/items/${savedItemId}/categories`, { category_ids: form.value.category_ids });
    showSuccessNotification("Основная информация сохранена");
  } catch (error) {
    console.error("Failed to save item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const saveVariants = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию (Таб 1)");
    return;
  }
  saving.value = true;
  try {
    await api.put(`/api/menu/admin/items/${itemId.value}/variants`, { variants: form.value.variants });
    showSuccessNotification("Вариации сохранены");
  } catch (error) {
    console.error("Failed to save variants:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const saveModifiers = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию");
    return;
  }
  saving.value = true;
  try {
    await api.put(`/api/menu/admin/items/${itemId.value}/modifiers`, { modifier_group_ids: form.value.modifier_group_ids });
    await saveDisabledModifiers();
    showSuccessNotification("Модификаторы сохранены");
  } catch (error) {
    console.error("Failed to save modifiers:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const saveDisabledModifiers = async () => {
  const selectedGroups = modifierGroups.value.filter((group) => form.value.modifier_group_ids.includes(group.id));
  const allModifierIds = selectedGroups.flatMap((group) => group.modifiers?.map((modifier) => modifier.id) || []);
  const disabledIds = new Set(form.value.disabled_modifier_ids);
  for (const modifierId of allModifierIds) {
    if (disabledIds.has(modifierId)) {
      await api.post(`/api/menu/admin/items/${itemId.value}/disabled-modifiers`, { modifier_id: modifierId });
    } else {
      await api.delete(`/api/menu/admin/items/${itemId.value}/disabled-modifiers/${modifierId}`);
    }
  }
};
const saveCities = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию");
    return;
  }
  saving.value = true;
  try {
    await api.put(`/api/menu/admin/items/${itemId.value}/cities`, { city_ids: form.value.city_ids });
    showSuccessNotification("Доступность сохранена");
  } catch (error) {
    console.error("Failed to save cities:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const saveTags = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию");
    return;
  }
  saving.value = true;
  try {
    await api.put(`/api/menu/admin/items/${itemId.value}/tags`, { tag_ids: form.value.tag_ids });
    showSuccessNotification("Теги сохранены");
  } catch (error) {
    console.error("Failed to save tags:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const savePrices = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию");
    return;
  }
  saving.value = true;
  try {
    for (const priceItem of form.value.prices) {
      await api.post(`/api/menu/admin/items/${itemId.value}/prices`, {
        city_id: priceItem.city_id,
        fulfillment_type: priceItem.fulfillment_type,
        price: priceItem.price,
      });
    }
    showSuccessNotification("Цены сохранены");
  } catch (error) {
    console.error("Failed to save prices:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const saveVariantPrices = async () => {
  if (!isEditing.value) {
    showErrorNotification("Сначала сохраните основную информацию");
    return;
  }
  saving.value = true;
  try {
    for (const variant of form.value.variants) {
      if (!variant.id) continue;
      if (!Array.isArray(variant.prices)) continue;
      const cleanedPrices = variant.prices.filter(
        (priceItem) =>
          priceItem &&
          priceItem.fulfillment_type &&
          priceItem.price !== null &&
          priceItem.price !== undefined &&
          priceItem.price !== "",
      );
      await api.put(`/api/menu/admin/variants/${variant.id}/prices`, { prices: cleanedPrices });
    }
    showSuccessNotification("Цены вариаций сохранены");
  } catch (error) {
    console.error("Failed to save variant prices:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const addPrice = () => {
  form.value.prices.push({
    city_id: null,
    fulfillment_type: "delivery",
    price: 0,
  });
};
const addVariantPrice = (variant) => {
  if (!Array.isArray(variant.prices)) variant.prices = [];
  variant.prices.push({
    city_id: null,
    fulfillment_type: "delivery",
    price: 0,
  });
};
const selectedModifierGroups = computed(() => modifierGroups.value.filter((group) => form.value.modifier_group_ids.includes(group.id)));
const addVariant = () => {
  form.value.variants.push({
    name: "",
    price: 0,
    weight_value: null,
    weight_unit: "g",
    calories_per_100g: null,
    proteins_per_100g: null,
    fats_per_100g: null,
    carbs_per_100g: null,
    calories_per_serving: null,
    proteins_per_serving: null,
    fats_per_serving: null,
    carbs_per_serving: null,
    prices: [],
  });
};
const removeVariant = (index) => {
  form.value.variants.splice(index, 1);
};
const triggerFile = () => {
  fileInput.value?.click();
};
const onFileChange = (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
};
const onDrop = (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
};
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
const handleFile = async (file) => {
  if (file.size > 10 * 1024 * 1024) {
    uploadState.value.error = "Файл больше 10MB";
    return;
  }
  if (!file.type.startsWith("image/")) {
    uploadState.value.error = "Только изображения";
    return;
  }
  uploadState.value = { loading: true, error: null, preview: URL.createObjectURL(file) };
  try {
    const formData = new FormData();
    formData.append("image", file);
    const itemId = route.params.id || "temp";
    const res = await api.post(`/api/uploads/menu-items/${itemId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = res.data?.data?.url || "";
    form.value.image_url = uploadedUrl;
    uploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    console.error("Failed to upload:", error);
    uploadState.value = { loading: false, error: "Ошибка загрузки", preview: null };
  }
};
onMounted(async () => {
  try {
    await Promise.all([referenceStore.fetchCitiesAndBranches(), loadCategories(), loadModifierGroups(), loadTags()]);
    await loadItem();
  } catch (error) {
    console.error("Ошибка инициализации формы позиции:", error);
    showErrorNotification("Ошибка загрузки данных формы");
  }
});
watch(
  () => [formTitle.value, ordersStore.newOrdersCount],
  () => {
    updateDocumentTitle(formTitle.value);
  },
  { immediate: true },
);
</script>
