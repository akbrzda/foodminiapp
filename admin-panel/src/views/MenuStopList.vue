<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Стоп-лист" description="Управление временно недоступными позициями по филиалам">
          <template #actions>
            <Button @click="openModal()">
              <Plus :size="16" />
              Добавить
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Список позиций</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <div v-if="stopList.length === 0" class="py-8 text-center text-sm text-muted-foreground">Стоп-лист пуст</div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Филиал</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Добавлено</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in stopList" :key="item.id">
              <TableCell>
                <div class="text-sm font-medium">{{ getBranchName(item.branch_id) }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="item.entity_type === 'item' ? 'default' : item.entity_type === 'variant' ? 'secondary' : 'outline'">
                  {{ item.entity_type === "item" ? "Позиция" : item.entity_type === "variant" ? "Вариант" : "Модификатор" }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="text-sm font-medium text-foreground">{{ item.entity_name }}</div>
              </TableCell>
              <TableCell>
                <div class="text-xs text-muted-foreground">{{ item.reason || "—" }}</div>
              </TableCell>
              <TableCell>
                <div class="text-xs text-muted-foreground">{{ formatDate(item.created_at) }}</div>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="icon" @click="removeFromStopList(item)">
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <BaseModal v-if="showModal" size="xl" title="Добавить в стоп-лист" subtitle="Временно сделать позицию недоступной" @close="closeModal">
      <form class="space-y-6" @submit.prevent="submitStopList">
        <div v-if="step === 1" class="space-y-5">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиал *</label>
              <Select v-model="form.branch_id" required>
                <option value="">Выберите филиал</option>
                <optgroup v-for="city in referenceStore.cities" :key="city.id" :label="city.name">
                  <option v-for="branch in referenceStore.branchesByCity[city.id] || []" :key="branch.id" :value="branch.id">
                    {{ branch.name }}
                  </option>
                </optgroup>
              </Select>
            </div>
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип *</label>
              <Select v-model="form.type" @change="onTypeChange" required>
                <option value="">Выберите тип</option>
                <option value="modifier">Товар</option>
                <option value="product">Продукция</option>
              </Select>
            </div>
          </div>
          <div v-if="isModifierType" class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Товар *</label>
            <div ref="modifierContainer" class="relative">
              <Input
                v-model="modifierQuery"
                placeholder="Введите название товара"
                @focus="modifierListOpen = true"
                @input="modifierListOpen = true"
              />
              <div v-if="modifierListOpen" class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card shadow-sm">
                <div v-if="loadingModifiers" class="px-3 py-2 text-sm text-muted-foreground">Загрузка списка...</div>
                <button
                  v-for="modifier in filteredModifiers"
                  :key="modifier.id"
                  type="button"
                  class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted"
                  @mousedown.prevent="selectModifier(modifier)"
                >
                  {{ modifier.name }}
                </button>
                <div v-if="!loadingModifiers && filteredModifiers.length === 0" class="px-3 py-2 text-sm text-muted-foreground">
                  Ничего не найдено
                </div>
              </div>
            </div>
            <p v-if="selectedModifier" class="text-xs text-muted-foreground">Выбрано: {{ selectedModifier.name }}</p>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина постановки на стоп</label>
            <Select v-model="form.reason">
              <option value="">Без причины</option>
              <option v-for="reason in reasons" :key="reason.id" :value="reason.name">{{ reason.name }}</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Способы получения</label>
            <div class="grid gap-2 sm:grid-cols-3">
              <label
                v-for="option in fulfillmentOptions"
                :key="option.value"
                class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :value="option.value"
                  v-model="form.fulfillment_types"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
        </div>
        <div v-else-if="step === 2 && isProductType" class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :checked="allProductsSelected"
                  @change="toggleAllProducts"
                />
                Выбрать все
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  v-model="showSelectedOnly"
                />
                Показать выбранные
              </label>
            </div>
            <div class="w-full sm:max-w-xs">
              <Input v-model="productSearch" placeholder="Введите название продукции" />
            </div>
          </div>
          <div class="rounded-lg border border-border">
            <div v-if="loadingCategories" class="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка продукции...</div>
            <div v-else-if="filteredCategories.length === 0" class="px-4 py-6 text-center text-sm text-muted-foreground">Нет доступной продукции</div>
            <div v-else class="max-h-[420px] space-y-4 overflow-auto p-4">
              <div v-for="category in filteredCategories" :key="category.id" class="space-y-2">
                <label class="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    :checked="isCategorySelected(category)"
                    @change="toggleCategory(category)"
                  />
                  {{ category.name }}
                </label>
                <div class="space-y-1 pl-6">
                  <label v-for="item in category.items" :key="item.id" class="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      :value="item.id"
                      v-model="selectedProductIds"
                    />
                    <span>{{ item.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">Выбрано позиций: {{ selectedProductIds.length }}</p>
        </div>
        <div v-else-if="step === timeStep" class="space-y-4">
          <div class="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            По умолчанию стоп-лист устанавливается без ограничения по времени. Можно включить автоматическое снятие.
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              v-model="form.auto_remove"
            />
            Автоматически снять со стопа
          </label>
          <div v-if="form.auto_remove" class="space-y-3">
            <div class="text-sm text-muted-foreground">Время филиала: {{ branchTimeLabel }}</div>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" class="text-xs" @click="applyQuickTime(1)">Через 1 час</Button>
              <Button type="button" variant="ghost" class="text-xs" @click="applyQuickTime(3)">Через 3 часа</Button>
              <Button type="button" variant="ghost" class="text-xs" @click="applyQuickTime(5)">Через 5 часов</Button>
              <Button type="button" variant="ghost" class="text-xs" @click="applyShiftEnd">По окончании смены</Button>
            </div>
            <div class="grid gap-3 sm:grid-cols-[1.2fr_0.6fr_0.6fr]">
              <div class="space-y-1">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата</label>
                <Input v-model="removeDate" type="date" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Часы</label>
                <Select v-model="removeHour">
                  <option v-for="hour in hours" :key="hour" :value="hour">{{ hour }}</option>
                </Select>
              </div>
              <div class="space-y-1">
                <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Минуты</label>
                <Select v-model="removeMinute">
                  <option v-for="minute in minutes" :key="minute" :value="minute">{{ minute }}</option>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </form>
      <template #footer>
        <Button variant="outline" type="button" @click="handleBack" :disabled="step === 1">Назад</Button>
        <Button v-if="!isFinalStep" type="button" @click="handleNext" :disabled="!canProceed"> Следующий шаг </Button>
        <Button v-else type="button" @click="submitStopList" :disabled="saving || !canSubmit">
          <Save :size="16" />
          {{ saving ? "Сохранение..." : "Поставить" }}
        </Button>
      </template>
    </BaseModal>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import PageHeader from "../components/PageHeader.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatDate } from "../utils/date.js";
import { useReferenceStore } from "../stores/reference.js";
const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();
const stopList = ref([]);
const reasons = ref([]);
const showModal = ref(false);
const saving = ref(false);
const step = ref(1);
const modifiers = ref([]);
const categories = ref([]);
const loadingModifiers = ref(false);
const loadingCategories = ref(false);
const modifierQuery = ref("");
const modifierContainer = ref(null);
const outsideHandler = ref(null);
const modifierListOpen = ref(false);
const selectedModifier = ref(null);
const productSearch = ref("");
const showSelectedOnly = ref(false);
const selectedProductIds = ref([]);
const now = ref(new Date());
const removeDate = ref("");
const removeHour = ref("00");
const removeMinute = ref("00");
let nowInterval = null;
const form = ref({
  branch_id: "",
  type: "",
  reason: "",
  fulfillment_types: ["delivery", "pickup", "dine_in"],
  auto_remove: false,
  remove_at: null,
});
const fulfillmentOptions = [
  { value: "delivery", label: "Доставка" },
  { value: "pickup", label: "Самовывоз" },
  { value: "dine_in", label: "В зале" },
];
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const isModifierType = computed(() => form.value.type === "modifier");
const isProductType = computed(() => form.value.type === "product");
const timeStep = computed(() => (isProductType.value ? 3 : 2));
const isFinalStep = computed(() => step.value === timeStep.value);
const canProceedFromStep1 = computed(() => {
  if (!form.value.branch_id || !form.value.type) return false;
  if (!form.value.fulfillment_types.length) return false;
  if (isModifierType.value) return Boolean(selectedModifier.value);
  return true;
});
const canProceed = computed(() => {
  if (step.value === 1) return canProceedFromStep1.value;
  if (step.value === 2 && isProductType.value) return selectedProductIds.value.length > 0;
  return true;
});
const canSubmit = computed(() => {
  if (!canProceedFromStep1.value) return false;
  if (isProductType.value && selectedProductIds.value.length === 0) return false;
  if (form.value.auto_remove && !form.value.remove_at) return false;
  return true;
});
const branchTimeLabel = computed(() => formatDateTime(now.value));
const filteredModifiers = computed(() => {
  const query = modifierQuery.value.trim().toLowerCase();
  if (!query) return modifiers.value;
  return modifiers.value.filter((modifier) => modifier.name.toLowerCase().includes(query));
});
const filteredCategories = computed(() => {
  const query = productSearch.value.trim().toLowerCase();
  let list = categories.value.map((category) => {
    const filteredItems = query ? category.items.filter((item) => item.name.toLowerCase().includes(query)) : category.items;
    return { ...category, items: filteredItems };
  });
  list = list.filter((category) => category.items.length > 0);
  if (showSelectedOnly.value) {
    list = list
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => selectedProductIds.value.includes(item.id)),
      }))
      .filter((category) => category.items.length > 0);
  }
  return list;
});
const allProductIds = computed(() => categories.value.flatMap((category) => category.items.map((item) => item.id)));
const allProductsSelected = computed(() => {
  if (allProductIds.value.length === 0) return false;
  return allProductIds.value.every((id) => selectedProductIds.value.includes(id));
});
const getBranchName = (branchId) => {
  return referenceStore.branches.find((b) => b.id === branchId)?.name || "Неизвестно";
};
const loadStopList = async () => {
  try {
    const response = await api.get("/api/menu/admin/stop-list");
    stopList.value = response.data.items || [];
  } catch (error) {
    console.error("Failed to load stop list:", error);
    showErrorNotification("Ошибка при загрузке стоп-листа");
  }
};
const loadReasons = async () => {
  try {
    const response = await api.get("/api/menu/admin/stop-list-reasons");
    reasons.value = (response.data.reasons || []).filter((reason) => reason.is_active);
  } catch (error) {
    console.error("Failed to load reasons:", error);
    reasons.value = [];
  }
};
const loadModifiers = async () => {
  loadingModifiers.value = true;
  try {
    const response = await api.get("/api/menu/admin/modifiers");
    modifiers.value = response.data.modifiers || [];
  } catch (error) {
    console.error("Failed to load modifiers:", error);
    modifiers.value = [];
  } finally {
    loadingModifiers.value = false;
  }
};
const loadCategoriesAndItems = async () => {
  if (!form.value.branch_id) return;
  const branch = referenceStore.branches.find((item) => item.id === form.value.branch_id);
  if (!branch?.city_id) return;
  loadingCategories.value = true;
  try {
    const categoriesResponse = await api.get(`/api/menu/admin/categories?city_id=${branch.city_id}`);
    const baseCategories = categoriesResponse.data.categories || [];
    const itemsResponses = await Promise.all(baseCategories.map((category) => api.get(`/api/menu/admin/categories/${category.id}/items`)));
    categories.value = baseCategories.map((category, index) => ({
      ...category,
      items: itemsResponses[index]?.data?.items || [],
    }));
  } catch (error) {
    console.error("Failed to load categories:", error);
    categories.value = [];
  } finally {
    loadingCategories.value = false;
  }
};
const openModal = () => {
  resetForm();
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
};
const resetForm = () => {
  form.value = {
    branch_id: "",
    type: "",
    reason: "",
    fulfillment_types: ["delivery", "pickup", "dine_in"],
    auto_remove: false,
    remove_at: null,
  };
  step.value = 1;
  modifiers.value = [];
  categories.value = [];
  selectedModifier.value = null;
  modifierQuery.value = "";
  modifierListOpen.value = false;
  productSearch.value = "";
  showSelectedOnly.value = false;
  selectedProductIds.value = [];
  removeDate.value = "";
  removeHour.value = "00";
  removeMinute.value = "00";
};
const onTypeChange = async () => {
  selectedModifier.value = null;
  modifierQuery.value = "";
  modifierListOpen.value = false;
  selectedProductIds.value = [];
  categories.value = [];
  productSearch.value = "";
  showSelectedOnly.value = false;
  if (isModifierType.value) {
    await loadModifiers();
  }
  if (isProductType.value && form.value.branch_id) {
    await loadCategoriesAndItems();
  }
};
const selectModifier = (modifier) => {
  selectedModifier.value = modifier;
  modifierQuery.value = modifier.name;
  modifierListOpen.value = false;
};
const isCategorySelected = (category) => {
  if (!category.items?.length) return false;
  return category.items.every((item) => selectedProductIds.value.includes(item.id));
};
const toggleCategory = (category) => {
  const ids = category.items.map((item) => item.id);
  if (isCategorySelected(category)) {
    selectedProductIds.value = selectedProductIds.value.filter((id) => !ids.includes(id));
    return;
  }
  const merged = new Set([...selectedProductIds.value, ...ids]);
  selectedProductIds.value = Array.from(merged);
};
const toggleAllProducts = () => {
  if (allProductsSelected.value) {
    selectedProductIds.value = [];
    return;
  }
  selectedProductIds.value = [...allProductIds.value];
};
const applyQuickTime = (hoursToAdd) => {
  const date = new Date();
  date.setHours(date.getHours() + hoursToAdd);
  setRemoveDateTime(date);
  form.value.auto_remove = true;
};
const applyShiftEnd = () => {
  const date = new Date();
  date.setHours(23, 59, 0, 0);
  setRemoveDateTime(date);
  form.value.auto_remove = true;
};
const setRemoveDateTime = (date) => {
  removeDate.value = formatDateInput(date);
  removeHour.value = String(date.getHours()).padStart(2, "0");
  removeMinute.value = String(date.getMinutes()).padStart(2, "0");
  syncRemoveAt();
};
const syncRemoveAt = () => {
  if (!form.value.auto_remove || !removeDate.value) {
    form.value.remove_at = null;
    return;
  }
  const nextDate = new Date(`${removeDate.value}T${removeHour.value}:${removeMinute.value}:00`);
  form.value.remove_at = Number.isNaN(nextDate.getTime()) ? null : nextDate.toISOString();
};
const handleNext = () => {
  if (step.value === 1) {
    step.value = 2;
    if (isProductType.value && categories.value.length === 0) {
      loadCategoriesAndItems();
    }
    return;
  }
  if (step.value < timeStep.value) {
    step.value += 1;
  }
};
const handleBack = () => {
  if (step.value > 1) {
    step.value -= 1;
  }
};
const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};
const submitStopList = async () => {
  saving.value = true;
  try {
    const payloadBase = {
      branch_id: form.value.branch_id,
      reason: form.value.reason || null,
      fulfillment_types: form.value.fulfillment_types,
      auto_remove: form.value.auto_remove,
      remove_at: form.value.auto_remove ? form.value.remove_at : null,
    };
    if (isModifierType.value) {
      await api.post("/api/menu/admin/stop-list", {
        ...payloadBase,
        entity_type: "modifier",
        entity_id: selectedModifier.value?.id,
      });
    } else {
      const requests = selectedProductIds.value.map((id) =>
        api.post("/api/menu/admin/stop-list", {
          ...payloadBase,
          entity_type: "item",
          entity_id: id,
        }),
      );
      await Promise.all(requests);
    }
    showModal.value = false;
    await loadStopList();
  } catch (error) {
    console.error("Failed to add to stop list:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  } finally {
    saving.value = false;
  }
};
const removeFromStopList = async (item) => {
  if (!confirm(`Удалить "${item.entity_name}" из стоп-листа?`)) return;
  try {
    await api.delete(`/api/menu/admin/stop-list/${item.id}`);
    await loadStopList();
  } catch (error) {
    console.error("Failed to remove from stop list:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  }
};
onMounted(async () => {
  try {
    await referenceStore.fetchCitiesAndBranches();
    await loadReasons();
    await loadStopList();
    nowInterval = setInterval(() => {
      now.value = new Date();
    }, 60000);
  } catch (error) {
    console.error("Ошибка загрузки стоп-листа:", error);
    showErrorNotification("Ошибка загрузки стоп-листа");
  }
});
onBeforeUnmount(() => {
  if (nowInterval) clearInterval(nowInterval);
});
watch([removeDate, removeHour, removeMinute, () => form.value.auto_remove], () => {
  syncRemoveAt();
});
watch(
  () => form.value.branch_id,
  async (value) => {
    if (!value) {
      categories.value = [];
      selectedProductIds.value = [];
      return;
    }
    if (isProductType.value) {
      await loadCategoriesAndItems();
    }
  },
);
watch(
  () => modifierListOpen.value,
  (value) => {
    if (!value) {
      if (outsideHandler.value) {
        document.removeEventListener("click", outsideHandler.value);
        outsideHandler.value = null;
      }
      return;
    }
    const closeOnOutside = (event) => {
      if (!modifierContainer.value?.contains(event.target)) {
        modifierListOpen.value = false;
        if (outsideHandler.value) {
          document.removeEventListener("click", outsideHandler.value);
          outsideHandler.value = null;
        }
      }
    };
    outsideHandler.value = closeOnOutside;
    document.addEventListener("click", closeOnOutside);
  },
);
watch(
  () => showModal.value,
  (value) => {
    if (value) return;
    modifierListOpen.value = false;
    if (outsideHandler.value) {
      document.removeEventListener("click", outsideHandler.value);
      outsideHandler.value = null;
    }
  },
);
watch(
  () => modifierQuery.value,
  (value) => {
    if (selectedModifier.value && value !== selectedModifier.value.name) {
      selectedModifier.value = null;
    }
  },
);
</script>
