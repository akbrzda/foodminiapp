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

    <Card>
      <CardHeader>
        <CardTitle>iiko</CardTitle>
        <CardDescription>Настройки подключения и синхронизации</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
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
                autocomplete="off"
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
                v-model="form.iiko_api_token"
                type="password"
                name="iiko_api_token_settings"
                autocomplete="new-password"
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
              <label v-for="category in iikoOverview.categories" :key="category.id" class="flex items-center justify-between gap-3 text-sm">
                <span class="truncate">{{ category.name }}</span>
                <span class="text-xs text-muted-foreground">{{ category.products_count }} блюд</span>
                <input v-model="form.iiko_sync_category_ids" type="checkbox" :value="category.id" class="h-4 w-4" />
              </label>
              <div v-if="!iikoOverview.categories.length" class="text-xs text-muted-foreground">
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
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>PremiumBonus</CardTitle>
        <CardDescription>Настройки лояльности и клиентов</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
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
                autocomplete="off"
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
                autocomplete="new-password"
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
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Статус синхронизации</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div class="grid gap-3 md:grid-cols-3">
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

    <Card>
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
            <TableRow v-for="queue in queues" :key="queue.key">
              <TableCell class="font-medium">{{ queue.key }}</TableCell>
              <TableCell>{{ queue.stats.waiting || 0 }}</TableCell>
              <TableCell>{{ queue.stats.active || 0 }}</TableCell>
              <TableCell>{{ queue.stats.completed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.failed || 0 }}</TableCell>
              <TableCell>{{ queue.stats.delayed || 0 }}</TableCell>
            </TableRow>
            <TableRow v-if="!queues.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">Нет данных по очередям</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
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
            <TableRow v-for="log in syncLogs" :key="log.id">
              <TableCell class="text-xs">{{ formatDateTime(log.created_at) }}</TableCell>
              <TableCell>{{ log.integration_type }}</TableCell>
              <TableCell>{{ log.module }}</TableCell>
              <TableCell>{{ log.action }}</TableCell>
              <TableCell>
                <span :class="log.status === 'success' ? 'text-emerald-600' : 'text-red-600'">{{ log.status }}</span>
              </TableCell>
              <TableCell class="max-w-[340px] truncate text-xs text-muted-foreground">{{ log.error_message || "—" }}</TableCell>
            </TableRow>
            <TableRow v-if="!syncLogs.length">
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
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

const { showErrorNotification, showSuccessNotification } = useNotifications();

const loading = ref(false);
const saving = ref(false);
const retryLoading = ref(false);
const overviewLoading = ref(false);
const manualLoading = ref({ menu: false });
const testLoading = ref({ iiko: false, pb: false });
const form = ref({
  iiko_enabled: false,
  iiko_api_url: "",
  iiko_api_token: "",
  iiko_sync_category_ids: [],
  iiko_external_menu_id: "",
  premiumbonus_enabled: false,
  premiumbonus_api_url: "",
  premiumbonus_api_token: "",
  premiumbonus_sale_point_id: "",
  integration_mode: { menu: "local", orders: "local", loyalty: "local" },
});
const iikoOverview = ref({
  categories: [],
  externalMenus: [],
  warnings: {},
  selectedCategoryIds: [],
  selectedExternalMenuId: "",
});
const syncStatus = ref({});
const queues = ref([]);
const syncLogs = ref([]);
const overviewWarningsList = ref([]);
const overviewRequestTimer = ref(null);

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU");
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
          };
    const { data } = await api.get("/api/admin/integrations/iiko/nomenclature-overview", { params });
    iikoOverview.value = {
      categories: data?.categories || [],
      externalMenus: data?.externalMenus || [],
      warnings: data?.warnings || {},
      selectedCategoryIds: data?.selectedCategoryIds || [],
      selectedExternalMenuId: data?.selectedExternalMenuId || "",
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
    loading.value = false;
  }
};

const loadStatus = async () => {
  try {
    const { data } = await api.get("/api/admin/integrations/iiko/sync-status");
    syncStatus.value = data || {};
  } catch (error) {
    showErrorNotification("Не удалось загрузить статус синхронизации");
  }
};

const loadQueues = async () => {
  try {
    const { data } = await api.get("/api/admin/integrations/queues");
    queues.value = data?.queues || [];
  } catch (error) {
    showErrorNotification("Не удалось загрузить список очередей");
  }
};

const loadSyncLogs = async () => {
  try {
    const { data } = await api.get("/api/admin/integrations/sync-logs", {
      params: { page: 1, limit: 20 },
    });
    syncLogs.value = data?.rows || [];
  } catch (error) {
    showErrorNotification("Не удалось загрузить логи синхронизации");
  }
};

const loadAll = async () => {
  await loadSettings();
  await Promise.all([loadStatus(), loadQueues(), loadSyncLogs()]);
  await loadIikoOverview();
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

onMounted(loadAll);

onBeforeUnmount(() => {
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
