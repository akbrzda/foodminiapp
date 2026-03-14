<template>
  <div class="relative h-full min-h-[calc(100vh-80px)] bg-background">
    <div id="map" class="absolute inset-0 z-0"></div>
    <div class="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
      <Button type="button" size="icon" variant="secondary" class="h-10 w-10 shadow-lg" @click="zoomInMap">
        <Plus :size="18" />
      </Button>
      <Button type="button" size="icon" variant="secondary" class="h-10 w-10 shadow-lg" @click="zoomOutMap">
        <Minus :size="18" />
      </Button>
    </div>
    <input
      ref="geoJsonInputRef"
      type="file"
      accept=".geojson,application/geo+json,.json,application/json"
      class="hidden"
      @change="handleGeoJsonFileChange"
    />
    <div class="absolute left-2 right-2 top-2 z-10 md:hidden">
      <div class="space-y-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
        <div class="grid grid-cols-1 gap-2">
          <Button variant="secondary" size="sm" class="w-full" @click="showMobileFilters = true">
            <SlidersHorizontal :size="16" />
            Фильтры
          </Button>
        </div>
        <div class="text-[11px] text-muted-foreground">
          <span class="font-medium text-foreground">{{ activeCityName }}</span>
          <span> · </span>
          <span>{{ polygonFilterLabel }}</span>
        </div>
      </div>
    </div>
    <div
      class="absolute left-4 top-4 z-10 hidden w-[360px] max-w-[calc(100%-2rem)] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur md:block"
    >
      <div class="p-4 space-y-4">
        <div class="space-y-4">
          <PageHeader title="Зоны доставки" description="Управление зонами доставки и фильтры" />
          <div class="space-y-3">
            <Field>
              <FieldContent>
                <Select v-model="cityId" @update:modelValue="onCityChange">
                  <SelectTrigger class="w-full">
                    <span class="truncate text-start" :class="!cityId ? 'text-muted-foreground' : ''">
                      {{ cityFilterTriggerLabel }}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                      {{ city.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field v-if="cityId">
              <FieldContent>
                <Select v-model="polygonFilterId" @update:modelValue="onPolygonFilterChange">
                  <SelectTrigger class="w-full">
                    <span class="truncate text-start" :class="!polygonFilterId ? 'text-muted-foreground' : ''">
                      {{ polygonFilterTriggerLabel }}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem v-for="polygon in polygonsForSelect" :key="polygon.id" :value="String(polygon.id)">
                      {{ polygon.name || `Полигон #${polygon.id}` }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldContent>
                <Select v-model="statusFilter" @update:modelValue="onFilterChange">
                  <SelectTrigger class="w-full">
                    <span class="truncate text-start" :class="statusFilter === 'all' ? 'text-muted-foreground' : ''">
                      {{ statusFilterTriggerLabel }}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    <SelectItem value="active">Активные</SelectItem>
                    <SelectItem value="inactive">Неактивные</SelectItem>
                    <SelectItem value="blocked">Заблокированные</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="pt-3 border-t border-border">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Легенда</p>
            <div v-if="branchLegendItems.length" class="space-y-1.5">
              <div v-for="item in branchLegendItems" :key="item.branchId" class="flex items-center gap-2 text-xs">
                <div class="h-3 w-3 rounded-sm border" :style="{ borderColor: item.stroke, backgroundColor: item.fill }"></div>
                <span class="text-foreground">{{ item.branchName }}</span>
              </div>
            </div>
            <p v-else class="text-xs text-muted-foreground">Выберите город, чтобы увидеть распределение филиалов.</p>
          </div>
          <div v-if="cityId" class="pt-3 border-t border-border">
            <div v-if="canManageDeliveryZones" class="space-y-2">
              <Button class="w-full" size="sm" :disabled="!activeBranchIdForActions" @click="startDrawing">
                <Plus :size="16" />
                Добавить полигон
              </Button>
              <div class="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" :disabled="!activeBranchIdForActions" @click="triggerGeoJsonImport">
                  <Upload :size="16" />
                  Импорт
                </Button>
                <Button variant="outline" size="sm" :disabled="!activeBranchPolygons.length || geoJsonExporting" @click="exportGeoJson">
                  <Download :size="16" />
                  Экспорт
                </Button>
              </div>
            </div>
            <p v-else class="text-center text-xs text-muted-foreground">Недостаточно прав для редактирования зон доставки</p>
          </div>
          <div v-if="filteredPolygons.length > 0" class="pt-2 text-xs text-muted-foreground text-center">
            {{ filteredPolygons.length }} {{ getPluralForm(filteredPolygons.length) }}
          </div>
          <div class="space-y-2 border-t border-border pt-3">
            <div v-if="canToggleDeliveryZones" class="grid gap-2">
              <Button size="sm" variant="outline" @click="activateBulkMode('transfer')">Групповое переключение</Button>
              <Button size="sm" variant="outline" @click="activateBulkMode('block')">Групповая блокировка</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Button
      v-if="cityId && canManageDeliveryZones"
      type="button"
      size="sm"
      class="absolute bottom-4 left-2 z-10 md:hidden"
      :disabled="!activeBranchIdForActions"
      @click="startDrawing"
    >
      <Plus :size="16" />
      Добавить полигон
    </Button>
    <Dialog v-if="showMobileFilters" :open="showMobileFilters" @update:open="(value) => (showMobileFilters = value)">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Фильтры зон доставки</DialogTitle>
          <DialogDescription>Выберите город, полигон и статус отображения.</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <Field>
            <FieldContent>
              <Select v-model="cityId" @update:modelValue="onCityChange">
                <SelectTrigger class="w-full">
                  <span class="truncate text-start" :class="!cityId ? 'text-muted-foreground' : ''">
                    {{ cityFilterTriggerLabel }}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все</SelectItem>
                  <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">
                    {{ city.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field v-if="cityId">
            <FieldContent>
              <Select v-model="polygonFilterId" @update:modelValue="onPolygonFilterChange">
                <SelectTrigger class="w-full">
                  <span class="truncate text-start" :class="!polygonFilterId ? 'text-muted-foreground' : ''">
                    {{ polygonFilterTriggerLabel }}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все</SelectItem>
                  <SelectItem v-for="polygon in polygonsForSelect" :key="polygon.id" :value="String(polygon.id)">
                    {{ polygon.name || `Полигон #${polygon.id}` }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldContent>
              <Select v-model="statusFilter" @update:modelValue="onFilterChange">
                <SelectTrigger class="w-full">
                  <span class="truncate text-start" :class="statusFilter === 'all' ? 'text-muted-foreground' : ''">
                    {{ statusFilterTriggerLabel }}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="inactive">Неактивные</SelectItem>
                  <SelectItem value="blocked">Заблокированные</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <div v-if="cityId && canManageDeliveryZones" class="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" :disabled="!activeBranchIdForActions" @click="triggerGeoJsonImport">
              <Upload :size="16" />
              Импорт
            </Button>
            <Button variant="outline" size="sm" :disabled="!activeBranchPolygons.length || geoJsonExporting" @click="exportGeoJson">
              <Download :size="16" />
              Экспорт
            </Button>
          </div>
          <div class="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Button size="sm" variant="outline" @click="activateBulkMode('transfer')">Групповое переключение</Button>
            <Button size="sm" variant="outline" @click="activateBulkMode('block')">Групповая блокировка</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <div
      v-if="isBulkModeActive"
      class="absolute right-4 top-4 bottom-4 z-20 w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur flex flex-col"
    >
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-lg font-semibold text-foreground">{{ bulkModeTitle }}</p>
          <p class="text-xs text-muted-foreground">Выбрано: {{ selectedPolygons.length }} {{ getPluralForm(selectedPolygons.length) }}</p>
        </div>
        <Button variant="ghost" size="icon" class="h-8 w-8" @click="closeBulkMode"> ✕ </Button>
      </div>
      <div class="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div v-if="bulkSelectedPolygons.length" class="space-y-1.5">
          <div v-for="polygon in bulkSelectedPolygons" :key="polygon.id" class="flex items-center justify-between gap-2 text-sm">
            <span class="truncate text-foreground">{{ polygon.name || `Полигон #${polygon.id}` }}</span>
            <button type="button" class="text-destructive transition hover:opacity-80" @click="removeSelectedPolygon(polygon.id)">✕</button>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">Выберите полигоны для {{ bulkMode === "transfer" ? "переключения" : "блокировки" }}.</p>
      </div>
      <div class="border-t border-border px-4 py-3">
        <Button class="w-full" :disabled="!selectedPolygons.length" @click="submitBulkModeAction">
          {{ bulkModeActionLabel }}
        </Button>
      </div>
    </div>
    <Dialog v-if="showBulkTransferDialog" :open="showBulkTransferDialog" @update:open="(value) => (value ? null : closeBulkTransferDialog())">
      <DialogContent class="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Групповое переключение</DialogTitle>
          <DialogDescription
            >Выберите филиал для переноса {{ selectedPolygons.length }} {{ getPluralForm(selectedPolygons.length) }}.</DialogDescription
          >
        </DialogHeader>
        <div class="space-y-4">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Целевой филиал</FieldLabel>
            <FieldContent>
              <Select v-model="bulkTransferBranchId">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите филиал" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="branch in branches" :key="branch.id" :value="String(branch.id)">
                    {{ branch.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <div class="flex gap-2">
            <Button type="button" variant="outline" class="flex-1" :disabled="bulkTransferSaving" @click="closeBulkTransferDialog">Отмена</Button>
            <Button type="button" class="flex-1" :disabled="!bulkTransferBranchId || bulkTransferSaving" @click="submitBulkTransfer">
              {{ bulkTransferSaving ? "Переключение..." : "Переключить" }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitPolygon">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="form.name" placeholder="Центральная зона" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Время доставки (мин)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.delivery_time" type="number" min="0" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Мин. заказ (₽)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.min_order_amount" type="number" min="0" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Доставка (₽)</FieldLabel>
              <FieldContent>
                <Input v-model.number="form.delivery_cost" type="number" min="0" />
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="form-actions">
            <Button type="submit">
              <Save :size="16" />
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showBlockModalWindow" :open="showBlockModalWindow" @update:open="(value) => (value ? null : closeBlockModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {{ blockingPolygon?.id === "bulk" ? `Блокировка полигонов (${blockingPolygon.ids.length})` : "Блокировка полигона" }}
          </DialogTitle>
          <DialogDescription>
            {{ blockingPolygon?.id === "bulk" ? "Укажите параметры для массовой блокировки" : "Укажите параметры блокировки" }}
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitBlock">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип блокировки</FieldLabel>
              <FieldContent>
                <Select v-model="blockForm.blockType">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Постоянная</SelectItem>
                    <SelectItem value="temporary">Временная</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field v-if="blockForm.blockType === 'temporary'">
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
              <FieldContent>
                <div class="rounded-md border border-border bg-card">
                  <CalendarView v-model="blockCalendarRange" :number-of-months="2" locale="ru-RU" multiple />
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ blockRangeHelperLabel }}</span>
                  <button type="button" class="text-primary hover:underline" @click="clearBlockRange">Очистить</button>
                </div>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина блокировки</FieldLabel>
              <FieldContent>
                <Input v-model="blockForm.block_reason" placeholder="Укажите причину" />
              </FieldContent>
            </Field>
          </FieldGroup>
          <div class="flex gap-2">
            <Button class="flex-1" type="submit" variant="default">
              <Lock :size="16" />
              Заблокировать
            </Button>
            <Button type="button" variant="outline" @click="closeBlockModal"> Отмена </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog v-if="showGeoJsonImportDialog" :open="showGeoJsonImportDialog" @update:open="(value) => (value ? null : closeGeoJsonImportDialog())">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Импорт GeoJSON</DialogTitle>
          <DialogDescription>
            Проверьте полигоны из файла <span class="font-medium text-foreground">{{ geoJsonImportFileName }}</span> и подтвердите сохранение.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="rounded-lg border border-border p-3 text-sm text-muted-foreground">
            Предпросмотр выполнен на карте: импортируемые полигоны подсвечены пунктиром.
          </div>
          <div class="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            Найдено полигонов: <span class="font-semibold text-foreground">{{ geoJsonImportItems.length }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button type="button" variant="outline" class="flex-1" :disabled="geoJsonImportSaving" @click="closeGeoJsonImportDialog"> Отмена </Button>
          <Button type="button" class="flex-1" :disabled="!geoJsonImportItems.length || geoJsonImportSaving" @click="confirmGeoJsonImport">
            <Upload :size="16" />
            {{ geoJsonImportSaving ? "Сохранение..." : `Сохранить (${geoJsonImportItems.length})` }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <PolygonSidebar
      :is-open="showSidebar"
      :polygon="selectedPolygon"
      :tariffs="selectedTariffs"
      :tariffs-loading="tariffsLoading"
      :tariff-sources="availableTariffSources"
      :city-branches="branches"
      :read-only="!canManageDeliveryZones"
      :can-toggle-state="canToggleDeliveryZones"
      :can-transfer="canToggleDeliveryZones"
      @close="closeSidebar"
      @save="savePolygonFromSidebar"
      @edit-tariffs="openTariffEditor"
      @copy-tariffs="openTariffCopy"
      @block="showBlockModalFromSidebar"
      @unblock="unblockPolygonFromSidebar"
      @delete="deletePolygonFromSidebar"
      @transfer="transferPolygon"
      @redraw="startRedrawPolygon"
    />
    <DeliveryTariffEditorDialog :open="tariffEditorOpen" :tariffs="selectedTariffs" @close="tariffEditorOpen = false" @save="saveTariffs" />
    <DeliveryTariffCopyDialog
      :open="tariffCopyOpen"
      :sources="availableTariffSources"
      :preview-tariffs="tariffCopyPreview"
      :selected-source-id="tariffCopySource"
      @close="closeTariffCopy"
      @select="selectTariffCopySource"
      @confirm="confirmTariffCopy"
    />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Download, Lock, Minus, Plus, Save, SlidersHorizontal, Upload } from "lucide-vue-next";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import api from "@/shared/api/client.js";
import PolygonSidebar from "@/shared/components/PolygonSidebar.vue";
import DeliveryTariffEditorDialog from "@/modules/delivery/components/DeliveryTariffEditorDialog.vue";
import DeliveryTariffCopyDialog from "@/modules/delivery/components/DeliveryTariffCopyDialog.vue";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useRoute, useRouter } from "vue-router";
import Button from "@/shared/components/ui/button/Button.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import { Calendar as CalendarView } from "@/shared/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { loadYandexMaps } from "@/shared/services/yandexMaps.js";

const MAP_DANGER = "#ef4444";
const hexToRgba = (hex, alpha) => {
  const cleaned = String(hex || "").replace("#", "");
  if (![3, 6].includes(cleaned.length)) return `rgba(34, 197, 94, ${alpha})`;
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : cleaned;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { showErrorNotification, showSuccessNotification, showWarningNotification } = useNotifications();
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("delivery-zones");
const isManager = computed(() => authStore.scopeRole === "manager");
const canManageDeliveryZones = computed(() => authStore.hasPermission("locations.delivery_zones.manage"));
const canToggleDeliveryZones = computed(() => authStore.hasAnyPermission(["locations.delivery_zones.manage", "locations.delivery_zones.toggle"]));
const cityId = ref("");
const branchId = ref("");
const polygonFilterId = ref("");
const branches = ref([]);
const allPolygons = ref([]);
const showModal = ref(false);
const showBlockModalWindow = ref(false);
const showBulkTransferDialog = ref(false);
const bulkTransferSaving = ref(false);
const bulkTransferBranchId = ref("");
const mapSelectionMode = ref(false);
const bulkMode = ref("");
const editing = ref(null);
const blockingPolygon = ref(null);
const showMobileFilters = ref(false);
const form = ref({
  name: "",
  delivery_time: 30,
  min_order_amount: 0,
  delivery_cost: 0,
});
const blockForm = ref({
  blockType: "permanent",
  blocked_from: "",
  blocked_until: "",
  block_reason: "",
});
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const blockCalendarRange = computed({
  get() {
    const values = [];
    if (blockForm.value.blocked_from) values.push(parseCalendarDate(blockForm.value.blocked_from));
    if (blockForm.value.blocked_until) values.push(parseCalendarDate(blockForm.value.blocked_until));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    blockForm.value.blocked_from = normalized[0]?.toString() || "";
    blockForm.value.blocked_until = normalized[1]?.toString() || "";
  },
});
const blockRangeHelperLabel = computed(() => {
  if (blockForm.value.blocked_from && blockForm.value.blocked_until) return "Диапазон выбран";
  if (blockForm.value.blocked_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const clearBlockRange = () => {
  blockForm.value.blocked_from = "";
  blockForm.value.blocked_until = "";
};
const statusFilter = ref("all");
const selectedPolygons = ref([]);
const showSidebar = ref(false);
const selectedPolygon = ref(null);
const editingPolygonId = ref(null);
const selectedTariffs = ref([]);
const tariffsLoading = ref(false);
const tariffEditorOpen = ref(false);
const tariffCopyOpen = ref(false);
const tariffCopySource = ref("");
const tariffCopyPreview = ref([]);
const geoJsonInputRef = ref(null);
const showGeoJsonImportDialog = ref(false);
const geoJsonImportFileName = ref("");
const geoJsonImportItems = ref([]);
const geoJsonImportSaving = ref(false);
const geoJsonExporting = ref(false);
const BRANCH_COLOR_PALETTE = [
  { stroke: "#22c55e", fill: "rgba(34, 197, 94, 0.28)" },
  { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.28)" },
  { stroke: "#f97316", fill: "rgba(249, 115, 22, 0.28)" },
  { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.28)" },
  { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.28)" },
  { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.22)" },
  { stroke: "#14b8a6", fill: "rgba(20, 184, 166, 0.28)" },
  { stroke: "#84cc16", fill: "rgba(132, 204, 22, 0.28)" },
];
const availableTariffSources = computed(() => {
  if (!selectedPolygon.value) return [];
  return allPolygons.value.filter(
    (polygon) =>
      polygon.branch_id === selectedPolygon.value.branch_id && polygon.id !== selectedPolygon.value.id && Number(polygon.tariffs_count || 0) > 0,
  );
});
let map = null;
let yandexMaps = null;
let currentLayer = null;
const polygonLayers = new Map();
const renderedPolygonLayers = [];
const importPreviewLayers = [];
let branchesRequestId = 0;
const modalTitle = computed(() => (editing.value ? "Редактировать полигон" : "Новый полигон"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры полигона" : "Добавьте зону доставки"));
const getManagerDefaultCityId = () => {
  if (!isManager.value) return "";
  const allowed = Array.isArray(authStore.user?.cities) ? authStore.user.cities.map((id) => Number(id)).filter(Number.isFinite) : [];
  if (!allowed.length) return "";
  const city = referenceStore.cities.find((item) => allowed.includes(Number(item.id)));
  return city ? String(city.id) : String(allowed[0]);
};
const ensureEditAccess = (message) => {
  if (canManageDeliveryZones.value) return true;
  showWarningNotification(message || "Недостаточно прав для выполнения действия");
  return false;
};
const ensureToggleAccess = (message) => {
  if (canToggleDeliveryZones.value) return true;
  showWarningNotification(message || "Недостаточно прав для выполнения действия");
  return false;
};
const cityPolygons = computed(() => {
  if (!cityId.value) return [];
  return allPolygons.value.filter((polygon) => polygon.city_id === parseInt(cityId.value, 10));
});
const statusFilteredPolygons = computed(() => {
  if (statusFilter.value === "all") {
    return cityPolygons.value;
  } else if (statusFilter.value === "active") {
    return cityPolygons.value.filter((polygon) => polygon.is_active && !isPolygonBlocked(polygon));
  } else if (statusFilter.value === "inactive") {
    return cityPolygons.value.filter((polygon) => !polygon.is_active);
  } else if (statusFilter.value === "blocked") {
    return cityPolygons.value.filter((polygon) => isPolygonBlocked(polygon));
  }
  return cityPolygons.value;
});
const polygonsForSelect = computed(() =>
  statusFilteredPolygons.value
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
    .map((polygon) => ({
      ...polygon,
      branch_name: polygon.branch_name || branches.value.find((branch) => branch.id === polygon.branch_id)?.name || "Без филиала",
    })),
);
const filteredPolygons = computed(() => {
  return statusFilteredPolygons.value;
});
const activeBranchIdForActions = computed(() => {
  const polygonByFilter = filteredPolygons.value.find((polygon) => String(polygon.id) === String(polygonFilterId.value));
  if (polygonByFilter?.branch_id) return String(polygonByFilter.branch_id);
  if (selectedPolygon.value?.branch_id) return String(selectedPolygon.value.branch_id);
  if (branchId.value) return String(branchId.value);
  if (branches.value.length === 1) return String(branches.value[0].id);
  return "";
});
const activeBranchPolygons = computed(() => {
  if (!activeBranchIdForActions.value) return [];
  return cityPolygons.value.filter((polygon) => String(polygon.branch_id) === String(activeBranchIdForActions.value));
});
const branchColorById = computed(() => {
  const mapById = new Map();
  cityPolygons.value
    .map((polygon) => Number(polygon.branch_id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .forEach((branchNumericId, index) => {
      mapById.set(branchNumericId, BRANCH_COLOR_PALETTE[index % BRANCH_COLOR_PALETTE.length]);
    });
  return mapById;
});
const branchLegendItems = computed(() =>
  Array.from(new Set(cityPolygons.value.map((polygon) => Number(polygon.branch_id)).filter(Number.isFinite)))
    .sort((a, b) => a - b)
    .map((branchNumericId) => {
      const color = branchColorById.value.get(branchNumericId) || BRANCH_COLOR_PALETTE[0];
      const branch = branches.value.find((item) => Number(item.id) === branchNumericId);
      return {
        branchId: branchNumericId,
        branchName: branch?.name || `Филиал #${branchNumericId}`,
        stroke: color.stroke,
        fill: color.fill,
      };
    }),
);
const getBranchColor = (branchIdValue) => {
  const numeric = Number(branchIdValue);
  if (!Number.isFinite(numeric)) return BRANCH_COLOR_PALETTE[0];
  return branchColorById.value.get(numeric) || BRANCH_COLOR_PALETTE[numeric % BRANCH_COLOR_PALETTE.length];
};
const activeCityName = computed(() => {
  if (!cityId.value) return "Все города";
  return referenceStore.cities.find((city) => city.id === parseInt(cityId.value, 10))?.name || "Город не выбран";
});
const cityFilterTriggerLabel = computed(() => {
  if (!cityId.value) return "Город: Все";
  const cityName = referenceStore.cities.find((city) => city.id === parseInt(cityId.value, 10))?.name;
  return `Город: ${cityName || "—"}`;
});
const polygonFilterLabel = computed(() => {
  if (!polygonFilterId.value) return "Все зоны";
  const polygon = polygonsForSelect.value.find((item) => String(item.id) === String(polygonFilterId.value));
  return polygon?.name || "Полигон не выбран";
});
const polygonFilterTriggerLabel = computed(() => {
  if (!cityId.value) return "Полигон: выберите город";
  if (!polygonFilterId.value) return "Полигон: Все";
  const polygon = polygonsForSelect.value.find((item) => String(item.id) === String(polygonFilterId.value));
  return `Полигон: ${polygon?.name || "—"}`;
});
const focusedPolygonId = computed(() => {
  if (selectedPolygon.value?.id) return String(selectedPolygon.value.id);
  if (polygonFilterId.value) return String(polygonFilterId.value);
  return "";
});
const statusFilterLabel = computed(() => {
  if (statusFilter.value === "active") return "Активные";
  if (statusFilter.value === "inactive") return "Неактивные";
  if (statusFilter.value === "blocked") return "Заблокированные";
  return "Все полигоны";
});
const statusFilterTriggerLabel = computed(() => {
  if (statusFilter.value === "all") return "Статус: Все";
  if (statusFilter.value === "active") return "Статус: Активные";
  if (statusFilter.value === "inactive") return "Статус: Неактивные";
  if (statusFilter.value === "blocked") return "Статус: Заблокированные";
  return "Статус: —";
});
const bulkTargetIds = computed(() => {
  return selectedPolygons.value;
});
const bulkTargetCount = computed(() => bulkTargetIds.value.length);
const isBulkModeActive = computed(() => bulkMode.value === "transfer" || bulkMode.value === "block");
const bulkModeTitle = computed(() => (bulkMode.value === "transfer" ? "Групповое переключение" : "Групповая блокировка"));
const bulkModeActionLabel = computed(() => (bulkMode.value === "transfer" ? "Переключить" : "Заблокировать"));
const bulkSelectedPolygons = computed(() => {
  const selectedIds = new Set(selectedPolygons.value.map((id) => Number(id)));
  return allPolygons.value.filter((polygon) => selectedIds.has(Number(polygon.id)));
});
const loadBranches = async () => {
  if (!cityId.value) {
    branches.value = [];
    return;
  }
  const requestId = ++branchesRequestId;
  try {
    const response = await api.get(`/api/cities/${cityId.value}/branches`);
    if (requestId === branchesRequestId) {
      branches.value = response.data.branches || [];
    }
  } catch (error) {
    devError("Ошибка загрузки филиалов:", error);
    if (requestId === branchesRequestId) {
      branches.value = [];
    }
  }
};
const loadAllPolygons = async () => {
  try {
    const response = await api.get("/api/polygons/admin/all");
    allPolygons.value = response.data.polygons || [];
  } catch (error) {
    devError("Ошибка загрузки всех полигонов:", error);
    allPolygons.value = [];
  }
};
const isValidLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const calcCenter = (coords = []) => {
  if (!coords.length) return null;
  const sum = coords.reduce((acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
};
const distanceSq = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
};
const getReferenceCenter = () => {
  const selectedBranch = branches.value.find((branch) => String(branch.id) === String(activeBranchIdForActions.value));
  if (selectedBranch?.latitude && selectedBranch?.longitude) {
    return { lat: Number(selectedBranch.latitude), lng: Number(selectedBranch.longitude) };
  }
  if (cityId.value) {
    const selectedCity = referenceStore.cities.find((city) => city.id === parseInt(cityId.value, 10));
    if (selectedCity?.latitude && selectedCity?.longitude) {
      return { lat: Number(selectedCity.latitude), lng: Number(selectedCity.longitude) };
    }
  }
  if (map) {
    const center = map.getCenter();
    return { lat: Number(center?.[0]), lng: Number(center?.[1]) };
  }
  return null;
};
const toLeafletCoords = (coords = [], referenceCenter = null) => {
  const points = coords.filter((coord) => Array.isArray(coord) && coord.length >= 2);
  const fromGeoJson = points.map((coord) => [Number(coord[1]), Number(coord[0])]).filter(([lat, lng]) => isValidLatLng(lat, lng));
  const legacyLatLng = points.map((coord) => [Number(coord[0]), Number(coord[1])]).filter(([lat, lng]) => isValidLatLng(lat, lng));
  if (!legacyLatLng.length) return fromGeoJson;
  if (!fromGeoJson.length) return legacyLatLng;
  if (!referenceCenter) return fromGeoJson;
  const geoJsonCenter = calcCenter(fromGeoJson);
  const legacyCenter = calcCenter(legacyLatLng);
  return distanceSq(geoJsonCenter, referenceCenter) <= distanceSq(legacyCenter, referenceCenter) ? fromGeoJson : legacyLatLng;
};

const ensureYandex = async () => {
  if (yandexMaps) return yandexMaps;
  yandexMaps = await loadYandexMaps();
  return yandexMaps;
};

const calcBounds = (coords = []) => {
  if (!Array.isArray(coords) || !coords.length) return null;
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  coords.forEach((coord) => {
    const lat = Number(coord?.[0]);
    const lng = Number(coord?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng) || !Number.isFinite(maxLat) || !Number.isFinite(maxLng)) {
    return null;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

const clearRenderedPolygons = () => {
  polygonLayers.clear();
  while (renderedPolygonLayers.length) {
    const layer = renderedPolygonLayers.pop();
    if (map) {
      map.geoObjects.remove(layer);
    }
  }
};

const clearGeoJsonImportPreview = () => {
  while (importPreviewLayers.length) {
    const layer = importPreviewLayers.pop();
    if (map) {
      map.geoObjects.remove(layer);
    }
  }
};
const renderGeoJsonImportPreview = () => {
  if (!map || !yandexMaps) return;
  clearGeoJsonImportPreview();
  if (!showGeoJsonImportDialog.value || !geoJsonImportItems.value.length) return;
  const previewPoints = [];
  geoJsonImportItems.value.forEach((item) => {
    const coords = toLeafletCoords(item.polygon, getReferenceCenter());
    if (coords.length < 3) return;
    const layer = new yandexMaps.Polygon(
      [coords],
      {},
      {
        strokeColor: "#0ea5e9",
        fillColor: "rgba(56, 189, 248, 0.38)",
        fillOpacity: 0.4,
        strokeWidth: 4,
        strokeStyle: "shortdash",
        opacity: 1,
        interactivityModel: "default#silent",
      },
    );
    importPreviewLayers.push(layer);
    map.geoObjects.add(layer);
    previewPoints.push(...coords);
  });
  const bounds = calcBounds(previewPoints);
  if (bounds) {
    map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 28 });
  }
};
const resolveCoordinateOrder = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["lng_lat", "lon_lat", "longitude_latitude", "geojson"].includes(normalized)) {
    return "lng_lat";
  }
  if (["lat_lng", "lat_lon", "latitude_longitude", "legacy"].includes(normalized)) {
    return "lat_lng";
  }
  return null;
};
const normalizePolygonRing = (ring, referenceCenter = null, preferredOrder = null) => {
  if (!Array.isArray(ring)) return null;
  const rawCoords = ring
    .filter((coord) => Array.isArray(coord) && coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1])))
    .map((coord) => [Number(coord[0]), Number(coord[1])]);
  if (rawCoords.length < 3) return null;

  // Импортируем в едином формате [lng, lat] для корректного сохранения в PostGIS.
  // Вход может быть как стандартный GeoJSON [lng, lat], так и legacy [lat, lng].
  let normalizedCoords = rawCoords;
  const resolvedOrder = resolveCoordinateOrder(preferredOrder);
  const hasClearlyGeoOrder = rawCoords.some((coord) => Math.abs(coord[0]) > 90) && rawCoords.every((coord) => Math.abs(coord[1]) <= 90);
  const hasClearlyLegacyOrder = rawCoords.some((coord) => Math.abs(coord[1]) > 90) && rawCoords.every((coord) => Math.abs(coord[0]) <= 90);

  if (resolvedOrder === "lat_lng") {
    normalizedCoords = rawCoords.map((coord) => [coord[1], coord[0]]);
  } else if (resolvedOrder !== "lng_lat" && hasClearlyLegacyOrder && !hasClearlyGeoOrder) {
    normalizedCoords = rawCoords.map((coord) => [coord[1], coord[0]]);
  } else if (resolvedOrder !== "lng_lat" && !hasClearlyGeoOrder && !hasClearlyLegacyOrder && referenceCenter) {
    const geoLatLng = rawCoords.map((coord) => [coord[1], coord[0]]).filter(([lat, lng]) => isValidLatLng(lat, lng));
    const legacyLatLng = rawCoords.map((coord) => [coord[0], coord[1]]).filter(([lat, lng]) => isValidLatLng(lat, lng));
    const geoCenter = calcCenter(geoLatLng);
    const legacyCenter = calcCenter(legacyLatLng);
    const useLegacyOrder = distanceSq(legacyCenter, referenceCenter) < distanceSq(geoCenter, referenceCenter);
    if (useLegacyOrder) {
      normalizedCoords = rawCoords.map((coord) => [coord[1], coord[0]]);
    }
  }

  if (!normalizedCoords.every(([lng, lat]) => isValidLatLng(lat, lng))) {
    return null;
  }

  const coords = normalizedCoords;
  const [firstLng, firstLat] = coords[0];
  const [lastLng, lastLat] = coords[coords.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    coords.push([firstLng, firstLat]);
  }
  return coords;
};
const parseDeliveryTime = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
};
const normalizeTariffNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const normalizeTariffAmountTo = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return normalizeTariffNumber(value);
};
const parseTariffsFromFeature = (feature) => {
  const rawTariffs = feature?.properties?.tariffs || feature?.properties?.delivery_tariffs;
  if (!Array.isArray(rawTariffs)) return [];

  return rawTariffs
    .map((tariff) => {
      const amountFrom = normalizeTariffNumber(tariff?.amount_from);
      const amountTo = normalizeTariffAmountTo(tariff?.amount_to);
      const deliveryCost = normalizeTariffNumber(tariff?.delivery_cost);
      if (amountFrom === null || deliveryCost === null) return null;
      return {
        amount_from: amountFrom,
        amount_to: amountTo,
        delivery_cost: deliveryCost,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.amount_from - b.amount_from);
};
const readGeoJsonFeatures = (geoJson) => {
  if (!geoJson || typeof geoJson !== "object") return [];
  if (geoJson.type === "FeatureCollection") {
    return Array.isArray(geoJson.features) ? geoJson.features : [];
  }
  if (geoJson.type === "Feature") {
    return [geoJson];
  }
  if (geoJson.type === "Polygon" || geoJson.type === "MultiPolygon") {
    return [{ type: "Feature", properties: {}, geometry: geoJson }];
  }
  return [];
};
const convertFeatureToImportItems = (feature, index) => {
  const geometry = feature?.geometry;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    return [];
  }
  const baseName =
    typeof feature?.properties?.name === "string" && feature.properties.name.trim() ? feature.properties.name.trim() : `Импорт #${index + 1}`;
  const deliveryTime = parseDeliveryTime(feature?.properties?.delivery_time);
  const minOrderAmount = normalizeTariffNumber(feature?.properties?.min_order_amount) ?? 0;
  const deliveryCost = normalizeTariffNumber(feature?.properties?.delivery_cost) ?? 0;
  const tariffs = parseTariffsFromFeature(feature);
  const referenceCenter = getReferenceCenter();
  const preferredOrder = resolveCoordinateOrder(feature?.properties?.coordinates_order || feature?.properties?.coordinate_order);
  if (geometry.type === "Polygon") {
    const ring = normalizePolygonRing(geometry.coordinates?.[0], referenceCenter, preferredOrder);
    return ring
      ? [{ name: baseName, delivery_time: deliveryTime, min_order_amount: minOrderAmount, delivery_cost: deliveryCost, polygon: ring, tariffs }]
      : [];
  }
  return (geometry.coordinates || [])
    .map((polygonCoords, partIndex) => {
      const ring = normalizePolygonRing(polygonCoords?.[0], referenceCenter, preferredOrder);
      if (!ring) return null;
      return {
        name: `${baseName} (${partIndex + 1})`,
        delivery_time: deliveryTime,
        min_order_amount: minOrderAmount,
        delivery_cost: deliveryCost,
        polygon: ring,
        tariffs,
      };
    })
    .filter(Boolean);
};
const closeGeoJsonImportDialog = () => {
  showGeoJsonImportDialog.value = false;
  geoJsonImportFileName.value = "";
  geoJsonImportItems.value = [];
  geoJsonImportSaving.value = false;
  clearGeoJsonImportPreview();
  if (geoJsonInputRef.value) {
    geoJsonInputRef.value.value = "";
  }
};
const closeBulkMode = () => {
  bulkMode.value = "";
  mapSelectionMode.value = false;
  selectedPolygons.value = [];
};
const activateBulkMode = (mode) => {
  if (!ensureToggleAccess("Недостаточно прав для групповых операций")) return;
  if (showSidebar.value) {
    closeSidebar();
  }
  bulkMode.value = mode;
  mapSelectionMode.value = true;
};
const removeSelectedPolygon = (polygonId) => {
  selectedPolygons.value = selectedPolygons.value.filter((id) => Number(id) !== Number(polygonId));
};
const submitBulkModeAction = () => {
  if (bulkMode.value === "transfer") {
    openBulkTransferDialog();
    return;
  }
  if (bulkMode.value === "block") {
    bulkBlock();
  }
};
const triggerGeoJsonImport = () => {
  if (!activeBranchIdForActions.value || !geoJsonInputRef.value) return;
  geoJsonInputRef.value.click();
};
const handleGeoJsonFileChange = async (event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const features = readGeoJsonFeatures(payload);
    if (!features.length) {
      showErrorNotification("Файл не содержит поддерживаемых GeoJSON-объектов");
      return;
    }
    const imported = features.flatMap((feature, index) => convertFeatureToImportItems(feature, index));
    if (!imported.length) {
      showErrorNotification("В файле нет корректных полигонов для импорта");
      return;
    }
    geoJsonImportFileName.value = file.name;
    geoJsonImportItems.value = imported;
    showGeoJsonImportDialog.value = true;
    renderGeoJsonImportPreview();
  } catch (error) {
    devError("Ошибка чтения GeoJSON:", error);
    showErrorNotification("Не удалось прочитать GeoJSON-файл");
  } finally {
    if (geoJsonInputRef.value) {
      geoJsonInputRef.value.value = "";
    }
  }
};
const confirmGeoJsonImport = async () => {
  if (!activeBranchIdForActions.value || !geoJsonImportItems.value.length || geoJsonImportSaving.value) return;
  geoJsonImportSaving.value = true;
  const total = geoJsonImportItems.value.length;
  try {
    for (const item of geoJsonImportItems.value) {
      const createResponse = await api.post("/api/polygons/admin", {
        branch_id: parseInt(activeBranchIdForActions.value, 10),
        name: item.name,
        delivery_time: item.delivery_time,
        min_order_amount: item.min_order_amount,
        delivery_cost: item.delivery_cost,
        polygon: item.polygon,
      });
      const polygonId = Number(createResponse?.data?.polygon?.id);
      if (Number.isFinite(polygonId) && Array.isArray(item.tariffs) && item.tariffs.length > 0) {
        await api.put(`/api/polygons/admin/${polygonId}/tariffs`, {
          tariffs: item.tariffs,
        });
      }
    }
    await loadAllPolygons();
    closeGeoJsonImportDialog();
    showSuccessNotification(`Импортировано полигонов: ${total}`);
  } catch (error) {
    devError("Ошибка импорта GeoJSON:", error);
    const message = error?.response?.data?.error || "Не удалось импортировать GeoJSON";
    showErrorNotification(message);
  } finally {
    geoJsonImportSaving.value = false;
  }
};
const sanitizeFileName = (value) => value.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, "_").replace(/^_+|_+$/g, "");
const exportGeoJson = async () => {
  if (!activeBranchIdForActions.value || !activeBranchPolygons.value.length) {
    showWarningNotification("Нет полигонов для экспорта");
    return;
  }
  geoJsonExporting.value = true;
  try {
    const branchName =
      branches.value.find((branch) => String(branch.id) === String(activeBranchIdForActions.value))?.name ||
      `branch_${activeBranchIdForActions.value}`;
    const polygonsForExport = activeBranchPolygons.value.filter(
      (polygon) => polygon?.polygon?.type === "Polygon" && Array.isArray(polygon?.polygon?.coordinates),
    );
    if (!polygonsForExport.length) {
      showWarningNotification("Нет полигонов для экспорта");
      return;
    }

    const features = await Promise.all(
      polygonsForExport.map(async (polygon) => {
        let tariffs = [];
        try {
          const response = await api.get(`/api/polygons/admin/${polygon.id}/tariffs`);
          tariffs = Array.isArray(response?.data?.tariffs) ? response.data.tariffs : [];
        } catch (error) {
          tariffs = [];
        }

        const exportCoordinates = (polygon.polygon.coordinates || []).map((ring) =>
          (Array.isArray(ring) ? ring : [])
            .filter((coord) => Array.isArray(coord) && coord.length >= 2)
            .map((coord) => [Number(coord[1]), Number(coord[0])]),
        );

        return {
          type: "Feature",
          properties: {
            id: polygon.id,
            name: polygon.name || "",
            delivery_time: polygon.delivery_time || 30,
            min_order_amount: Number(polygon.min_order_amount || 0),
            delivery_cost: Number(polygon.delivery_cost || 0),
            is_active: Boolean(polygon.is_active),
            tariffs_count: Number(polygon.tariffs_count || 0),
            coordinates_order: "lat_lng",
            coordinate_order: "lat_lng",
            tariffs: tariffs.map((tariff) => ({
              amount_from: Number(tariff.amount_from),
              amount_to: tariff.amount_to === null || tariff.amount_to === undefined ? null : Number(tariff.amount_to),
              delivery_cost: Number(tariff.delivery_cost),
            })),
          },
          geometry: {
            type: "Polygon",
            coordinates: exportCoordinates,
          },
        };
      }),
    );

    const featureCollection = {
      type: "FeatureCollection",
      features,
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: "application/geo+json;charset=utf-8" });
    const fileName = `${sanitizeFileName(branchName)}_polygons.geojson`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showSuccessNotification(`GeoJSON экспортирован: ${fileName}`);
  } catch (error) {
    devError("Ошибка экспорта GeoJSON:", error);
    showErrorNotification("Не удалось экспортировать GeoJSON");
  } finally {
    geoJsonExporting.value = false;
  }
};
const onCityChange = async () => {
  branchId.value = "";
  polygonFilterId.value = "";
  selectedPolygons.value = [];
  mapSelectionMode.value = false;
  bulkMode.value = "";
  closeGeoJsonImportDialog();
  await loadBranches();
  await loadAllPolygons();
  if (map) {
    map.destroy();
    map = null;
  }
  clearRenderedPolygons();
  clearGeoJsonImportPreview();
  currentLayer = null;
  await nextTick();
  await initMap();
};
const onPolygonFilterChange = () => {
  selectedPolygons.value = [];
  if (!polygonFilterId.value) return;
  const polygon = cityPolygons.value.find((item) => String(item.id) === String(polygonFilterId.value));
  if (polygon?.branch_id) {
    branchId.value = String(polygon.branch_id);
  }
  if (polygon) {
    focusPolygonOnMap(polygon, true);
  }
};
const zoomInMap = () => {
  if (!map) return;
  map.setZoom(map.getZoom() + 1, { duration: 120 });
};
const zoomOutMap = () => {
  if (!map) return;
  map.setZoom(map.getZoom() - 1, { duration: 120 });
};
const initMap = async () => {
  const ymaps = await ensureYandex();
  if (map) {
    map.destroy();
    map = null;
  }
  const container = document.getElementById("map");
  if (!container) return;
  let center = [55.751244, 37.618423];
  const selectedBranch = branches.value.find((b) => String(b.id) === String(activeBranchIdForActions.value));
  if (selectedBranch?.latitude && selectedBranch?.longitude) {
    center = [selectedBranch.latitude, selectedBranch.longitude];
  } else if (cityId.value) {
    const selectedCity = referenceStore.cities.find((c) => c.id === parseInt(cityId.value));
    if (selectedCity?.latitude && selectedCity?.longitude) {
      center = [selectedCity.latitude, selectedCity.longitude];
    }
  }
  map = new ymaps.Map(
    container,
    {
      center,
      zoom: 12,
      controls: [],
    },
    {
      suppressMapOpenBlock: true,
    },
  );
  renderPolygonsOnMap();
  renderGeoJsonImportPreview();
};
const renderPolygonsOnMap = () => {
  if (!map || !yandexMaps) return;
  clearRenderedPolygons();
  const isImportPreviewActive = showGeoJsonImportDialog.value && geoJsonImportItems.value.length > 0;
  const visiblePolygons = filteredPolygons.value;
  const referenceCenter = getReferenceCenter();
  visiblePolygons.forEach((polygon) => {
    if (!polygon.polygon) return;
    const isFocused = focusedPolygonId.value && String(polygon.id) === focusedPolygonId.value;
    const isSelectedForBulk = selectedPolygons.value.includes(polygon.id);
    const branchColor = getBranchColor(polygon.branch_id);
    let fillColor = branchColor.fill;
    let strokeColor = branchColor.stroke;
    let fillOpacity = 0.38;
    if (isPolygonBlocked(polygon)) {
      strokeColor = MAP_DANGER;
      fillOpacity = 0.2;
    } else if (!polygon.is_active) {
      fillColor = "rgba(148, 163, 184, 0.22)";
      strokeColor = branchColor.stroke;
      fillOpacity = 0.22;
    }
    if (isFocused || isSelectedForBulk) {
      fillColor = hexToRgba(branchColor.stroke, 0.68);
      fillOpacity = 0.96;
      strokeColor = branchColor.stroke;
    }
    const rawCoords = polygon.polygon?.coordinates?.[0];
    if (!rawCoords?.length) return;
    const coords = toLeafletCoords(rawCoords, referenceCenter);
    if (!coords.length) return;
    const layer = new yandexMaps.Polygon(
      [coords],
      {},
      {
        strokeColor,
        fillColor,
        fillOpacity: isImportPreviewActive ? Math.min(fillOpacity, 0.08) : fillOpacity,
        strokeWidth: isImportPreviewActive ? 2 : 3,
        opacity: isImportPreviewActive ? 0.35 : isFocused ? 1 : 0.9,
      },
    );
    layer.events.add("click", () => {
      if (mapSelectionMode.value && canToggleDeliveryZones.value) {
        toggleMapPolygonSelection(polygon.id);
        return;
      }
      openPolygonSidebar(polygon);
    });
    let statusBadge = "";
    if (isPolygonBlocked(polygon)) {
      statusBadge =
        '<span style="display: inline-block; background: rgba(239,68,68,0.12); color: #ef4444; padding: 2px 6px; border-radius: 999px; font-size: 11px; margin-top: 4px;">Заблокирован</span>';
    } else if (!polygon.is_active) {
      statusBadge =
        '<span style="display: inline-block; background: rgba(148,163,184,0.18); color: #94a3b8; padding: 2px 6px; border-radius: 999px; font-size: 11px; margin-top: 4px;">Неактивен</span>';
    }
    const popupContent = `
      <div class="space-y-1.5 font-sans">
        <div class="text-sm font-semibold text-foreground">${polygon.name || `Полигон #${polygon.id}`}</div>
        <div class="text-xs text-muted-foreground">${polygon.branch_name || ""}</div>
        <div class="grid gap-1 text-xs text-muted-foreground">
          <div>Время доставки: ${polygon.delivery_time || 30} мин</div>
          <div style="background: inherit;">Мин. заказ: ${Number(polygon.tariffs_count || 0) > 0 ? "по тарифам" : `${Number(polygon.min_order_amount || 0)} ₽`}</div>
          <div style="background: inherit;">Доставка: ${Number(polygon.tariffs_count || 0) > 0 ? "по тарифам" : `${Number(polygon.delivery_cost || 0)} ₽`}</div>
          <div>Тарифы: ${Number(polygon.tariffs_count || 0)} шт.</div>
        </div>
        ${statusBadge}
      </div>
    `;
    layer.properties.set("balloonContentBody", popupContent);
    map.geoObjects.add(layer);
    renderedPolygonLayers.push(layer);
    polygonLayers.set(polygon.id, layer);
  });
};
const saveDeliveryZonesContext = () => {
  const additionalData = {
    branchId: branchId.value,
    polygonFilterId: polygonFilterId.value,
    statusFilter: statusFilter.value,
  };
  if (map) {
    const center = map.getCenter();
    additionalData.mapCenter = { lat: Number(center?.[0]), lng: Number(center?.[1]) };
  }
  saveContext({ cityId: cityId.value }, additionalData);
};
const startDrawing = () => {
  const targetBranchId = activeBranchIdForActions.value;
  if (!targetBranchId) {
    showWarningNotification("Выберите полигон филиала, чтобы определить филиал для новой зоны");
    return;
  }
  if (!ensureEditAccess("Недостаточно прав для создания полигона")) return;
  saveDeliveryZonesContext();
  router.push({
    name: "delivery-zone-editor",
    params: { branchId: targetBranchId, polygonId: "new" },
    query: { cityId: cityId.value },
  });
};
const editPolygon = (polygon) => {
  if (!ensureEditAccess("Недостаточно прав для редактирования полигона")) return;
  saveDeliveryZonesContext();
  router.push({
    name: "delivery-zone-editor",
    params: { branchId: polygon.branch_id, polygonId: polygon.id },
    query: { cityId: cityId.value },
  });
};
const deletePolygon = async (polygon) => {
  if (!ensureEditAccess("Недостаточно прав для удаления полигона")) return;
  if (!confirm("Удалить полигон?")) return;
  try {
    await api.delete(`/api/polygons/admin/${polygon.id}`);
    await loadAllPolygons();
  } catch (error) {
    devError("Ошибка удаления полигона:", error);
    showErrorNotification("Не удалось удалить полигон");
  }
};
const isPolygonBlocked = (polygon) => {
  if (!polygon.is_blocked) return false;
  if (!polygon.blocked_from || !polygon.blocked_until) return true;
  const now = new Date();
  const from = new Date(polygon.blocked_from);
  const until = new Date(polygon.blocked_until);
  return now >= from && now <= until;
};
const getPolygonStatusLabel = (polygon) => {
  if (isPolygonBlocked(polygon)) return "Заблокирован";
  return polygon.is_active ? "Активен" : "Неактивен";
};
const getPolygonStatusClass = (polygon) => {
  if (isPolygonBlocked(polygon)) return "bg-red-500/10 text-red-600";
  return polygon.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground";
};
const focusPolygonOnMap = (polygon, openSidebar = false) => {
  if (!polygon?.id) return;
  const layer = polygonLayers.get(polygon.id);
  if (map && layer?.geometry?.getBounds) {
    const bounds = layer.geometry.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 36 });
    }
  }
  if (openSidebar) {
    openPolygonSidebar(polygon);
  }
};
const toStartOfDay = (value) => {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T00:00`;
};
const toEndOfDay = (value) => {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T23:59`;
};
const showBlockModal = (polygon) => {
  blockingPolygon.value = polygon;
  blockForm.value = {
    blockType: "permanent",
    blocked_from: "",
    blocked_until: "",
    block_reason: "",
  };
  showBlockModalWindow.value = true;
};
const closeBlockModal = () => {
  showBlockModalWindow.value = false;
  blockingPolygon.value = null;
  blockForm.value = {
    blockType: "permanent",
    blocked_from: "",
    blocked_until: "",
    block_reason: "",
  };
};
const submitBlock = async () => {
  if (!ensureToggleAccess("Недостаточно прав для блокировки зон доставки")) return;
  if (!blockingPolygon.value) return;
  try {
    const payload = {
      block_reason: blockForm.value.block_reason || null,
    };
    if (blockForm.value.blockType === "temporary") {
      if (!blockForm.value.blocked_from || !blockForm.value.blocked_until) {
        showWarningNotification("Укажите период блокировки");
        return;
      }
      payload.blocked_from = toStartOfDay(blockForm.value.blocked_from);
      payload.blocked_until = toEndOfDay(blockForm.value.blocked_until);
    }
    if (blockingPolygon.value.id === "bulk") {
      await api.post("/api/polygons/admin/bulk-block", {
        polygon_ids: blockingPolygon.value.ids,
        ...payload,
      });
      selectedPolygons.value = [];
      mapSelectionMode.value = false;
      bulkMode.value = "";
    } else {
      await api.post(`/api/polygons/admin/${blockingPolygon.value.id}/block`, payload);
    }
    await loadAllPolygons();
    closeBlockModal();
  } catch (error) {
    devError("Ошибка блокировки полигона:", error);
    showErrorNotification("Не удалось заблокировать полигон");
  }
};
const unblockPolygon = async (polygon) => {
  if (!ensureToggleAccess("Недостаточно прав для разблокировки зон доставки")) return;
  if (!confirm("Разблокировать полигон?")) return;
  try {
    await api.post(`/api/polygons/admin/${polygon.id}/unblock`);
    await loadAllPolygons();
  } catch (error) {
    devError("Ошибка разблокировки полигона:", error);
    showErrorNotification("Не удалось разблокировать полигон");
  }
};
const onFilterChange = () => {
  nextTick(() => {
    if (map) {
      renderPolygonsOnMap();
    }
  });
};
const toggleMapPolygonSelection = (polygonId) => {
  const index = selectedPolygons.value.indexOf(polygonId);
  if (index === -1) {
    selectedPolygons.value.push(polygonId);
  } else {
    selectedPolygons.value.splice(index, 1);
  }
};
const openBulkTransferDialog = () => {
  if (!ensureToggleAccess("Недостаточно прав для группового переключения зон")) return;
  if (!bulkTargetCount.value) {
    mapSelectionMode.value = true;
    showWarningNotification("Выберите полигоны на карте для группового переключения");
    return;
  }
  selectedPolygons.value = [...bulkTargetIds.value];
  bulkTransferBranchId.value = "";
  showBulkTransferDialog.value = true;
};
const closeBulkTransferDialog = () => {
  showBulkTransferDialog.value = false;
  bulkTransferBranchId.value = "";
  bulkTransferSaving.value = false;
};
const submitBulkTransfer = async () => {
  if (!bulkTransferBranchId.value || !selectedPolygons.value.length) return;
  bulkTransferSaving.value = true;
  try {
    const results = await Promise.allSettled(
      selectedPolygons.value.map((polygonId) =>
        api.post(`/api/polygons/admin/${polygonId}/transfer`, {
          new_branch_id: Number(bulkTransferBranchId.value),
        }),
      ),
    );
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    await loadAllPolygons();
    mapSelectionMode.value = false;
    selectedPolygons.value = [];
    bulkMode.value = "";
    closeBulkTransferDialog();
    if (failedCount > 0) {
      showWarningNotification(`Перенесено: ${successCount}, ошибок: ${failedCount}`);
    } else {
      showSuccessNotification(`Перенесено: ${successCount}`);
    }
  } catch (error) {
    devError("Ошибка группового переключения зон:", error);
    showErrorNotification("Не удалось выполнить групповое переключение");
  } finally {
    bulkTransferSaving.value = false;
  }
};
const bulkBlock = () => {
  if (!ensureToggleAccess("Недостаточно прав для блокировки зон доставки")) return;
  if (!bulkTargetCount.value) {
    mapSelectionMode.value = true;
    showWarningNotification("Выберите полигоны на карте для групповой блокировки");
    return;
  }
  selectedPolygons.value = [...bulkTargetIds.value];
  const firstPolygon = filteredPolygons.value.find((p) => p.id === selectedPolygons.value[0]);
  if (firstPolygon) {
    blockingPolygon.value = { id: "bulk", ids: selectedPolygons.value };
    blockForm.value = {
      blockType: "permanent",
      blocked_from: "",
      blocked_until: "",
      block_reason: "",
    };
    showBlockModalWindow.value = true;
  }
};
const getPluralForm = (count) => {
  const cases = [2, 0, 1, 1, 1, 2];
  const titles = ["полигон", "полигона", "полигонов"];
  return titles[count % 100 > 4 && count % 100 < 20 ? 2 : cases[Math.min(count % 10, 5)]];
};
const loadTariffsForPolygon = async (polygonId) => {
  if (!polygonId) return;
  tariffsLoading.value = true;
  try {
    const response = await api.get(`/api/polygons/admin/${polygonId}/tariffs`);
    selectedTariffs.value = response.data?.tariffs || [];
  } catch (error) {
    devError("Ошибка загрузки тарифов:", error);
    showErrorNotification("Не удалось загрузить тарифы");
  } finally {
    tariffsLoading.value = false;
  }
};
const openPolygonSidebar = (polygon) => {
  const branchName = branches.value.find((branch) => branch.id === polygon.branch_id)?.name || "";
  const enrichedPolygon = {
    ...polygon,
    branch_name: polygon.branch_name || branchName,
  };
  if (editingPolygonId.value && editingPolygonId.value !== polygon.id) {
    stopPolygonEditing();
  }
  selectedPolygon.value = enrichedPolygon;
  showMobileFilters.value = false;
  showSidebar.value = true;
  selectedTariffs.value = [];
  loadTariffsForPolygon(enrichedPolygon.id);
};
const closeSidebar = () => {
  stopPolygonEditing();
  showSidebar.value = false;
  setTimeout(() => {
    selectedPolygon.value = null;
    selectedTariffs.value = [];
  }, 300);
};
const openTariffEditor = () => {
  if (!selectedPolygon.value) return;
  if (!ensureEditAccess("Недостаточно прав для редактирования тарифов")) return;
  tariffEditorOpen.value = true;
};
const saveTariffs = async (payload) => {
  if (!selectedPolygon.value) return;
  if (!ensureEditAccess("Недостаточно прав для сохранения тарифов")) return;
  try {
    const response = await api.put(`/api/polygons/admin/${selectedPolygon.value.id}/tariffs`, { tariffs: payload });
    selectedTariffs.value = response.data?.tariffs || [];
    tariffEditorOpen.value = false;
    showSuccessNotification("Тарифы сохранены");
    await loadAllPolygons();
  } catch (error) {
    devError("Ошибка сохранения тарифов:", error);
    const message = error?.response?.data?.errors?.[0] || "Ошибка сохранения тарифов";
    showErrorNotification(message);
  }
};
const openTariffCopy = () => {
  if (!ensureEditAccess("Недостаточно прав для копирования тарифов")) return;
  tariffCopyOpen.value = true;
  tariffCopySource.value = "";
  tariffCopyPreview.value = [];
};
const closeTariffCopy = () => {
  tariffCopyOpen.value = false;
  tariffCopySource.value = "";
  tariffCopyPreview.value = [];
};
const selectTariffCopySource = async (value) => {
  tariffCopySource.value = value;
  tariffCopyPreview.value = [];
  if (!value) return;
  try {
    const response = await api.get(`/api/polygons/admin/${value}/tariffs`);
    tariffCopyPreview.value = response.data?.tariffs || [];
  } catch (error) {
    devError("Ошибка предпросмотра тарифов:", error);
    showErrorNotification("Не удалось загрузить тарифы для копирования");
  }
};
const confirmTariffCopy = async (value) => {
  if (!selectedPolygon.value || !value) return;
  if (!ensureEditAccess("Недостаточно прав для копирования тарифов")) return;
  try {
    const response = await api.post(`/api/polygons/admin/${selectedPolygon.value.id}/tariffs/copy`, { source_polygon_id: value });
    selectedTariffs.value = response.data?.tariffs || [];
    closeTariffCopy();
    showSuccessNotification("Тарифы скопированы");
    await loadAllPolygons();
  } catch (error) {
    devError("Ошибка копирования тарифов:", error);
    const message = error?.response?.data?.error || "Не удалось скопировать тарифы";
    showErrorNotification(message);
  }
};
const savePolygonFromSidebar = async (data) => {
  const hasManageAccess = canManageDeliveryZones.value;
  if (!hasManageAccess && !ensureToggleAccess("Недостаточно прав для переключения зоны")) return;
  try {
    const payload = hasManageAccess
      ? {
          name: data.name,
          delivery_time: data.delivery_time,
          min_order_amount: Math.max(0, Number(data.min_order_amount) || 0),
          delivery_cost: Math.max(0, Number(data.delivery_cost) || 0),
          is_active: data.is_active ? 1 : 0,
        }
      : {
          is_active: data.is_active ? 1 : 0,
        };
    await api.put(`/api/polygons/admin/${data.id}`, payload);
    await loadAllPolygons();
    showSuccessNotification("Полигон сохранен");
    stopPolygonEditing();
    closeSidebar();
  } catch (error) {
    devError("Ошибка сохранения полигона:", error);
    showErrorNotification("Не удалось сохранить изменения");
  }
};
const showBlockModalFromSidebar = (polygon) => {
  if (!ensureToggleAccess("Недостаточно прав для блокировки зон доставки")) return;
  closeSidebar();
  showBlockModal(polygon);
};
const unblockPolygonFromSidebar = async (polygon) => {
  closeSidebar();
  await unblockPolygon(polygon);
};
const deletePolygonFromSidebar = async (polygon) => {
  if (!ensureEditAccess("Недостаточно прав для удаления полигона")) return;
  closeSidebar();
  await deletePolygon(polygon);
};
const transferPolygon = async (data) => {
  if (!ensureToggleAccess("Недостаточно прав для переключения зоны")) return;
  try {
    await api.post(`/api/polygons/admin/${data.polygonId}/transfer`, {
      new_branch_id: data.newBranchId,
    });
    await loadAllPolygons();
    closeSidebar();
  } catch (error) {
    devError("Ошибка переноса полигона:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось перенести полигон");
  }
};
const startRedrawPolygon = (polygon) => {
  editPolygon(polygon);
};
const stopPolygonEditing = () => {
  editingPolygonId.value = null;
  currentLayer = null;
};
const closeModal = () => {
  showModal.value = false;
  editing.value = null;
  renderPolygonsOnMap();
  form.value = {
    name: "",
    delivery_time: 30,
    min_order_amount: 0,
    delivery_cost: 0,
  };
};
const submitPolygon = async () => {
  if (!ensureEditAccess("Недостаточно прав для сохранения полигона")) return;
  if (!activeBranchIdForActions.value) {
    showWarningNotification("Выберите полигон филиала для определения целевого филиала");
    return;
  }
  if (!currentLayer?.geometry?.getCoordinates) {
    showWarningNotification("Сначала нарисуйте полигон");
    return;
  }
  const ring = currentLayer.geometry.getCoordinates()?.[0] || [];
  const normalizedRing = ring.filter((coord) => Array.isArray(coord) && coord.length >= 2).map((coord) => [Number(coord[1]), Number(coord[0])]);
  if (normalizedRing.length < 3) {
    showWarningNotification("Полигон содержит недостаточно точек");
    return;
  }
  const [firstLng, firstLat] = normalizedRing[0];
  const [lastLng, lastLat] = normalizedRing[normalizedRing.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    normalizedRing.push([firstLng, firstLat]);
  }
  try {
    const payload = {
      branch_id: parseInt(activeBranchIdForActions.value, 10),
      name: form.value.name,
      delivery_time: form.value.delivery_time,
      min_order_amount: Math.max(0, Number(form.value.min_order_amount) || 0),
      delivery_cost: Math.max(0, Number(form.value.delivery_cost) || 0),
      polygon: normalizedRing,
    };
    if (editing.value) {
      await api.put(`/api/polygons/admin/${editing.value.id}`, payload);
    } else {
      await api.post("/api/polygons/admin", payload);
    }
    await loadAllPolygons();
    showSuccessNotification(editing.value ? "Полигон обновлен" : "Полигон создан");
    closeModal();
  } catch (error) {
    devError("Ошибка сохранения полигона:", error);
    showErrorNotification("Ошибка сохранения полигона");
  }
};
watch(
  () => showModal.value,
  (open) => {
    if (!open && currentLayer && !editing.value && map) {
      map.geoObjects.remove(currentLayer);
      currentLayer = null;
    }
  },
);
watch(
  () => [allPolygons.value, cityId.value, branchId.value, polygonFilterId.value, statusFilter.value],
  () => {
    if (map) {
      renderPolygonsOnMap();
      renderGeoJsonImportPreview();
    }
  },
  { deep: true },
);
watch(
  () => filteredPolygons.value.map((polygon) => polygon.id),
  (ids) => {
    const allowedIds = new Set(ids);
    selectedPolygons.value = selectedPolygons.value.filter((id) => allowedIds.has(id));
  },
);
watch(
  () => selectedPolygons.value.slice(),
  () => {
    if (map) {
      renderPolygonsOnMap();
    }
  },
);
watch(
  () => selectedPolygon.value?.id || "",
  () => {
    if (map) {
      renderPolygonsOnMap();
    }
  },
);
watch(
  () => polygonsForSelect.value.map((polygon) => String(polygon.id)),
  (ids) => {
    if (!polygonFilterId.value) return;
    if (!ids.includes(String(polygonFilterId.value))) {
      polygonFilterId.value = "";
    }
  },
);
watch(
  () => showGeoJsonImportDialog.value,
  (open) => {
    if (!map) return;
    renderPolygonsOnMap();
    if (open) {
      renderGeoJsonImportPreview();
    } else {
      clearGeoJsonImportPreview();
    }
  },
);
onMounted(async () => {
  await referenceStore.loadCities();
  await loadAllPolygons();

  const context = shouldRestore.value ? restoreContext() : null;
  const initialCity = route.query.cityId ? String(route.query.cityId) : "";
  const initialBranch = route.query.branchId ? String(route.query.branchId) : "";

  if (context) {
    cityId.value = context.filters?.cityId ? String(context.filters.cityId) : "";
    branchId.value = context.branchId ? String(context.branchId) : "";
    polygonFilterId.value = context.polygonFilterId ? String(context.polygonFilterId) : "";
    statusFilter.value = context.statusFilter || "all";
  } else {
    cityId.value = initialCity || getManagerDefaultCityId();
    branchId.value = initialBranch;
  }

  if (cityId.value) {
    await loadBranches();
  }

  await nextTick();
  await initMap();

  if (context?.mapCenter && map) {
    map.setCenter([context.mapCenter.lat, context.mapCenter.lng], 12, { duration: 0 });
    restoreScroll(context.scroll);
  }
});
onUnmounted(() => {
  closeGeoJsonImportDialog();
  if (map) {
    map.destroy();
    map = null;
  }
  yandexMaps = null;
});
</script>
<style></style>
