<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Клиенты" description="Список клиентов и расширенные фильтры" />
      </CardContent>
    </Card>

    <BaseFilters v-model="filtersModel" :fields="filterFields" :show-reset="false">
      <template #field-search>
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
          <Input v-model="filters.search" class="pl-9" placeholder="Поиск по имени, фамилии или телефону" @keyup.enter="loadClients" />
        </div>
      </template>
      <template #after>
        <div class="space-y-1 xl:col-span-2">
          <Popover v-model:open="isBirthdayRangeOpen">
            <PopoverTrigger asChild>
              <button
                type="button"
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span :class="['min-w-0 flex-1 truncate pr-2 text-left', birthdayRangeLabelClass]">{{ birthdayRangeLabel }}</span>
                <CalendarIcon class="text-muted-foreground" :size="16" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-auto p-0 sm:w-auto sm:max-w-[calc(100vw-4rem)]" align="start">
              <div class="space-y-3 p-3">
                <div class="overflow-x-auto pb-1">
                  <Calendar
                    :model-value="birthdayCalendarRange"
                    :number-of-months="calendarMonths"
                    :is-date-disabled="isFutureDateDisabled"
                    locale="ru-RU"
                    multiple
                    @update:modelValue="handleBirthdayRangeUpdate"
                  />
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ birthdayRangeHelperLabel }}</span>
                  <button type="button" class="text-primary hover:underline" @click="clearBirthdayRange">Очистить</button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div class="space-y-1 xl:col-span-2">
          <Popover v-model:open="isRegistrationRangeOpen">
            <PopoverTrigger asChild>
              <button
                type="button"
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span :class="['min-w-0 flex-1 truncate pr-2 text-left', registrationRangeLabelClass]">{{ registrationRangeLabel }}</span>
                <CalendarIcon class="text-muted-foreground" :size="16" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-auto p-0 sm:w-auto sm:max-w-[calc(100vw-4rem)]" align="start">
              <div class="space-y-3 p-3">
                <div class="overflow-x-auto pb-1">
                  <Calendar
                    :model-value="registrationCalendarRange"
                    :number-of-months="calendarMonths"
                    :is-date-disabled="isFutureDateDisabled"
                    locale="ru-RU"
                    multiple
                    @update:modelValue="handleRegistrationRangeUpdate"
                  />
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ registrationRangeHelperLabel }}</span>
                  <button type="button" class="text-primary hover:underline" @click="clearRegistrationRange">Очистить</button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div v-for="rangeKey in rangeKeys" :key="rangeKey" class="space-y-1 xl:col-span-2">
          <Popover v-model:open="rangeUi[rangeKey].open">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                @click="openRange(rangeKey)"
              >
                <span class="truncate text-muted-foreground">{{ rangeTriggerText(rangeKey) }}</span>
                <ChevronDown class="text-muted-foreground" :size="16" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-[330px] p-3" align="start">
              <div class="flex items-center gap-2">
                <Input v-model="rangeUi[rangeKey].from" type="number" min="0" placeholder="От 0" />
                <Input v-model="rangeUi[rangeKey].to" type="number" min="0" placeholder="до 0" />
                <Button type="button" class="shrink-0" @click="applyRange(rangeKey)">OK</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </template>
    </BaseFilters>

    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-36" />
              <Skeleton class="h-3 w-24" />
              <div class="flex items-center justify-between">
                <Skeleton class="h-5 w-24" />
                <Skeleton class="h-4 w-16" />
              </div>
            </div>
          </template>
          <template v-else>
            <button
              v-for="client in paginatedClients"
              :key="`mobile-${client.id}`"
              type="button"
              class="w-full rounded-xl border border-border bg-background p-3 text-left transition hover:bg-accent/40"
              @click="openClient(client.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-medium text-foreground">{{ client.first_name }} {{ client.last_name }}</div>
                  <div class="text-xs text-muted-foreground">ID: {{ client.id }}</div>
                </div>
                <Badge variant="secondary">{{ client.city_name || "—" }}</Badge>
              </div>
              <div class="mt-2 text-sm">
                <a v-if="normalizePhone(client.phone)" class="hover:underline" :href="`tel:${normalizePhone(client.phone)}`" @click.stop>
                  {{ formatPhone(client.phone) }}
                </a>
                <span v-else>—</span>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">День рождения: {{ formatBirthday(client.date_of_birth) }}</div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span class="text-muted-foreground">Заказов: {{ formatNumber(client.orders_count) }}</span>
                <span class="text-muted-foreground">Баллы: {{ formatNumber(client.loyalty_balance) }}</span>
                <span class="text-muted-foreground">Сумма: {{ formatCurrency(client.total_orders_sum) }}</span>
                <span class="font-medium text-foreground">Средний чек: {{ formatCurrency(client.avg_check) }}</span>
              </div>
            </button>
            <div v-if="clients.length === 0" class="py-8 text-center text-sm text-muted-foreground">Клиенты не найдены</div>
          </template>
        </div>

        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Клиент</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>День рождения</TableHead>
                <TableHead>Город</TableHead>
                <TableHead>Заказы</TableHead>
                <TableHead>Сумма заказов</TableHead>
                <TableHead>Средний чек</TableHead>
                <TableHead>Баллы</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="client in paginatedClients" :key="client.id" class="cursor-pointer" @click="openClient(client.id)">
                  <TableCell>
                    <div class="font-medium text-foreground">{{ client.first_name }} {{ client.last_name }}</div>
                    <div class="text-xs text-muted-foreground">ID: {{ client.id }}</div>
                  </TableCell>
                  <TableCell>
                    <a
                      v-if="normalizePhone(client.phone)"
                      class="text-foreground hover:underline"
                      :href="`tel:${normalizePhone(client.phone)}`"
                      @click.stop
                    >
                      {{ formatPhone(client.phone) }}
                    </a>
                    <span v-else>—</span>
                  </TableCell>
                  <TableCell>{{ formatBirthday(client.date_of_birth) }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ client.city_name || "—" }}</Badge>
                  </TableCell>
                  <TableCell>{{ formatNumber(client.orders_count) }}</TableCell>
                  <TableCell>{{ formatCurrency(client.total_orders_sum) }}</TableCell>
                  <TableCell>{{ formatCurrency(client.avg_check) }}</TableCell>
                  <TableCell>{{ formatNumber(client.loyalty_balance) }}</TableCell>
                  <TableCell class="text-right">
                    <Button variant="ghost" size="icon">
                      <ChevronRight :size="16" />
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow v-if="clients.length === 0">
                  <TableCell colspan="9" class="py-8 text-center text-sm text-muted-foreground">Клиенты не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <TablePagination :total="clients.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
  </div>
</template>

<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Search } from "lucide-vue-next";
import { DateFormatter, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { formatCurrency, formatNumber, formatPhone, normalizePhone } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import BaseFilters from "@/shared/components/filters/BaseFilters.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Calendar } from "@/shared/components/ui/calendar";
import Input from "@/shared/components/ui/input/Input.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";

const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();
const router = useRouter();

const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("clients");

const rangeMeta = {
  orders_count: { label: "Всего заказов: шт", from: "orders_count_from", to: "orders_count_to" },
  total_orders_sum: { label: "Сумма заказов: ₽", from: "total_orders_sum_from", to: "total_orders_sum_to" },
  avg_check: { label: "Средний чек: ₽", from: "avg_check_from", to: "avg_check_to" },
  loyalty_balance: { label: "Всего баллов", from: "loyalty_balance_from", to: "loyalty_balance_to" },
  last_order_days: { label: "Последний заказ: дней", from: "last_order_days_from", to: "last_order_days_to" },
};

const rangeKeys = Object.keys(rangeMeta);

const clients = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const loadTimer = ref(null);
const isBirthdayRangeOpen = ref(false);
const isRegistrationRangeOpen = ref(false);
const timeZone = getLocalTimeZone();
const rangeFormatter = new DateFormatter("ru-RU", { dateStyle: "short" });
const getCalendarMonthCount = () => (window.innerWidth < 1280 ? 1 : 2);
const calendarMonths = ref(getCalendarMonthCount());

const filters = reactive({
  search: "",
  city_id: "",
  phone_filter: "with_phone",
  birthday_from: "",
  birthday_to: "",
  registration_from: "",
  registration_to: "",
  orders_count_from: "",
  orders_count_to: "",
  total_orders_sum_from: "",
  total_orders_sum_to: "",
  avg_check_from: "",
  avg_check_to: "",
  loyalty_balance_from: "",
  loyalty_balance_to: "",
  last_order_days_from: "",
  last_order_days_to: "",
});
const filtersModel = computed({
  get: () => ({ ...filters }),
  set: (value) => {
    Object.assign(filters, value || {});
  },
});
const filterFields = computed(() => [
  {
    key: "search",
    label: "Поиск",
    placeholder: "Поиск по имени, фамилии или телефону",
    type: "text",
    defaultValue: "",
  },
  {
    key: "city_id",
    label: "Город",
    placeholder: "Все города",
    type: "select",
    defaultValue: "",
    options: [
      { value: "", label: "Все" },
      ...referenceStore.cities.map((city) => ({
        value: String(city.id),
        label: city.name,
      })),
    ],
  },
  {
    key: "phone_filter",
    label: "Телефон",
    placeholder: "Только с номером",
    type: "select",
    defaultValue: "with_phone",
    options: [
      { value: "with_phone", label: "Только с номером" },
      { value: "without_phone", label: "Без номера" },
      { value: "all", label: "Все" },
    ],
  },
]);

const rangeUi = reactive(
  Object.fromEntries(
    rangeKeys.map((key) => [
      key,
      {
        open: false,
        from: "",
        to: "",
      },
    ]),
  ),
);

const paginatedClients = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return clients.value.slice(start, start + pageSize.value);
});

const normalizeRangeValues = (value) => {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  if (!dates.length) return [];
  const trimmed = dates.slice(-2);
  return trimmed.sort((a, b) => a.compare(b));
};

const birthdayCalendarRange = computed({
  get() {
    const values = [];
    if (filters.birthday_from) values.push(parseDate(filters.birthday_from));
    if (filters.birthday_to) values.push(parseDate(filters.birthday_to));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    filters.birthday_from = normalized[0]?.toString() || "";
    filters.birthday_to = normalized[1]?.toString() || "";
  },
});

const registrationCalendarRange = computed({
  get() {
    const values = [];
    if (filters.registration_from) values.push(parseDate(filters.registration_from));
    if (filters.registration_to) values.push(parseDate(filters.registration_to));
    return values.length ? values : undefined;
  },
  set(value) {
    const normalized = normalizeRangeValues(value);
    filters.registration_from = normalized[0]?.toString() || "";
    filters.registration_to = normalized[1]?.toString() || "";
  },
});

const buildRangeLabel = (from, to) => {
  if (from && to) {
    const fromDate = rangeFormatter.format(parseDate(from).toDate(timeZone));
    const toDate = rangeFormatter.format(parseDate(to).toDate(timeZone));
    return `${fromDate} — ${toDate}`;
  }
  if (from) {
    const fromDate = rangeFormatter.format(parseDate(from).toDate(timeZone));
    return `${fromDate} — ...`;
  }
  return "";
};

const birthdayRangeLabel = computed(() => buildRangeLabel(filters.birthday_from, filters.birthday_to) || "День рождения");
const registrationRangeLabel = computed(() => buildRangeLabel(filters.registration_from, filters.registration_to) || "Дата регистрации");
const birthdayRangeLabelClass = computed(() => (filters.birthday_from ? "text-foreground" : "text-muted-foreground"));
const registrationRangeLabelClass = computed(() => (filters.registration_from ? "text-foreground" : "text-muted-foreground"));
const birthdayRangeHelperLabel = computed(() => {
  if (filters.birthday_from && filters.birthday_to) return "Диапазон выбран";
  if (filters.birthday_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});
const registrationRangeHelperLabel = computed(() => {
  if (filters.registration_from && filters.registration_to) return "Диапазон выбран";
  if (filters.registration_from) return "Выберите дату окончания";
  return "Выберите дату начала";
});

const handleBirthdayRangeUpdate = (value) => {
  birthdayCalendarRange.value = value;
  if (filters.birthday_from && filters.birthday_to) {
    isBirthdayRangeOpen.value = false;
  }
};

const handleRegistrationRangeUpdate = (value) => {
  registrationCalendarRange.value = value;
  if (filters.registration_from && filters.registration_to) {
    isRegistrationRangeOpen.value = false;
  }
};

const clearBirthdayRange = () => {
  filters.birthday_from = "";
  filters.birthday_to = "";
};

const clearRegistrationRange = () => {
  filters.registration_from = "";
  filters.registration_to = "";
};

const isFutureDateDisabled = (date) => date.compare(today(timeZone)) > 0;
const updateCalendarMonths = () => {
  calendarMonths.value = getCalendarMonthCount();
};

const formatBirthday = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const openRange = (key) => {
  const meta = rangeMeta[key];
  rangeUi[key].from = filters[meta.from] || "";
  rangeUi[key].to = filters[meta.to] || "";
};

const applyRange = (key) => {
  const meta = rangeMeta[key];
  filters[meta.from] = rangeUi[key].from;
  filters[meta.to] = rangeUi[key].to;
  rangeUi[key].open = false;
};

const rangeTriggerText = (key) => {
  const meta = rangeMeta[key];
  const from = filters[meta.from] || "";
  const to = filters[meta.to] || "";
  if (!from && !to) return meta.label;
  return `От ${from} до ${to}`;
};

const loadClients = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined));
    const response = await api.get("/api/admin/clients", { params });
    clients.value = response.data.clients || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки клиентов:", error);
    showErrorNotification("Ошибка загрузки клиентов");
  } finally {
    isLoading.value = false;
  }
};

const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadClients, 300);
};

const openClient = (clientId) => {
  saveContext(filters, {
    page: page.value,
    pageSize: pageSize.value,
  });
  router.push(`/clients/${clientId}`);
};

const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

onMounted(async () => {
  try {
    updateCalendarMonths();
    window.addEventListener("resize", updateCalendarMonths);
    await referenceStore.loadCities();

    if (shouldRestore.value) {
      const context = restoreContext();

      if (context) {
        Object.assign(filters, context.filters || {});
        if (context.page) page.value = context.page;
        if (context.pageSize) pageSize.value = context.pageSize;

        await loadClients({ preservePage: true });
        restoreScroll(context.scroll);
      }
    } else {
      await loadClients();
    }
  } catch (error) {
    devError("Ошибка загрузки клиентов:", error);
    showErrorNotification("Ошибка загрузки клиентов");
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateCalendarMonths);
});

watch(
  filters,
  () => {
    page.value = 1;
    scheduleLoad();
  },
  { deep: true },
);
</script>
