<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Действия администраторов" description="История изменений в системе" />
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[200px]">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Администратор</FieldLabel>
              <FieldContent>
                <Select v-model="filters.admin_id">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все администраторы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.first_name }} {{ admin.last_name }}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-[180px]">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тип действия</FieldLabel>
              <FieldContent>
                <Select v-model="filters.action_type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem value="create">Создание</SelectItem>
                    <SelectItem value="update">Изменение</SelectItem>
                    <SelectItem value="delete">Удаление</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-[180px]">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Объект</FieldLabel>
              <FieldContent>
                <Select v-model="filters.object_type">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Все объекты" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все</SelectItem>
                    <SelectItem value="category">Категория</SelectItem>
                    <SelectItem value="item">Блюдо</SelectItem>
                    <SelectItem value="modifier">Модификатор</SelectItem>
                    <SelectItem value="order">Заказ</SelectItem>
                    <SelectItem value="polygon">Полигон</SelectItem>
                    <SelectItem value="settings">Настройки</SelectItem>
                    <SelectItem value="user">Пользователь</SelectItem>
                    <SelectItem value="city">Город</SelectItem>
                    <SelectItem value="branch">Филиал</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>
          <div class="min-w-[220px]">
            <Field>
              <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Период</FieldLabel>
              <FieldContent>
                <Popover v-model:open="isRangeOpen">
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background"
                    >
                      <span :class="rangeLabelClass">{{ rangeLabel }}</span>
                      <CalendarIcon class="text-muted-foreground" :size="16" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0" align="start">
                    <div class="space-y-3 p-3">
                      <Calendar
                        :model-value="calendarRange"
                        :number-of-months="2"
                        :is-date-disabled="isFutureDateDisabled"
                        locale="ru-RU"
                        multiple
                        @update:modelValue="handleRangeUpdate"
                      />
                      <div class="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{{ rangeHelperLabel }}</span>
                        <button type="button" class="text-primary hover:underline" @click="clearDateRange">Очистить</button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </FieldContent>
            </Field>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" @click="resetFilters">
              <RotateCcw :size="16" />
              Сбросить
            </Button>
            <Badge variant="secondary">Всего: {{ formatNumber(pagination.total) }}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card v-if="loading">
      <CardContent class="py-12">
        <div class="space-y-2">
          <Skeleton class="h-6 w-full" />
          <Skeleton class="h-6 w-full" />
          <Skeleton class="h-6 w-full" />
        </div>
      </CardContent>
    </Card>
    <Card v-else-if="logs.length === 0">
      <CardContent class="py-12 text-center">
        <div class="text-muted-foreground">Логи не найдены</div>
      </CardContent>
    </Card>
    <Card v-else>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата/Время</TableHead>
              <TableHead>Администратор</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Объект</TableHead>
              <TableHead>IP</TableHead>
              <TableHead class="text-right">Детали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="log in logs" :key="log.id">
              <TableCell>
                <div class="text-sm">{{ formatDateTime(log.created_at) }}</div>
              </TableCell>
              <TableCell>
                <div class="text-sm font-medium">{{ log.admin_name }}</div>
                <div class="text-xs text-muted-foreground">{{ log.admin_email }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="getActionVariant(log.action)" :class="getActionClass(log.action)">
                  {{ getActionLabel(log.action) }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="text-sm">{{ getObjectLabel(log.object_type) }}</div>
                <div class="text-xs text-muted-foreground">#{{ log.object_id }}</div>
              </TableCell>
              <TableCell>
                <span class="text-xs text-muted-foreground">{{ log.ip_address || "—" }}</span>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" @click="showDetails(log)">
                  <Eye :size="16" />
                  Просмотр
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination
      :total="pagination.total"
      :page="pagination.page"
      :page-size="pagination.limit"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
    />
    <Dialog v-model:open="detailsModal.open">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Детали действия #{{ detailsModal.log?.id || "" }}</DialogTitle>
          <DialogDescription>Подробная информация о выполненном административном действии</DialogDescription>
        </DialogHeader>
        <div v-if="detailsModal.log" class="space-y-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата и время</div>
            <div class="text-sm">{{ formatDateTime(detailsModal.log.created_at) }}</div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Администратор</div>
            <div class="text-sm">{{ detailsModal.log.admin_name }} ({{ detailsModal.log.admin_email }})</div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Действие</div>
            <div class="text-sm">{{ getActionLabel(detailsModal.log.action) }}</div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Объект</div>
            <div class="text-sm">{{ getObjectLabel(detailsModal.log.object_type) }} #{{ detailsModal.log.object_id }}</div>
          </div>
          <div v-if="detailsModal.log.ip_address">
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IP адрес</div>
            <div class="text-sm">{{ detailsModal.log.ip_address }}</div>
          </div>
          <div v-if="detailsModal.log.details">
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Детали изменений</div>
            <pre class="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{{ formatJSON(detailsModal.log.details) }}</pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="detailsModal.open = false">Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { formatDateTime, formatNumber } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Calendar as CalendarIcon, Eye, RotateCcw } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
const logs = ref([]);
const admins = ref([]);
const loading = ref(false);
const isRangeOpen = ref(false);
const { showErrorNotification } = useNotifications();
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("admin-logs");
const loadTimer = ref(null);
const isRestoringContext = ref(false);
const filters = reactive({
  admin_id: "",
  action_type: "",
  object_type: "",
  date_from: "",
  date_to: "",
});
const timeZone = getLocalTimeZone();
const rangeFormatter = new DateFormatter("ru-RU", { dateStyle: "medium" });
const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};
const calendarRange = computed({
  get() {
    const values = [];
    if (filters.date_from) values.push(parseDate(filters.date_from));
    if (filters.date_to) values.push(parseDate(filters.date_to));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    filters.date_from = normalized[0]?.toString() || "";
    filters.date_to = normalized[1]?.toString() || "";
  },
});
const handleRangeUpdate = (value) => {
  calendarRange.value = value;
  if (filters.date_from && filters.date_to) {
    isRangeOpen.value = false;
  }
};
const rangeLabel = computed(() => {
  if (filters.date_from && filters.date_to) {
    const from = rangeFormatter.format(parseDate(filters.date_from).toDate(timeZone));
    const to = rangeFormatter.format(parseDate(filters.date_to).toDate(timeZone));
    return `${from} — ${to}`;
  }
  if (filters.date_from) {
    const from = rangeFormatter.format(parseDate(filters.date_from).toDate(timeZone));
    return `${from} — ...`;
  }
  return "Выберите диапазон";
});
const rangeLabelClass = computed(() => (filters.date_from ? "text-foreground" : "text-muted-foreground"));
const rangeHelperLabel = computed(() => {
  if (filters.date_from && filters.date_to) return "Диапазон выбран";
  if (filters.date_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const isFutureDateDisabled = (date) => date.compare(today(timeZone)) > 0;
const clearDateRange = () => {
  filters.date_from = "";
  filters.date_to = "";
};
const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
});
const detailsModal = reactive({
  open: false,
  log: null,
});
const loadLogs = async () => {
  loading.value = true;
  try {
    const params = {
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
      page: pagination.page,
      limit: pagination.limit,
    };
    const response = await api.get("/api/admin/logs", { params });
    logs.value = response.data.logs || [];
    pagination.total = response.data.total || 0;
  } catch (error) {
    devError("Ошибка загрузки логов:", error);
    const message = error.response?.data?.error || error.message || "Неизвестная ошибка";
    showErrorNotification(`Ошибка загрузки логов: ${message}`);
  } finally {
    loading.value = false;
  }
};
const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadLogs, 300);
};
const loadAdmins = async () => {
  try {
    const response = await api.get("/api/admin/users/admins");
    admins.value = response.data.admins || [];
  } catch (error) {
    devError("Ошибка загрузки администраторов:", error);
    const message = error.response?.data?.error || error.message || "Неизвестная ошибка";
    showErrorNotification(`Ошибка загрузки администраторов: ${message}`);
  }
};
const resetFilters = () => {
  Object.assign(filters, {
    admin_id: "",
    action_type: "",
    object_type: "",
    date_from: "",
    date_to: "",
  });
  pagination.page = 1;
  scheduleLoad();
};
const onPageChange = (value) => {
  pagination.page = value;
  loadLogs();
};
const onPageSizeChange = (value) => {
  pagination.limit = value;
  pagination.page = 1;
  loadLogs();
};
const showDetails = (log) => {
  detailsModal.log = log;
  detailsModal.open = true;
};
const getActionLabel = (action) => {
  const labels = {
    create: "Создание",
    update: "Изменение",
    delete: "Удаление",
  };
  return labels[action] || action;
};
const getActionVariant = (action) => {
  const variants = {
    update: "default",
    delete: "destructive",
  };
  return variants[action] || "default";
};
const getActionClass = (action) => {
  const classes = {
    create: "bg-emerald-100 text-emerald-700 border-transparent",
  };
  return classes[action] || "";
};
const getObjectLabel = (objectType) => {
  const labels = {
    category: "Категория",
    item: "Блюдо",
    modifier: "Модификатор",
    order: "Заказ",
    polygon: "Полигон",
    settings: "Настройки",
    user: "Пользователь",
    city: "Город",
    branch: "Филиал",
  };
  return labels[objectType] || objectType;
};
const formatJSON = (json) => {
  if (typeof json === "string") {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }
  return JSON.stringify(json, null, 2);
};
onMounted(async () => {
  try {
    if (shouldRestore.value) {
      const context = restoreContext();
      if (context) {
        isRestoringContext.value = true;
        Object.assign(filters, context.filters || {});
        if (context.page) pagination.page = context.page;
        if (context.limit) pagination.limit = context.limit;
      }
    }
    await Promise.all([loadAdmins(), loadLogs()]);
    if (shouldRestore.value) {
      const context = restoreContext();
      if (context) {
        restoreScroll(context.scroll);
      }
    }
  } catch (error) {
    devError("Ошибка загрузки логов:", error);
    showErrorNotification("Ошибка загрузки логов");
  } finally {
    isRestoringContext.value = false;
  }
});
watch(
  filters,
  () => {
    if (isRestoringContext.value) return;
    pagination.page = 1;
    scheduleLoad();
  },
  { deep: true },
);
watch(
  () => [
    filters.admin_id,
    filters.action_type,
    filters.object_type,
    filters.date_from,
    filters.date_to,
    pagination.page,
    pagination.limit,
  ],
  () => {
    saveContext({ ...filters }, { page: pagination.page, limit: pagination.limit });
  },
);
</script>
