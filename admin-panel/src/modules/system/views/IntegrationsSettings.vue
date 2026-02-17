<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Интеграции" description="Настройки внешних сервисов и управление синхронизацией">
          <template #actions>
            <Button variant="secondary" :disabled="isBusy()" @click="loadAll">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
            <Button :disabled="isBusy()" @click="saveSettings">
              <RefreshCcw v-if="saving" class="h-4 w-4 animate-spin" />
              <PlugZap v-else :size="16" />
              {{ saving ? "Сохранение..." : "Сохранить" }}
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger value="iiko">iiko</TabsTrigger>
        <TabsTrigger value="premiumbonus">PremiumBonus</TabsTrigger>
        <TabsTrigger value="status">Статус</TabsTrigger>
        <TabsTrigger value="queues">Очереди</TabsTrigger>
        <TabsTrigger value="logs">Логи</TabsTrigger>
      </TabsList>
    </Tabs>

    <Card v-show="activeTab === 'iiko'">
      <CardHeader>
        <CardTitle>iiko</CardTitle>
        <CardDescription>Настройки подключения и синхронизации</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="loading && !settingsLoaded" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
          </div>
          <Skeleton class="h-32 w-full" />
          <div class="flex gap-2">
            <Skeleton class="h-9 w-32" />
            <Skeleton class="h-9 w-44" />
          </div>
        </div>
        <template v-else>
        <div class="hidden" aria-hidden="true">
          <input type="text" tabindex="-1" autocomplete="username" />
          <input type="password" tabindex="-1" autocomplete="current-password" />
        </div>
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Включено</FieldLabel>
            <FieldContent>
              <Select v-model="form.iiko_enabled">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Да</SelectItem>
                  <SelectItem :value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>API URL</FieldLabel>
            <FieldContent>
              <Input
                v-model="form.iiko_api_url"
                name="iiko_api_url_settings"
                autocomplete="section-iiko one-time-code"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>API Key</FieldLabel>
            <FieldContent>
              <Input
                v-model="form.iiko_api_key"
                type="password"
                name="iiko_api_key_settings"
                autocomplete="section-iiko new-password"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Внешнее меню iiko</FieldLabel>
            <FieldContent>
              <Select v-model="form.iiko_external_menu_id">
                <SelectTrigger><SelectValue placeholder="Не выбрано (без фильтра по внешнему меню)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Не выбрано</SelectItem>
                  <SelectItem v-for="menu in iikoOverview.externalMenus" :key="menu.id" :value="menu.id">
                    {{ menu.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Категория цен iiko</FieldLabel>
            <FieldContent>
              <Select v-model="form.iiko_price_category_id">
                <SelectTrigger><SelectValue placeholder="Не выбрано (базовые цены)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Не выбрано</SelectItem>
                  <SelectItem v-for="category in iikoOverview.priceCategories" :key="category.id" :value="category.id">
                    {{ category.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Сохранять локальные названия</FieldLabel>
            <FieldContent>
              <Select v-model="form.iiko_preserve_local_names">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Да</SelectItem>
                  <SelectItem :value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div class="text-xs text-muted-foreground">
          Источник меню для синхронизации: выбранное внешнее меню iiko.
        </div>
        <div class="text-xs text-muted-foreground">
          Если выбрано "Внешнее меню iiko", синхронизация загрузит только позиции из него.
        </div>
        <div v-if="overviewWarningsList.length" class="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700">
          <div v-for="warning in overviewWarningsList" :key="warning">{{ warning }}</div>
        </div>
        <Field>
          <FieldLabel>Категории для синхронизации</FieldLabel>
          <FieldContent>
            <div class="max-h-64 space-y-2 overflow-auto rounded-lg border border-border/60 p-3">
              <template v-if="overviewLoading">
                <div v-for="index in 6" :key="`iiko-category-skeleton-${index}`" class="flex items-center justify-between gap-3">
                  <Skeleton class="h-4 w-40" />
                  <Skeleton class="h-4 w-16" />
                  <Skeleton class="h-4 w-4" />
                </div>
              </template>
              <label v-for="category in iikoOverview.categories" :key="category.id" class="flex items-center justify-between gap-3 text-sm">
                <span class="truncate">{{ category.name }}</span>
                <span class="text-xs text-muted-foreground">{{ category.products_count }} блюд</span>
                <input v-model="form.iiko_sync_category_ids" type="checkbox" :value="category.id" class="h-4 w-4" />
              </label>
              <div v-if="!overviewLoading && !iikoOverview.categories.length" class="text-xs text-muted-foreground">
                Категории недоступны. Нажмите "Тест iiko" или проверьте настройки доступа.
              </div>
            </div>
            <div class="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" @click="form.iiko_sync_category_ids = []">Все категории</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="!iikoOverview.categories.length"
                @click="form.iiko_sync_category_ids = iikoOverview.categories.map((cat) => cat.id)"
              >
                Выбрать все
              </Button>
            </div>
            <div class="mt-2 text-xs text-muted-foreground">
              Выбрано категорий: {{ form.iiko_sync_category_ids.length || 0 }}
            </div>
          </FieldContent>
        </Field>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" :disabled="testLoading.iiko" @click="testIiko">
            <PlugZap :size="16" />
            Тест iiko
          </Button>
          <Button variant="secondary" :disabled="manualLoading.menu" @click="syncMenuNow">
            <RefreshCcw :size="16" />
            Синхронизировать меню
          </Button>
        </div>
        </template>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'premiumbonus'">
      <CardHeader>
        <CardTitle>PremiumBonus</CardTitle>
        <CardDescription>Настройки лояльности и клиентов</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div v-if="loading && !settingsLoaded" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
            <Skeleton class="h-16 w-full" />
          </div>
          <Skeleton class="h-9 w-40" />
        </div>
        <template v-else>
        <div class="hidden" aria-hidden="true">
          <input type="text" tabindex="-1" autocomplete="username" />
          <input type="password" tabindex="-1" autocomplete="current-password" />
        </div>
        <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Включено</FieldLabel>
            <FieldContent>
              <Select v-model="form.premiumbonus_enabled">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Да</SelectItem>
                  <SelectItem :value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>Sale Point ID</FieldLabel>
            <FieldContent>
              <Input v-model="form.premiumbonus_sale_point_id" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>API URL</FieldLabel>
            <FieldContent>
              <Input
                v-model="form.premiumbonus_api_url"
                name="premiumbonus_api_url_settings"
                autocomplete="section-premiumbonus one-time-code"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel>API Token</FieldLabel>
            <FieldContent>
              <Input
                v-model="form.premiumbonus_api_token"
                type="password"
                name="premiumbonus_api_token_settings"
                autocomplete="section-premiumbonus new-password"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </FieldContent>
          </Field>
        </FieldGroup>
        <div class="flex gap-2">
          <Button variant="secondary" :disabled="testLoading.pb" @click="testPb">
            <PlugZap :size="16" />
            Тест PremiumBonus
          </Button>
        </div>
        </template>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'status'">
      <CardHeader>
        <CardTitle>Статус синхронизации</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div v-if="statusLoading && !statusLoaded" class="grid gap-3 md:grid-cols-3">
          <div v-for="index in 3" :key="`status-skeleton-${index}`" class="rounded-lg border border-border/60 p-3">
            <Skeleton class="mb-2 h-4 w-24" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="mb-1 h-4 w-20" />
            <Skeleton class="h-4 w-20" />
          </div>
        </div>
        <div v-else class="grid gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Заказы iiko</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.iikoOrders?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.iikoOrders?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.iikoOrders?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.iikoOrders?.failed || 0 }}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Клиенты PB</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.premiumbonusClients?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.premiumbonusClients?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.premiumbonusClients?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.premiumbonusClients?.failed || 0 }}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <div class="font-medium">Покупки PB</div>
            <div class="text-muted-foreground">synced: {{ syncStatus.premiumbonusPurchases?.synced || 0 }}</div>
            <div class="text-muted-foreground">pending: {{ syncStatus.premiumbonusPurchases?.pending || 0 }}</div>
            <div class="text-muted-foreground">error: {{ syncStatus.premiumbonusPurchases?.error || 0 }}</div>
            <div class="text-muted-foreground">failed: {{ syncStatus.premiumbonusPurchases?.failed || 0 }}</div>
          </div>
        </div>
        <Button variant="secondary" :disabled="retryLoading" @click="retryFailed">
          <RefreshCcw :size="16" />
          Повторить pending/error
        </Button>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'queues'">
      <CardHeader>
        <CardTitle>Очереди интеграции</CardTitle>
        <CardDescription>Текущее состояние очередей BullMQ</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Очередь</TableHead>
              <TableHead>waiting</TableHead>
              <TableHead>active</TableHead>
              <TableHead>completed</TableHead>
              <TableHead>failed</TableHead>
              <TableHead>delayed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="queuesLoading && !queuesLoaded" v-for="index in 5" :key="`queue-skeleton-${index}`">
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
              <TableCell><Skeleton class="h-4 w-8" /></TableCell>
            </TableRow>
            <TableRow v-for="queue in queues" :key="queue.key">
              <TableCell class="font-medium">{{ queue.key }}</TableCell>
              <TableCell>{{ queue.stats.waiting || 0 }}</TableCell>
              <TableCell>{{ queue.stats.active || 0 }}</TableCell>
              <TableCell>{{ queue.stats.completed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.failed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.delayed || 0 }}</TableCell>
            </TableRow>
            <TableRow v-if="!queuesLoading && !queues.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">Нет данных по очередям</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card v-show="activeTab === 'logs'">
      <CardHeader>
        <CardTitle>Логи синхронизации</CardTitle>
        <CardDescription>Последние события обмена с внешними API</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Интеграция</TableHead>
              <TableHead>Модуль</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Ошибка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="logsLoading && !logsLoaded" v-for="index in 6" :key="`logs-skeleton-${index}`">
              <TableCell><Skeleton class="h-4 w-32" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" /></TableCell>
              <TableCell><Skeleton class="h-4 w-20" /></TableCell>
              <TableCell><Skeleton class="h-4 w-14" /></TableCell>
              <TableCell><Skeleton class="h-4 w-36" /></TableCell>
            </TableRow>
            <TableRow v-for="log in syncLogs" :key="log.id">
              <TableCell class="text-xs">{{ formatDateTime(log.created_at) }}</TableCell>
              <TableCell>{{ log.integration_type }}</TableCell>
              <TableCell>{{ log.module }}</TableCell>
              <TableCell>{{ log.action }}</TableCell>
              <TableCell>
                <span :class="resolveLogStatusClass(log.status)">{{ log.status }}</span>
              </TableCell>
              <TableCell class="max-w-[340px] truncate text-xs text-muted-foreground">{{ log.error_message || "—" }}</TableCell>
            </TableRow>
            <TableRow v-if="!logsLoading && !syncLogs.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">Логи отсутствуют</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PlugZap, RefreshCcw } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Button from "@/shared/components/ui/button/Button.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

const { showErrorNotification, showSuccessNotification } = useNotifications();

const loading = ref(false);
const settingsLoaded = ref(false);
const activeTab = ref("iiko");
const saving = ref(false);
const retryLoading = ref(false);
const overviewLoading = ref(false);
const manualLoading = ref({ menu: false });
const testLoading = ref({ iiko: false, pb: false });
const form = ref({
  iiko_enabled: false,
  iiko_api_url: "",
  iiko_api_key: "",
  iiko_sync_category_ids: [],
  iiko_external_menu_id: "",
  iiko_price_category_id: "",
  iiko_preserve_local_names: true,
  premiumbonus_enabled: false,
  premiumbonus_api_url: "",
  premiumbonus_api_token: "",
  premiumbonus_sale_point_id: "",
  integration_mode: { menu: "local", orders: "local", loyalty: "local" },
});
const iikoOverview = ref({
  categories: [],
  externalMenus: [],
  priceCategories: [],
  warnings: {},
  selectedCategoryIds: [],
  selectedExternalMenuId: "",
  selectedPriceCategoryId: "",
});
const syncStatus = ref({});
const statusLoading = ref(false);
const statusLoaded = ref(false);
const queues = ref([]);
const queuesLoading = ref(false);
const queuesLoaded = ref(false);
const syncLogs = ref([]);
const logsLoading = ref(false);
const logsLoaded = ref(false);
const overviewWarningsList = ref([]);
const overviewRequestTimer = ref(null);
const liveRefreshTimer = ref(null);
const liveRefreshing = ref(false);

const formatDateTime = (value) => {
  if (!value) return "—";
  const raw = String(value).trim();

  // Для логов интеграций сервер может отдавать ISO-дату в UTC,
  // но фактически время уже локальное. Убираем TZ-суффикс,
  // чтобы не получать повторный сдвиг (+N часов) в браузере.
  const normalized = raw
    .replace("T", " ")
    .replace(/(\.\d+)?Z$/, "")
    .replace(/([+-]\d{2}:\d{2})$/, "");

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("ru-RU");
};

const resolveLogStatusClass = (status) => {
  if (status === "success") return "text-emerald-600";
  if (status === "active") return "text-amber-600";
  return "text-red-600";
};

const applyForm = (settings = {}) => {
  const categories = Array.isArray(settings.iiko_sync_category_ids)
    ? settings.iiko_sync_category_ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  form.value = {
    ...form.value,
    ...settings,
    iiko_enabled: Boolean(settings.iiko_enabled),
    premiumbonus_enabled: Boolean(settings.premiumbonus_enabled),
    iiko_sync_category_ids: categories,
    iiko_external_menu_id: String(settings.iiko_external_menu_id || ""),
    iiko_price_category_id: String(settings.iiko_price_category_id || ""),
    iiko_preserve_local_names: settings.iiko_preserve_local_names !== false,
    integration_mode: settings.integration_mode || { menu: "local", orders: "local", loyalty: "local" },
  };
};

const loadIikoOverview = async (paramsOverride = null) => {
  overviewLoading.value = true;
  try {
    const params =
      paramsOverride && typeof paramsOverride === "object"
        ? paramsOverride
        : {
            external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
            price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
          };
    const { data } = await api.get("/api/admin/integrations/iiko/nomenclature-overview", { params });
    iikoOverview.value = {
      categories: data?.categories || [],
      externalMenus: data?.externalMenus || [],
      priceCategories: data?.priceCategories || [],
      warnings: data?.warnings || {},
      selectedCategoryIds: data?.selectedCategoryIds || [],
      selectedExternalMenuId: data?.selectedExternalMenuId || "",
      selectedPriceCategoryId: data?.selectedPriceCategoryId || "",
    };
    overviewWarningsList.value = Object.values(iikoOverview.value.warnings || {}).filter(Boolean).map((value) => String(value));
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить обзор меню iiko");
  } finally {
    overviewLoading.value = false;
  }
};

const loadSettings = async () => {
  loading.value = true;
  try {
    const { data } = await api.get("/api/admin/integrations/settings");
    applyForm(data?.settings || {});
  } catch (error) {
    showErrorNotification("Не удалось загрузить настройки интеграций");
  } finally {
    settingsLoaded.value = true;
    loading.value = false;
  }
};

const loadStatus = async ({ silent = false } = {}) => {
  if (!silent || !statusLoaded.value) {
    statusLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/sync-status");
    syncStatus.value = data || {};
  } catch (error) {
    showErrorNotification("Не удалось загрузить статус синхронизации");
  } finally {
    statusLoaded.value = true;
    statusLoading.value = false;
  }
};

const loadQueues = async ({ silent = false } = {}) => {
  if (!silent || !queuesLoaded.value) {
    queuesLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/queues");
    queues.value = data?.queues || [];
  } catch (error) {
    showErrorNotification("Не удалось загрузить список очередей");
  } finally {
    queuesLoaded.value = true;
    queuesLoading.value = false;
  }
};

const loadSyncLogs = async ({ silent = false } = {}) => {
  if (!silent || !logsLoaded.value) {
    logsLoading.value = true;
  }
  try {
    const { data } = await api.get("/api/admin/integrations/sync-logs", {
      params: { page: 1, limit: 20 },
    });
    syncLogs.value = data?.rows || [];
  } catch (error) {
    showErrorNotification("Не удалось загрузить логи синхронизации");
  } finally {
    logsLoaded.value = true;
    logsLoading.value = false;
  }
};

const loadAll = async () => {
  await loadSettings();
  await Promise.all([loadStatus(), loadQueues(), loadSyncLogs()]);
  await loadIikoOverview();
};

const refreshLiveData = async () => {
  if (liveRefreshing.value) return;
  liveRefreshing.value = true;
  try {
    await Promise.all([loadStatus({ silent: true }), loadQueues({ silent: true }), loadSyncLogs({ silent: true })]);
  } finally {
    liveRefreshing.value = false;
  }
};

const startLiveRefresh = () => {
  if (liveRefreshTimer.value) return;
  liveRefreshTimer.value = setInterval(() => {
    if (document.hidden) return;
    refreshLiveData();
  }, 3000);
};

const stopLiveRefresh = () => {
  if (!liveRefreshTimer.value) return;
  clearInterval(liveRefreshTimer.value);
  liveRefreshTimer.value = null;
};

const handleVisibilityChange = () => {
  if (document.hidden) return;
  refreshLiveData();
};

const saveSettings = async () => {
  saving.value = true;
  try {
    await api.put("/api/admin/integrations/settings", { settings: form.value });
    showSuccessNotification("Настройки интеграций сохранены");
    await loadAll();
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось сохранить настройки");
  } finally {
    saving.value = false;
  }
};

const testIiko = async () => {
  testLoading.value.iiko = true;
  try {
    await api.post("/api/admin/integrations/iiko/test-connection");
    showSuccessNotification("Подключение к iiko успешно");
    await loadIikoOverview();
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Ошибка подключения к iiko");
  } finally {
    testLoading.value.iiko = false;
  }
};

const testPb = async () => {
  testLoading.value.pb = true;
  try {
    await api.post("/api/admin/integrations/premiumbonus/test-connection");
    showSuccessNotification("Подключение к PremiumBonus успешно");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Ошибка подключения к PremiumBonus");
  } finally {
    testLoading.value.pb = false;
  }
};

const syncMenuNow = async () => {
  manualLoading.value.menu = true;
  try {
    await api.post("/api/admin/integrations/iiko/sync-menu");
    showSuccessNotification("Задача синхронизации меню поставлена в очередь");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось запустить синхронизацию меню");
  } finally {
    manualLoading.value.menu = false;
  }
};

const retryFailed = async () => {
  retryLoading.value = true;
  try {
    await api.post("/api/admin/integrations/retry-failed");
    showSuccessNotification("Повтор синхронизации запущен");
    await Promise.all([loadStatus(), loadQueues(), loadSyncLogs()]);
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось запустить повтор");
  } finally {
    retryLoading.value = false;
  }
};

onMounted(async () => {
  await loadAll();
  startLiveRefresh();
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onBeforeUnmount(() => {
  stopLiveRefresh();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (overviewRequestTimer.value) {
    clearTimeout(overviewRequestTimer.value);
    overviewRequestTimer.value = null;
  }
});

watch(
  () => form.value.iiko_external_menu_id,
  (next, prev) => {
    if (String(next || "") === String(prev || "")) return;
    if (overviewRequestTimer.value) {
      clearTimeout(overviewRequestTimer.value);
      overviewRequestTimer.value = null;
    }
    overviewRequestTimer.value = setTimeout(() => {
      loadIikoOverview({
        external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
        price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
      });
    }, 250);
  },
);

watch(
  () => form.value.iiko_price_category_id,
  (next, prev) => {
    if (String(next || "") === String(prev || "")) return;
    if (overviewRequestTimer.value) {
      clearTimeout(overviewRequestTimer.value);
      overviewRequestTimer.value = null;
    }
    overviewRequestTimer.value = setTimeout(() => {
      loadIikoOverview({
        external_menu_id: String(form.value.iiko_external_menu_id || "").trim() || undefined,
        price_category_id: String(form.value.iiko_price_category_id || "").trim() || undefined,
      });
    }, 250);
  },
);

const isBusy = () =>
  loading.value ||
  saving.value ||
  retryLoading.value ||
  manualLoading.value.menu ||
  testLoading.value.iiko ||
  testLoading.value.pb ||
  overviewLoading.value;

defineExpose({
  loadAll,
  saveSettings,
  isBusy,
});
</script>
