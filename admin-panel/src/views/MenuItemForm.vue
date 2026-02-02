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
            <Button @click="saveAll" :disabled="saving">
              <Save :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger v-for="(tab, index) in tabLabels" :key="tab" :value="index">{{ tab }}</TabsTrigger>
      </TabsList>
      <TabsContent :value="0" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Основная информация</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название *</FieldLabel>
                <FieldContent>
                  <Input v-model="form.name" required />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Описание</FieldLabel>
                <FieldContent>
                  <Textarea v-model="form.description" rows="3" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Состав</FieldLabel>
                <FieldContent>
                  <Textarea v-model="form.composition" rows="2" placeholder="Например: тесто, томаты, моцарелла" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение</FieldLabel>
                <FieldContent>
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
                </FieldContent>
              </Field>
              <FieldGroup class="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес *</FieldLabel>
                  <FieldContent>
                    <Input v-model.number="form.weight_value" type="number" step="0.01" required />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</FieldLabel>
                  <FieldContent>
                    <Select v-model="form.weight_unit">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Выберите единицу" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g">г (граммы)</SelectItem>
                        <SelectItem value="kg">кг (килограммы)</SelectItem>
                        <SelectItem value="ml">мл (миллилитры)</SelectItem>
                        <SelectItem value="l">л (литры)</SelectItem>
                        <SelectItem value="pcs">шт (штуки)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldGroup>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">КБЖУ на 100{{ form.weight_unit === "ml" || form.weight_unit === "l" ? "мл" : "г" }}</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="grid gap-4 md:grid-cols-4">
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Калории (ккал)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.calories_per_100g" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Белки (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.proteins_per_100g" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Жиры (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.fats_per_100g" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Углеводы (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.carbs_per_100g" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">КБЖУ на порцию</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup class="grid gap-4 md:grid-cols-4">
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Калории (ккал)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.calories_per_serving" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Белки (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.proteins_per_serving" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Жиры (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.fats_per_serving" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel class="text-xs text-muted-foreground">Углеводы (г)</FieldLabel>
                    <FieldContent>
                      <Input v-model.number="form.carbs_per_serving" type="number" step="0.01" />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</FieldLabel>
                <FieldContent>
                  <Input v-model.number="form.sort_order" type="number" placeholder="0 = автоматически" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="form.is_active">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Активна</SelectItem>
                      <SelectItem :value="false">Скрыта</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
            <Card>
              <CardHeader>
                <CardTitle class="text-base">Категории</CardTitle>
                <CardDescription>Выберите одну или несколько категорий</CardDescription>
              </CardHeader>
              <CardContent>
                <div class="grid gap-2 md:grid-cols-2">
                  <Label v-for="category in allCategories" :key="category.id" class="flex items-center gap-2 text-sm text-foreground">
                    <input
                      v-model="form.category_ids"
                      type="checkbox"
                      :value="category.id"
                      class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    {{ category.name }}
                  </Label>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent :value="1" class="space-y-4">
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
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название *</FieldLabel>
                <FieldContent>
                  <Input v-model="variant.name" placeholder="Например: 23 см" required />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Базовая цена *</FieldLabel>
                <FieldContent>
                  <Input v-model.number="variant.price" type="number" step="0.01" required />
                </FieldContent>
              </Field>
            </FieldGroup>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Вес *</FieldLabel>
                <FieldContent>
                  <Input v-model.number="variant.weight_value" type="number" step="0.01" required />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Единица</FieldLabel>
                <FieldContent>
                  <Select v-model="variant.weight_unit">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Единица" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">г</SelectItem>
                      <SelectItem value="kg">кг</SelectItem>
                      <SelectItem value="ml">мл</SelectItem>
                      <SelectItem value="l">л</SelectItem>
                      <SelectItem value="pcs">шт</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">КБЖУ на 100г</FieldLabel>
              <FieldContent>
                <div class="grid gap-4 md:grid-cols-4">
                  <Input v-model.number="variant.calories_per_100g" type="number" step="0.01" placeholder="Ккал" />
                  <Input v-model.number="variant.proteins_per_100g" type="number" step="0.01" placeholder="Белки" />
                  <Input v-model.number="variant.fats_per_100g" type="number" step="0.01" placeholder="Жиры" />
                  <Input v-model.number="variant.carbs_per_100g" type="number" step="0.01" placeholder="Углеводы" />
                </div>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">КБЖУ на порцию</FieldLabel>
              <FieldContent>
                <div class="grid gap-4 md:grid-cols-4">
                  <Input v-model.number="variant.calories_per_serving" type="number" step="0.01" placeholder="Ккал" />
                  <Input v-model.number="variant.proteins_per_serving" type="number" step="0.01" placeholder="Белки" />
                  <Input v-model.number="variant.fats_per_serving" type="number" step="0.01" placeholder="Жиры" />
                  <Input v-model.number="variant.carbs_per_serving" type="number" step="0.01" placeholder="Углеводы" />
                </div>
              </FieldContent>
            </Field>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent :value="2" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Модификаторы</CardTitle>
            <CardDescription>Привязка групп модификаторов к позиции</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="group in modifierGroups" :key="group.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.modifier_group_ids"
                  type="checkbox"
                  :value="group.id"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ group.name }}
              </Label>
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
                <Label v-for="modifier in group.modifiers" :key="modifier.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input
                    v-model="form.disabled_modifier_ids"
                    type="checkbox"
                    :value="modifier.id"
                    class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  {{ modifier.name }} <span class="text-xs text-muted-foreground">· отключить</span>
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent :value="3" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Доступность по городам</CardTitle>
            <CardDescription>В каких городах отображается позиция</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.city_ids"
                  type="checkbox"
                  :value="city.id"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ city.name }}
              </Label>
            </div>
          </CardContent>
        </Card>
        <Card v-if="isEditing">
          <CardHeader>
            <CardTitle class="text-base">Цены</CardTitle>
            <CardDescription>Установка цен по городам и способам получения</CardDescription>
          </CardHeader>
          <CardContent class="pt-6">
            <div class="space-y-4">
              <div v-for="(priceItem, index) in form.prices" :key="index" class="flex items-end gap-2 p-3 border rounded-lg">
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Город</FieldLabel>
                  <FieldContent>
                    <Select v-model="priceItem.city_id">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Все города" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="null">Все города</SelectItem>
                        <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Способ получения</FieldLabel>
                  <FieldContent>
                    <Select v-model="priceItem.fulfillment_type">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Способ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivery">Доставка</SelectItem>
                        <SelectItem value="pickup">Самовывоз</SelectItem>
                        <SelectItem value="dine_in">В зале</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Цена</FieldLabel>
                  <FieldContent>
                    <Input v-model.number="priceItem.price" type="number" step="0.01" placeholder="0.00" />
                  </FieldContent>
                </Field>
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
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Город</FieldLabel>
                  <FieldContent>
                    <Select v-model="priceItem.city_id">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Все города" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem :value="null">Все города</SelectItem>
                        <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Способ получения</FieldLabel>
                  <FieldContent>
                    <Select v-model="priceItem.fulfillment_type">
                      <SelectTrigger class="w-full">
                        <SelectValue placeholder="Способ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivery">Доставка</SelectItem>
                        <SelectItem value="pickup">Самовывоз</SelectItem>
                        <SelectItem value="dine_in">В зале</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
                <Field class="flex-1">
                  <FieldLabel class="text-xs text-muted-foreground">Цена</FieldLabel>
                  <FieldContent>
                    <Input v-model.number="priceItem.price" type="number" step="0.01" placeholder="0.00" />
                  </FieldContent>
                </Field>
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
      </TabsContent>
      <TabsContent :value="4" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Теги</CardTitle>
            <CardDescription>Добавление тегов к позиции (острое, новинка и т.д.)</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="tag in tags" :key="tag.id" class="flex items-center gap-2 text-sm text-foreground">
                <input v-model="form.tag_ids" type="checkbox" :value="tag.id" class="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <Badge :style="`background-color: ${tag.color_hex}`">{{ tag.name }}</Badge>
              </Label>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ArrowLeft, Plus, Save, Trash2, UploadCloud } from "lucide-vue-next";
import api from "../api/client.js";
import Badge from "../components/ui/badge/Badge.vue";
import Button from "../components/ui/button/Button.vue";
import Card from "../components/ui/card/Card.vue";
import CardContent from "../components/ui/card/CardContent.vue";
import CardDescription from "../components/ui/card/CardDescription.vue";
import CardHeader from "../components/ui/card/CardHeader.vue";
import CardTitle from "../components/ui/card/CardTitle.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "../components/ui/field";
import Input from "../components/ui/input/Input.vue";
import Label from "../components/ui/label/Label.vue";
import PageHeader from "../components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import Table from "../components/ui/table/Table.vue";
import TableBody from "../components/ui/table/TableBody.vue";
import TableCell from "../components/ui/table/TableCell.vue";
import TableHead from "../components/ui/table/TableHead.vue";
import TableHeader from "../components/ui/table/TableHeader.vue";
import TableRow from "../components/ui/table/TableRow.vue";
import Textarea from "../components/ui/textarea/Textarea.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
const breadcrumbTitle = computed(() => {
  const name = String(form.value.name || "").trim();
  if (!isEditing.value && !name) return "Новая позиция";
  return name || "Позиция меню";
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const updateBreadcrumbs = () => {
  ordersStore.setBreadcrumbs([{ label: "Позиции", to: "/menu/items" }, { label: breadcrumbTitle.value }], route.name);
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
    modifierGroups.value = response.data.modifier_groups || response.data.groups || [];
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
    return savedItemId;
  } catch (error) {
    console.error("Failed to save item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
    return null;
  }
};
const saveVariants = async (savedItemId) => {
  await api.put(`/api/menu/admin/items/${savedItemId}/variants`, { variants: form.value.variants });
};
const saveModifiers = async (savedItemId) => {
  await api.put(`/api/menu/admin/items/${savedItemId}/modifiers`, { modifier_group_ids: form.value.modifier_group_ids });
  await saveDisabledModifiers(savedItemId);
};
const saveDisabledModifiers = async (savedItemId) => {
  const selectedGroups = modifierGroups.value.filter((group) => form.value.modifier_group_ids.includes(group.id));
  const allModifierIds = selectedGroups.flatMap((group) => group.modifiers?.map((modifier) => modifier.id) || []);
  const disabledIds = new Set(form.value.disabled_modifier_ids);
  for (const modifierId of allModifierIds) {
    if (disabledIds.has(modifierId)) {
      await api.post(`/api/menu/admin/items/${savedItemId}/disabled-modifiers`, { modifier_id: modifierId });
    } else {
      await api.delete(`/api/menu/admin/items/${savedItemId}/disabled-modifiers/${modifierId}`);
    }
  }
};
const saveCities = async (savedItemId) => {
  await api.put(`/api/menu/admin/items/${savedItemId}/cities`, { city_ids: form.value.city_ids });
};
const saveTags = async (savedItemId) => {
  await api.put(`/api/menu/admin/items/${savedItemId}/tags`, { tag_ids: form.value.tag_ids });
};
const savePrices = async (savedItemId) => {
  for (const priceItem of form.value.prices) {
    await api.post(`/api/menu/admin/items/${savedItemId}/prices`, {
      city_id: priceItem.city_id,
      fulfillment_type: priceItem.fulfillment_type,
      price: priceItem.price,
    });
  }
};
const saveVariantPrices = async () => {
  for (const variant of form.value.variants) {
    if (!variant.id) continue;
    if (!Array.isArray(variant.prices)) continue;
    const cleanedPrices = variant.prices.filter(
      (priceItem) => priceItem && priceItem.fulfillment_type && priceItem.price !== null && priceItem.price !== undefined && priceItem.price !== "",
    );
    await api.put(`/api/menu/admin/variants/${variant.id}/prices`, { prices: cleanedPrices });
  }
};
const saveAll = async () => {
  saving.value = true;
  try {
    const savedItemId = await saveItem();
    if (!savedItemId) return;
    await saveVariants(savedItemId);
    await saveModifiers(savedItemId);
    await saveCities(savedItemId);
    await savePrices(savedItemId);
    await saveVariantPrices();
    await saveTags(savedItemId);
    showSuccessNotification("Позиция сохранена");
  } catch (error) {
    console.error("Failed to save all item data:", error);
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
    updateBreadcrumbs();
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
watch(
  () => [breadcrumbTitle.value, isEditing.value],
  () => {
    updateBreadcrumbs();
  },
  { immediate: true },
);
</script>
