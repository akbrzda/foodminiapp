<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="modalTitle" :description="modalSubtitle">
          <template #actions>
            <Button type="button" variant="outline" @click="goBack">
              <ArrowLeft :size="16" />
              Назад к списку
            </Button>
            <Button type="button" @click="saveAll" :disabled="saving || isInitialLoading">
              <Save :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <div v-if="isInitialLoading" class="space-y-4">
      <Card>
        <CardHeader class="space-y-2">
          <Skeleton class="h-6 w-56" />
          <Skeleton class="h-4 w-72" />
        </CardHeader>
        <CardContent class="space-y-4">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-24 w-full" />
          <div class="grid gap-4 md:grid-cols-3">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton class="h-6 w-64" />
        </CardHeader>
        <CardContent class="space-y-3">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
    <Tabs v-else v-model="activeTab">
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
                      Загрузить (до 10МБ)
                    </Button>
                    <span>или перетащите файл сюда</span>
                    <span v-if="uploadState.error" class="text-xs text-red-600">{{ uploadState.error }}</span>
                    <span v-if="uploadState.loading" class="text-xs text-muted-foreground">Загрузка...</span>
                  </div>
                  <div v-if="uploadState.preview || form.image_url" class="mt-3 flex items-center gap-3">
                    <img :src="normalizeImageUrl(uploadState.preview || form.image_url)" class="h-16 w-16 rounded-xl object-cover" alt="preview" />
                  </div>
                </FieldContent>
              </Field>
              <FieldGroup v-if="!hasVariants" class="grid gap-4 md:grid-cols-3">
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
                <Field>
                  <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Базовая цена *</FieldLabel>
                  <FieldContent>
                    <Input v-model.number="form.price" type="number" step="0.01" required placeholder="0.00" />
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
                      :value="Number(category.id)"
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
        <Card
          v-for="(variant, index) in form.variants"
          :key="variant.id || variant.__local_key || index"
          :draggable="true"
          :class="{ 'variant-dragging': draggedVariantIndex === index, 'variant-drop-target': dragOverVariantIndex === index }"
          @dragstart="onVariantDragStart(index, $event)"
          @dragover.prevent="onVariantDragOver(index)"
          @dragleave="onVariantDragLeave(index)"
          @drop.prevent="onVariantDropCard(index)"
          @dragend="onVariantDragEnd"
        >
          <CardHeader class="flex flex-row items-center justify-between">
            <div class="flex items-center gap-2">
              <GripVertical :size="16" class="cursor-grab text-muted-foreground" />
              <CardTitle class="text-base">{{ variant.name || `Вариация ${index + 1}` }}</CardTitle>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Порядок: {{ variant.sort_order || (index + 1) * 10 }}</span>
              <Button type="button" variant="ghost" size="icon" @click="removeVariant(index)">
                <Trash2 :size="16" class="text-red-600" />
              </Button>
            </div>
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
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображение варианта</FieldLabel>
              <FieldContent>
                <div
                  class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-xs text-muted-foreground"
                  @dragover.prevent
                  @drop.prevent="onVariantDrop(variant, index, $event)"
                >
                  <input :id="`variant-file-${getVariantUploadKey(variant, index)}`" type="file" accept="image/*" class="hidden" @change="onVariantFileChange(variant, index, $event)" />
                  <Button type="button" variant="outline" size="sm" @click="triggerVariantFile(variant, index)">
                    <UploadCloud :size="16" />
                    Загрузить (до 10МБ)
                  </Button>
                  <span>или перетащите файл сюда</span>
                  <span v-if="getVariantUploadState(variant, index).error" class="text-xs text-red-600">
                    {{ getVariantUploadState(variant, index).error }}
                  </span>
                  <span v-if="getVariantUploadState(variant, index).loading" class="text-xs text-muted-foreground">Загрузка...</span>
                </div>
                <div v-if="getVariantImagePreview(variant, index)" class="mt-3 flex items-center gap-3">
                  <img :src="normalizeImageUrl(getVariantImagePreview(variant, index))" class="h-16 w-16 rounded-xl object-cover" alt="variant-preview" />
                  <span class="text-xs text-muted-foreground">При отсутствии фото варианта будет использовано базовое фото блюда.</span>
                </div>
              </FieldContent>
            </Field>
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
            <CardDescription>Привязка групп модификаторов к блюду</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="group in modifierGroups" :key="group.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.modifier_group_ids"
                  type="checkbox"
                  :value="Number(group.id)"
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
                    :value="Number(modifier.id)"
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
            <CardDescription>В каких городах отображается блюдо</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.city_ids"
                  type="checkbox"
                  :value="Number(city.id)"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {{ city.name }}
              </Label>
            </div>
          </CardContent>
        </Card>
        <Card v-if="isEditing">
          <CardHeader>
            <CardTitle class="text-base">{{ hasVariants ? "Цены вариаций" : "Цены" }}</CardTitle>
            <CardDescription>
              {{ hasVariants ? "Редактируйте цены для выбранного города" : "Редактируйте цены блюда для выбранного города" }}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <div class="text-sm text-muted-foreground">Город</div>
              <Select v-model="selectedCityId" :disabled="activeCities.length === 0">
                <SelectTrigger class="w-64">
                  <SelectValue placeholder="Выберите город" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="city in activeCities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
                </SelectContent>
              </Select>
              <div v-if="activeCities.length === 0" class="text-xs text-muted-foreground">Сначала включите хотя бы один город.</div>
            </div>
            <div v-if="selectedCityId" class="space-y-4">
              <div v-if="hasVariants" class="space-y-4">
                <div v-for="(variant, variantIndex) in form.variants" :key="variant.id || variantIndex" class="space-y-3 rounded-lg border p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-sm font-semibold text-foreground">{{ variant.name || `Вариация ${variantIndex + 1}` }}</div>
                    <div class="text-xs text-muted-foreground">Базовая цена: {{ formatPrice(variant.price) }}</div>
                  </div>
                  <div class="grid gap-3 md:grid-cols-3">
                    <Field v-for="type in fulfillmentTypes" :key="type.value">
                      <FieldLabel class="text-xs text-muted-foreground">{{ type.label }}</FieldLabel>
                      <FieldContent>
                        <Input
                          v-model.number="getOrCreateVariantPriceEntry(variant, selectedCityId, type.value).price"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </FieldContent>
                    </Field>
                  </div>
                </div>
              </div>
              <div v-else class="space-y-3 rounded-lg border p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="text-sm font-semibold text-foreground">Цена блюда</div>
                  <div class="text-xs text-muted-foreground">Базовая цена: {{ formatPrice(getBaseItemPrice()) }}</div>
                </div>
                <div class="grid gap-3 md:grid-cols-3">
                  <Field v-for="type in fulfillmentTypes" :key="type.value">
                    <FieldLabel class="text-xs text-muted-foreground">{{ type.label }}</FieldLabel>
                    <FieldContent>
                      <Input
                        v-model.number="getOrCreateItemPriceEntry(selectedCityId, type.value).price"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </FieldContent>
                  </Field>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent :value="4" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Теги</CardTitle>
            <CardDescription>Добавление тегов к блюду (острое, новинка и т.д.)</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid gap-2 md:grid-cols-2">
              <Label v-for="tag in tags" :key="tag.id" class="flex items-center gap-2 text-sm text-foreground">
                <input
                  v-model="form.tag_ids"
                  type="checkbox"
                  :value="Number(tag.id)"
                  class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
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
import { ArrowLeft, GripVertical, Plus, Save, Trash2, UploadCloud } from "lucide-vue-next";
import { devError } from "@/shared/utils/logger";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import Label from "@/shared/components/ui/label/Label.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
const router = useRouter();
const route = useRoute();
const referenceStore = useReferenceStore();
const ordersStore = useOrdersStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const allCategories = ref([]);
const modifierGroups = ref([]);
const tags = ref([]);
const saving = ref(false);
const isInitialLoading = ref(false);
const activeTab = ref(0);
const fileInput = ref(null);
const uploadState = ref({ loading: false, error: null, preview: null });
const variantUploadStates = ref({});
const draggedVariantIndex = ref(null);
const dragOverVariantIndex = ref(null);
const tabLabels = ["Основное", "Вариации", "Модификаторы", "Доступность и цены", "Теги"];
const allowedFulfillmentValues = ["pickup", "delivery"];
const fulfillmentTypes = [
  { value: "pickup", label: "Самовывоз" },
  { value: "delivery", label: "Доставка" },
];
const itemId = computed(() => route.params.id);
const isEditing = computed(() => !!itemId.value && itemId.value !== "new");
isInitialLoading.value = isEditing.value;
const selectedCityId = ref(null);
const initialDisabledModifierIds = ref([]);
const form = ref({
  name: "",
  description: "",
  composition: "",
  image_url: "",
  weight_value: null,
  weight_unit: "g",
  price: null,
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
const modalTitle = computed(() => (isEditing.value ? "Редактировать блюдо" : "Новое блюдо"));
const modalSubtitle = computed(() => (isEditing.value ? "Измените параметры блюда" : "Создайте блюдо меню"));
const hasVariants = computed(() => form.value.variants.length > 0);
const activeCityIds = computed(() => (Array.isArray(form.value.city_ids) ? form.value.city_ids.map((id) => Number(id)).filter(Number.isFinite) : []));
const activeCities = computed(() => referenceStore.cities.filter((city) => activeCityIds.value.includes(city.id)));
const formTitle = computed(() => {
  if (!isEditing.value) return "Новое блюдо";
  const name = String(form.value.name || "").trim();
  return name ? `Блюдо: ${name}` : "Блюдо меню";
});
const breadcrumbTitle = computed(() => {
  const name = String(form.value.name || "").trim();
  if (!isEditing.value && !name) return "Новое блюдо";
  return name || "Блюдо меню";
});
const updateDocumentTitle = (baseTitle) => {
  const count = ordersStore.newOrdersCount || 0;
  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
};
const updateBreadcrumbs = () => {
  ordersStore.setBreadcrumbs([{ label: "Блюда", to: "/menu/products" }, { label: breadcrumbTitle.value }], route.name);
};
const normalizeIsActive = (value, fallback = true) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return Boolean(value);
};
const normalizeIdArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((id) => Number(id)).filter(Number.isFinite);
};
const normalizeImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env.VITE_UPLOADS_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
};
const normalizeCityId = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const getVariantUploadKey = (variant, index) => {
  if (variant?.id) return `id-${variant.id}`;
  if (!variant?.__local_key) {
    variant.__local_key = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return variant.__local_key || `idx-${index}`;
};
const getVariantUploadState = (variant, index) => {
  const key = getVariantUploadKey(variant, index);
  if (!variantUploadStates.value[key]) {
    variantUploadStates.value[key] = { loading: false, error: null, preview: null };
  }
  return variantUploadStates.value[key];
};
const getVariantImagePreview = (variant, index) => {
  const state = getVariantUploadState(variant, index);
  return state.preview || variant?.image_url || "";
};
const formatPrice = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0 ₽";
  return `${numeric.toFixed(0)} ₽`;
};
const getBaseItemPrice = () => {
  // Если у блюда есть базовая цена в форме (для блюд без вариантов)
  if (form.value.price !== null && form.value.price !== undefined && !hasVariants.value) {
    return Number(form.value.price) || 0;
  }

  // Иначе ищем в ценах по городам
  if (!Array.isArray(form.value.prices)) return 0;
  const baseDelivery = form.value.prices.find(
    (price) => normalizeCityId(price.city_id) === null && price.fulfillment_type === "delivery" && price.price !== null && price.price !== undefined,
  );
  if (baseDelivery) return Number(baseDelivery.price) || 0;
  const baseAny = form.value.prices.find((price) => normalizeCityId(price.city_id) === null && price.price !== null && price.price !== undefined);
  if (baseAny) return Number(baseAny.price) || 0;
  const fallback = form.value.prices.find((price) => price.price !== null && price.price !== undefined);
  return fallback ? Number(fallback.price) || 0 : 0;
};
const getOrCreatePriceEntry = (list, cityId, fulfillmentType, basePrice) => {
  if (!Array.isArray(list)) return { city_id: cityId, fulfillment_type: fulfillmentType, price: basePrice || 0 };
  const normalizedCityId = normalizeCityId(cityId);
  let entry = list.find((price) => normalizeCityId(price.city_id) === normalizedCityId && price.fulfillment_type === fulfillmentType);
  if (!entry) {
    entry = {
      city_id: normalizedCityId,
      fulfillment_type: fulfillmentType,
      price: basePrice || 0,
    };
    list.push(entry);
  }
  return entry;
};
const ensureItemPricesForCity = (cityId) => {
  const normalizedCityId = normalizeCityId(cityId);
  if (normalizedCityId === null) return;
  const basePrice = getBaseItemPrice();
  fulfillmentTypes.forEach((type) => {
    getOrCreatePriceEntry(form.value.prices, normalizedCityId, type.value, basePrice);
  });
};
const ensureVariantPricesForCity = (variant, cityId) => {
  const normalizedCityId = normalizeCityId(cityId);
  if (normalizedCityId === null || !variant) return;
  const basePrice = Number(variant.price) || 0;
  if (!Array.isArray(variant.prices)) variant.prices = [];
  fulfillmentTypes.forEach((type) => {
    getOrCreatePriceEntry(variant.prices, normalizedCityId, type.value, basePrice);
  });
};
const getOrCreateItemPriceEntry = (cityId, fulfillmentType) => {
  const basePrice = getBaseItemPrice();
  return getOrCreatePriceEntry(form.value.prices, cityId, fulfillmentType, basePrice);
};
const getOrCreateVariantPriceEntry = (variant, cityId, fulfillmentType) => {
  if (!Array.isArray(variant.prices)) variant.prices = [];
  return getOrCreatePriceEntry(variant.prices, cityId, fulfillmentType, Number(variant.price) || 0);
};
const goBack = () => {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  router.push({ name: "menu-products" });
};
const loadCategories = async () => {
  try {
    const response = await api.get("/api/menu/admin/all-categories");
    allCategories.value = response.data.categories || [];
  } catch (error) {
    devError("Failed to load categories:", error);
  }
};
const loadModifierGroups = async () => {
  try {
    const response = await api.get("/api/menu/admin/modifier-groups");
    const groups = response.data.modifier_groups || response.data.groups || [];
    modifierGroups.value = [...groups].sort((a, b) => {
      const aOrder = Number(a.sort_order) || 0;
      const bOrder = Number(b.sort_order) || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name || "").localeCompare(String(b.name || ""), "ru");
    });
  } catch (error) {
    devError("Failed to load modifier groups:", error);
  }
};
const loadTags = async () => {
  try {
    const response = await api.get("/api/menu/admin/tags");
    tags.value = response.data.tags || [];
  } catch (error) {
    devError("Failed to load tags:", error);
  }
};
const loadItem = async () => {
  if (!isEditing.value) return;
  try {
    const [itemRes, categoriesRes, variantsRes, modifiersRes, citiesRes, tagsRes, pricesRes, disabledModsRes] = await Promise.all([
      api.get(`/api/menu/admin/products/${itemId.value}`),
      api.get(`/api/menu/admin/products/${itemId.value}/categories`),
      api.get(`/api/menu/admin/products/${itemId.value}/variants`),
      api.get(`/api/menu/admin/products/${itemId.value}/modifiers`),
      api.get(`/api/menu/admin/products/${itemId.value}/cities`),
      api.get(`/api/menu/admin/products/${itemId.value}/tags`),
      api.get(`/api/menu/admin/products/${itemId.value}/prices`),
      api.get(`/api/menu/admin/products/${itemId.value}/disabled-modifiers`),
    ]);
    const item = itemRes.data.item;
    const variants = variantsRes.data.variants || [];
    const variantPricesResponses = await Promise.all(
      variants.map((variant) =>
        api
          .get(`/api/menu/admin/variants/${variant.id}/prices`)
          .then((response) => response.data.prices || [])
          .catch((error) => {
            devError("Failed to load variant prices:", error);
            return [];
          }),
      ),
    );
    const variantsWithPrices = variants.map((variant, index) => ({
      ...variant,
      __local_key: `loaded-${variant.id || index}`,
      prices: (variantPricesResponses[index] || []).filter((price) => allowedFulfillmentValues.includes(price.fulfillment_type)),
    }));
    form.value = {
      name: item.name,
      description: item.description || "",
      composition: item.composition || "",
      image_url: item.image_url || "",
      weight_value: item.weight_value,
      weight_unit: item.weight_unit || "g",
      price: item.price,
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
      category_ids: normalizeIdArray(categoriesRes.data.category_ids),
      variants: variantsWithPrices,
      modifier_group_ids: normalizeIdArray(modifiersRes.data.modifier_group_ids),
      disabled_modifier_ids: normalizeIdArray((disabledModsRes.data.modifiers || []).map((modifier) => modifier.id)),
      city_ids: normalizeIdArray(citiesRes.data.city_ids),
      tag_ids: normalizeIdArray(tagsRes.data.tag_ids),
      prices: (pricesRes.data.prices || []).filter((price) => allowedFulfillmentValues.includes(price.fulfillment_type)),
    };
    selectedCityId.value = form.value.city_ids.length ? form.value.city_ids[0] : null;
    initialDisabledModifierIds.value = [...form.value.disabled_modifier_ids];
  } catch (error) {
    devError("Failed to load item:", error);
    showErrorNotification("Ошибка при загрузке блюда");
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
      price: !hasVariants.value ? form.value.price : null,
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
      await api.put(`/api/menu/admin/products/${itemId.value}`, payload);
      savedItemId = itemId.value;
    } else {
      const res = await api.post("/api/menu/admin/products", payload);
      savedItemId = res.data.item.id;
    }
    await api.put(`/api/menu/admin/products/${savedItemId}/categories`, { category_ids: form.value.category_ids });
    return savedItemId;
  } catch (error) {
    devError("Failed to save item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
    return null;
  }
};
const saveVariants = async (savedItemId) => {
  normalizeVariantSortOrder();
  await api.put(`/api/menu/admin/products/${savedItemId}/variants`, { variants: form.value.variants });
};
const saveModifiers = async (savedItemId) => {
  await api.put(`/api/menu/admin/products/${savedItemId}/modifiers`, { modifier_group_ids: form.value.modifier_group_ids });
  await saveDisabledModifiers(savedItemId);
};
const saveDisabledModifiers = async (savedItemId) => {
  const selectedGroups = modifierGroups.value.filter((group) => form.value.modifier_group_ids.includes(group.id));
  const allModifierIds = selectedGroups.flatMap((group) => group.modifiers?.map((modifier) => modifier.id) || []);
  const desiredDisabledIds = new Set(form.value.disabled_modifier_ids);
  const initialDisabledIds = new Set(initialDisabledModifierIds.value || []);
  const toDisable = allModifierIds.filter((id) => desiredDisabledIds.has(id) && !initialDisabledIds.has(id));
  const toEnable = allModifierIds.filter((id) => !desiredDisabledIds.has(id) && initialDisabledIds.has(id));
  await Promise.all(toDisable.map((modifierId) => api.post(`/api/menu/admin/products/${savedItemId}/disabled-modifiers`, { modifier_id: modifierId })));
  await Promise.all(toEnable.map((modifierId) => api.delete(`/api/menu/admin/products/${savedItemId}/disabled-modifiers/${modifierId}`)));
  initialDisabledModifierIds.value = [...form.value.disabled_modifier_ids];
};
const saveCities = async (savedItemId) => {
  await api.put(`/api/menu/admin/products/${savedItemId}/cities`, { city_ids: form.value.city_ids });
};
const saveTags = async (savedItemId) => {
  await api.put(`/api/menu/admin/products/${savedItemId}/tags`, { tag_ids: form.value.tag_ids });
};
const savePrices = async (savedItemId) => {
  const requests = [];
  for (const priceItem of form.value.prices) {
    if (!priceItem || !priceItem.fulfillment_type) continue;
    if (priceItem.price === null || priceItem.price === undefined || priceItem.price === "") continue;
    if (!allowedFulfillmentValues.includes(priceItem.fulfillment_type)) continue;
    requests.push(
      api.post(`/api/menu/admin/products/${savedItemId}/prices`, {
        city_id: priceItem.city_id,
        fulfillment_type: priceItem.fulfillment_type,
        price: priceItem.price,
      }),
    );
  }
  await Promise.all(requests);
};
const saveVariantPrices = async () => {
  for (const variant of form.value.variants) {
    if (!variant.id) continue;
    if (!Array.isArray(variant.prices)) continue;
    const cleanedPrices = variant.prices.filter(
      (priceItem) => priceItem && priceItem.fulfillment_type && priceItem.price !== null && priceItem.price !== undefined && priceItem.price !== "",
    );
    const payload = cleanedPrices.filter((priceItem) => allowedFulfillmentValues.includes(priceItem.fulfillment_type));
    await api.put(`/api/menu/admin/variants/${variant.id}/prices`, { prices: payload });
  }
};
const saveAll = async () => {
  saving.value = true;
  try {
    const savedItemId = await saveItem();
    if (!savedItemId) return;
    await saveVariants(savedItemId);
    await Promise.all([saveModifiers(savedItemId), saveCities(savedItemId), savePrices(savedItemId), saveVariantPrices(), saveTags(savedItemId)]);
    showSuccessNotification("Блюдо сохранено");
    await router.push({ name: "menu-products" });
  } catch (error) {
    devError("Failed to save all item data:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const selectedModifierGroups = computed(() => modifierGroups.value.filter((group) => form.value.modifier_group_ids.includes(group.id)));
const normalizeVariantSortOrder = () => {
  form.value.variants.forEach((variant, index) => {
    variant.sort_order = (index + 1) * 10;
  });
};
const addVariant = () => {
  const newVariant = {
    __local_key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    price: 0,
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
    sort_order: (form.value.variants.length + 1) * 10,
    prices: [],
  };
  form.value.variants.push(newVariant);
  const cityIds = form.value.city_ids || [];
  cityIds.forEach((cityId) => ensureVariantPricesForCity(newVariant, cityId));
};
const removeVariant = (index) => {
  const variant = form.value.variants[index];
  const key = getVariantUploadKey(variant, index);
  delete variantUploadStates.value[key];
  form.value.variants.splice(index, 1);
  normalizeVariantSortOrder();
};
const onVariantDragStart = (index, event) => {
  draggedVariantIndex.value = index;
  dragOverVariantIndex.value = index;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }
};
const onVariantDragOver = (index) => {
  if (draggedVariantIndex.value === null) return;
  dragOverVariantIndex.value = index;
};
const onVariantDragLeave = (index) => {
  if (dragOverVariantIndex.value === index) {
    dragOverVariantIndex.value = null;
  }
};
const onVariantDropCard = (index) => {
  const from = draggedVariantIndex.value;
  if (from === null || from === index) return;
  const variants = [...form.value.variants];
  const [movedVariant] = variants.splice(from, 1);
  variants.splice(index, 0, movedVariant);
  form.value.variants = variants;
  normalizeVariantSortOrder();
};
const onVariantDragEnd = () => {
  draggedVariantIndex.value = null;
  dragOverVariantIndex.value = null;
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
    const res = await api.post(`/api/uploads/menu-products/${itemId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = res.data?.data?.url || "";
    form.value.image_url = uploadedUrl;
    uploadState.value = { loading: false, error: null, preview: uploadedUrl };
  } catch (error) {
    devError("Failed to upload:", error);
    uploadState.value = { loading: false, error: "Ошибка загрузки", preview: null };
  }
};
const triggerVariantFile = (variant, index) => {
  const key = getVariantUploadKey(variant, index);
  const input = document.getElementById(`variant-file-${key}`);
  if (input) input.click();
};
const onVariantFileChange = (variant, index, event) => {
  const file = event.target.files?.[0];
  if (file) handleVariantFile(variant, index, file);
};
const onVariantDrop = (variant, index, event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) handleVariantFile(variant, index, file);
};
const handleVariantFile = async (variant, index, file) => {
  const state = getVariantUploadState(variant, index);
  if (file.size > 10 * 1024 * 1024) {
    state.error = "Файл больше 10MB";
    return;
  }
  if (!file.type.startsWith("image/")) {
    state.error = "Только изображения";
    return;
  }

  state.loading = true;
  state.error = null;
  state.preview = URL.createObjectURL(file);
  try {
    const formData = new FormData();
    formData.append("image", file);
    const currentItemId = route.params.id || "temp";
    const res = await api.post(`/api/uploads/menu-products/${currentItemId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const uploadedUrl = res.data?.data?.url || "";
    variant.image_url = uploadedUrl;
    state.preview = uploadedUrl;
  } catch (error) {
    devError("Failed to upload variant image:", error);
    state.error = "Ошибка загрузки";
  } finally {
    state.loading = false;
  }
};
onMounted(async () => {
  try {
    await Promise.all([referenceStore.fetchCitiesAndBranches(), loadCategories(), loadModifierGroups(), loadTags()]);
    await loadItem();
    updateBreadcrumbs();
  } catch (error) {
    devError("Ошибка инициализации формы блюда:", error);
    showErrorNotification("Ошибка загрузки данных формы");
  } finally {
    isInitialLoading.value = false;
  }
});
watch(
  () => activeCityIds.value,
  (next, prev) => {
    const prevSet = new Set(prev || []);
    const nextSet = new Set(next || []);
    const added = next.filter((id) => !prevSet.has(id));
    if (added.length) {
      if (hasVariants.value) {
        form.value.variants.forEach((variant) => {
          added.forEach((cityId) => ensureVariantPricesForCity(variant, cityId));
        });
      } else {
        added.forEach((cityId) => ensureItemPricesForCity(cityId));
      }
    }
    if (selectedCityId.value && !nextSet.has(Number(selectedCityId.value))) {
      selectedCityId.value = next.length ? next[0] : null;
    }
  },
  { immediate: true },
);
watch(
  () => selectedCityId.value,
  (next) => {
    if (!next) return;
    if (hasVariants.value) {
      form.value.variants.forEach((variant) => ensureVariantPricesForCity(variant, next));
    } else {
      ensureItemPricesForCity(next);
    }
  },
);
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
<style scoped>
.variant-dragging {
  opacity: 0.65;
}

.variant-drop-target {
  border: 1px dashed hsl(var(--primary));
}
</style>
