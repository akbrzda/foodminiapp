<template>
  <div class="space-y-6">
    <Tabs v-model="activeTab" :tabs="tabs">
      <div v-if="activeTab === 0" class="space-y-6">
        <Card>
          <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Уровни лояльности</CardTitle>
              <CardDescription>Управление условиями уровней</CardDescription>
            </div>
            <Button @click="openLevelModal()">
              <Plus :size="16" />
              Добавить уровень
            </Button>
          </CardHeader>
          <CardContent class="pt-0">
            <Table v-if="levels.length">
              <TableHeader>
                <TableRow>
                  <TableHead>Уровень</TableHead>
                  <TableHead>Порог</TableHead>
                  <TableHead>Начисление</TableHead>
                  <TableHead>Списание</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="level in levels" :key="level.id">
                  <TableCell class="font-medium">{{ level.name }}</TableCell>
                  <TableCell>{{ formatNumber(level.threshold_amount) }}</TableCell>
                  <TableCell>{{ formatPercent(level.earn_percent) }}</TableCell>
                  <TableCell>{{ formatPercent(level.max_spend_percent / 100) }}</TableCell>
                  <TableCell>
                    <Badge :variant="level.is_active ? 'secondary' : 'outline'">
                      {{ level.is_active ? "Активен" : "Неактивен" }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" @click="openLevelModal(level)">
                        <Pencil :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="deleteLevel(level)">
                        <Trash2 :size="16" class="text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">Уровни не найдены</div>
          </CardContent>
        </Card>
      </div>

      <div v-else-if="activeTab === 1" class="space-y-6">
        <Card v-if="groupedLoyaltySettings.length">
          <CardHeader>
            <CardTitle>Настройки лояльности</CardTitle>
            <CardDescription>Глобальные параметры начислений и списаний</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-6">
              <div v-for="group in groupedLoyaltySettings" :key="group.name" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-3">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-background px-4 py-3"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-40">
                      <Select v-if="item.type === 'boolean' || typeof loyaltyForm[item.key] === 'boolean'" v-model="loyaltyForm[item.key]">
                        <option :value="true">Включено</option>
                        <option :value="false">Выключено</option>
                      </Select>
                      <Input v-else-if="item.type === 'string'" v-model="loyaltyForm[item.key]" type="text" />
                      <Input
                        v-else
                        v-model.number="loyaltyForm[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        :max="getMaxValue(item.key)"
                        @change="normalizeInteger(loyaltyForm, item.key)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки лояльности не найдены</CardContent>
        </Card>

        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" :disabled="loyaltyLoading || loyaltySaving" @click="loadLoyaltySettings">
            <RefreshCcw :size="16" />
            Сбросить
          </Button>
          <Button :disabled="loyaltyLoading || loyaltySaving" @click="saveLoyaltySettings">
            <Save :size="16" />
            {{ loyaltySaving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </div>
      </div>

      <div v-else-if="activeTab === 2" class="space-y-6">
        <Card>
          <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Исключения для списания бонусов</CardTitle>
              <CardDescription>Категории и товары, на которые нельзя списывать бонусы</CardDescription>
            </div>
            <Button @click="openExclusionModal()">
              <Plus :size="16" />
              Добавить исключение
            </Button>
          </CardHeader>
          <CardContent class="pt-0 space-y-4">
            <!-- Фильтры -->
            <div class="flex flex-wrap gap-3">
              <Select v-model="exclusionFilters.type" class="w-40">
                <option value="">Все типы</option>
                <option value="category">Категории</option>
                <option value="product">Товары</option>
              </Select>
              <Input v-model="exclusionFilters.search" placeholder="Поиск по названию..." class="w-60" />
              <Button variant="outline" size="sm" @click="resetExclusionFilters"> Сбросить </Button>
            </div>

            <Table v-if="filteredExclusions.length">
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead>Создано</TableHead>
                  <TableHead class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="exclusion in filteredExclusions" :key="exclusion.id">
                  <TableCell>
                    <Badge :variant="exclusion.type === 'category' ? 'secondary' : 'outline'">
                      {{ exclusion.type === "category" ? "Категория" : "Товар" }}
                    </Badge>
                  </TableCell>
                  <TableCell class="font-medium">{{ exclusion.entity_name || `ID: ${exclusion.entity_id}` }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ exclusion.reason || "—" }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ formatDateTime(exclusion.created_at) }}</TableCell>
                  <TableCell class="text-right">
                    <Button variant="ghost" size="icon" @click="deleteExclusion(exclusion)">
                      <Trash2 :size="16" class="text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">
              {{ exclusions.length === 0 ? "Исключения не найдены" : "Нет результатов по фильтрам" }}
            </div>
          </CardContent>
        </Card>
      </div>

      <div v-else-if="activeTab === 3" class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Логи лояльности</CardTitle>
            <CardDescription>Системные события бонусной программы</CardDescription>
          </CardHeader>
          <CardContent class="pt-0 space-y-4">
            <Table v-if="logs.length">
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Серьезность</TableHead>
                  <TableHead>Сообщение</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="log in logs" :key="log.id">
                  <TableCell>{{ log.event_type }}</TableCell>
                  <TableCell>
                    <Badge :variant="log.severity === 'error' ? 'destructive' : log.severity === 'warning' ? 'secondary' : 'outline'">
                      {{ log.severity }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-muted-foreground">{{ log.message }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ formatDateTime(log.created_at) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">Логи не найдены</div>

            <!-- Пагинация -->
            <div v-if="logs.length" class="flex items-center justify-between border-t border-border pt-4">
              <div class="text-sm text-muted-foreground">Показано {{ logs.length }} из {{ logsTotalCount }} записей</div>
              <div class="flex gap-2">
                <Button variant="outline" size="sm" :disabled="logsPage === 1" @click="previousLogsPage"> Назад </Button>
                <Button variant="outline" size="sm" :disabled="logs.length < logsPageSize" @click="nextLogsPage"> Вперед </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div v-else class="space-y-6">
        <Card>
          <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Аудит</CardTitle>
              <CardDescription>Проверка дублей и расхождений</CardDescription>
            </div>
            <Button @click="loadAudit">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
          </CardHeader>
          <CardContent class="space-y-6">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Дубли транзакций</div>
              <Table v-if="duplicates.length">
                <TableHeader>
                  <TableRow>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Количество</TableHead>
                    <TableHead class="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="dup in duplicates" :key="`${dup.order_id}-${dup.type}`">
                    <TableCell>
                      <router-link :to="`/orders/${dup.order_id}`" class="text-primary hover:underline"> #{{ dup.order_id }} </router-link>
                    </TableCell>
                    <TableCell>{{ dup.type }}</TableCell>
                    <TableCell>{{ dup.total }}</TableCell>
                    <TableCell class="text-right">
                      <Button variant="ghost" size="sm" @click="viewOrderDetails(dup.order_id)"> Просмотр </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div v-else class="text-sm text-muted-foreground">Дубли не найдены</div>
            </div>
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Расхождения балансов</div>
              <Table v-if="mismatches.length">
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Баланс</TableHead>
                    <TableHead>Расчет</TableHead>
                    <TableHead class="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in mismatches" :key="row.user_id">
                    <TableCell>
                      <router-link :to="`/clients/${row.user_id}`" class="text-primary hover:underline"> #{{ row.user_id }} </router-link>
                    </TableCell>
                    <TableCell>{{ formatNumber(row.user_balance) }}</TableCell>
                    <TableCell>{{ formatNumber(row.calculated_balance) }}</TableCell>
                    <TableCell class="text-right">
                      <Button variant="ghost" size="sm" @click="viewClientDetails(row.user_id)"> Просмотр </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div v-else class="text-sm text-muted-foreground">Расхождения не найдены</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Tabs>

    <BaseModal v-if="showLevelModal" :title="levelModalTitle" @close="closeLevelModal">
      <form class="space-y-4" @submit.prevent="saveLevel">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</label>
            <Input v-model="levelForm.name" required />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Номер уровня</label>
            <Input
              v-model.number="levelForm.level_number"
              type="number"
              min="1"
              step="1"
              required
              @change="normalizeInteger(levelForm, 'level_number')"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порог</label>
            <Input
              v-model.number="levelForm.threshold_amount"
              type="number"
              min="0"
              step="1"
              @change="normalizeInteger(levelForm, 'threshold_amount')"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Начисление (%)</label>
            <Input
              v-model.number="levelForm.earn_percent"
              type="number"
              min="0"
              max="100"
              step="1"
              @change="normalizeInteger(levelForm, 'earn_percent')"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Списание (%)</label>
            <Input
              v-model.number="levelForm.max_spend_percent"
              type="number"
              min="0"
              max="100"
              step="1"
              @change="normalizeInteger(levelForm, 'max_spend_percent')"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</label>
            <Input v-model.number="levelForm.sort_order" type="number" min="0" step="1" @change="normalizeInteger(levelForm, 'sort_order')" />
          </div>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
          <Select v-model="levelForm.is_active">
            <option :value="true">Активен</option>
            <option :value="false">Неактивен</option>
          </Select>
        </div>
        <Button class="w-full" type="submit" :disabled="savingLevel">
          <Save :size="16" />
          {{ savingLevel ? "Сохранение..." : "Сохранить" }}
        </Button>
      </form>
    </BaseModal>

    <BaseModal v-if="showExclusionModal" :title="'Новое исключение'" @close="closeExclusionModal">
      <form class="space-y-4" @submit.prevent="saveExclusion">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип исключения</label>
          <Select v-model="exclusionForm.type" @change="onExclusionTypeChange">
            <option value="">Выберите тип</option>
            <option value="category">Категория</option>
            <option value="product">Товар</option>
          </Select>
        </div>

        <div v-if="exclusionForm.type === 'category'" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Категория</label>
          <Select v-model.number="exclusionForm.entity_id" required>
            <option :value="null">Выберите категорию</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </Select>
        </div>

        <div v-if="exclusionForm.type === 'product'" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Товар</label>
          <Select v-model.number="exclusionForm.entity_id" required>
            <option :value="null">Выберите товар</option>
            <option v-for="product in products" :key="product.id" :value="product.id">
              {{ product.name }}
            </option>
          </Select>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина (необязательно)</label>
          <Input v-model="exclusionForm.reason" placeholder="Причина добавления в исключения" />
        </div>

        <Button class="w-full" type="submit" :disabled="savingExclusion || !exclusionForm.type || !exclusionForm.entity_id">
          <Save :size="16" />
          {{ savingExclusion ? "Сохранение..." : "Добавить" }}
        </Button>
      </form>
    </BaseModal>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import Tabs from "../components/ui/Tabs.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatDateTime, formatNumber } from "../utils/format.js";

const router = useRouter();
const tabs = ["Уровни", "Настройки", "Исключения", "Логи", "Аудит"];
const activeTab = ref(0);
const levels = ref([]);
const exclusions = ref([]);
const categories = ref([]);
const products = ref([]);
const logs = ref([]);
const logsPage = ref(1);
const logsPageSize = 50;
const logsTotalCount = ref(0);
const duplicates = ref([]);
const mismatches = ref([]);
const loyaltyItems = ref([]);
const loyaltyForm = ref({});
const loyaltyLoading = ref(false);
const loyaltySaving = ref(false);
const showLevelModal = ref(false);
const savingLevel = ref(false);
const showExclusionModal = ref(false);
const savingExclusion = ref(false);

// Фильтры для исключений
const exclusionFilters = ref({
  type: "",
  search: "",
});

const levelForm = ref({
  id: null,
  name: "",
  level_number: 1,
  threshold_amount: 0,
  earn_percent: 3,
  max_spend_percent: 30,
  is_active: true,
  sort_order: 0,
});
const exclusionForm = ref({
  type: "",
  entity_id: null,
  reason: "",
});

// Удалены настройки уровней из percentKeys - теперь управляются через вкладку "Уровни"
const percentKeys = new Set([]);

const { showErrorNotification, showSuccessNotification } = useNotifications();

const levelModalTitle = computed(() => (levelForm.value.id ? "Редактировать уровень" : "Новый уровень"));

// Фильтрация исключений
const filteredExclusions = computed(() => {
  let result = exclusions.value;

  if (exclusionFilters.value.type) {
    result = result.filter((ex) => ex.type === exclusionFilters.value.type);
  }

  if (exclusionFilters.value.search) {
    const search = exclusionFilters.value.search.toLowerCase();
    result = result.filter(
      (ex) => (ex.entity_name && ex.entity_name.toLowerCase().includes(search)) || (ex.reason && ex.reason.toLowerCase().includes(search)),
    );
  }

  return result;
});

const formatPercent = (value) => `${Math.round(Number(value) * 100)}%`;

const normalizeInteger = (targetForm, key) => {
  const value = targetForm.value[key];
  if (!Number.isFinite(value)) return;
  targetForm.value[key] = Math.round(value);
};

const groupSettings = (list) => {
  const groups = new Map();
  for (const item of list) {
    const groupName = item.group || "Общее";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(item);
  }
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
};

const groupedLoyaltySettings = computed(() => groupSettings(loyaltyItems.value));

const getMaxValue = (key) => {
  if (percentKeys.has(key)) return 100;
  return null;
};

const toFormValue = (item) => {
  if (item.type === "number" && percentKeys.has(item.key)) {
    return Number.isFinite(item.value) ? Math.round(item.value * 100) : 0;
  }
  return item.value;
};

const hydrateForm = (list, targetForm) => {
  targetForm.value = list.reduce((acc, item) => {
    acc[item.key] = toFormValue(item);
    return acc;
  }, {});
};

const resetExclusionFilters = () => {
  exclusionFilters.value.type = "";
  exclusionFilters.value.search = "";
};

const loadLevels = async () => {
  const response = await api.get("/api/admin/loyalty/levels");
  levels.value = response.data.levels || [];
};

const loadLoyaltySettings = async () => {
  loyaltyLoading.value = true;
  try {
    const response = await api.get("/api/loyalty-settings/admin");
    loyaltyItems.value = response.data.items || [];
    hydrateForm(loyaltyItems.value, loyaltyForm);
  } catch (error) {
    console.error("Failed to load loyalty settings:", error);
    showErrorNotification("Ошибка при загрузке настроек лояльности");
  } finally {
    loyaltyLoading.value = false;
  }
};

const saveLoyaltySettings = async () => {
  loyaltySaving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(loyaltyForm.value)) {
      if (percentKeys.has(key)) {
        payload[key] = Number.isFinite(value) ? value / 100 : value;
      } else {
        payload[key] = value;
      }
    }
    const response = await api.put("/api/loyalty-settings/admin", { settings: payload });
    loyaltyItems.value = response.data.items || [];
    hydrateForm(loyaltyItems.value, loyaltyForm);
    showSuccessNotification("Настройки лояльности сохранены");
  } catch (error) {
    console.error("Failed to save loyalty settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек лояльности";
    showErrorNotification(message);
  } finally {
    loyaltySaving.value = false;
  }
};

const loadLogs = async () => {
  const response = await api.get("/api/loyalty-settings/logs", {
    params: {
      limit: logsPageSize,
      offset: (logsPage.value - 1) * logsPageSize,
    },
  });
  logs.value = response.data.logs || [];
  logsTotalCount.value = response.data.total || logs.value.length;
};

const nextLogsPage = async () => {
  logsPage.value++;
  await loadLogs();
};

const previousLogsPage = async () => {
  if (logsPage.value > 1) {
    logsPage.value--;
    await loadLogs();
  }
};

const loadAudit = async () => {
  const [dupResponse, mismatchResponse] = await Promise.all([
    api.get("/api/loyalty-settings/audit/duplicates"),
    api.get("/api/loyalty-settings/audit/mismatches"),
  ]);
  duplicates.value = dupResponse.data.duplicates || [];
  mismatches.value = mismatchResponse.data.mismatches || [];
};

const openLevelModal = (level = null) => {
  if (level) {
    levelForm.value = {
      id: level.id,
      name: level.name,
      level_number: level.level_number,
      threshold_amount: level.threshold_amount,
      earn_percent: Math.round(Number(level.earn_percent) * 100),
      max_spend_percent: level.max_spend_percent,
      is_active: Boolean(level.is_active),
      sort_order: level.sort_order || 0,
    };
  } else {
    levelForm.value = {
      id: null,
      name: "",
      level_number: 1,
      threshold_amount: 0,
      earn_percent: 3,
      max_spend_percent: 30,
      is_active: true,
      sort_order: 0,
    };
  }
  showLevelModal.value = true;
};

const closeLevelModal = () => {
  showLevelModal.value = false;
};

const saveLevel = async () => {
  savingLevel.value = true;
  try {
    const payload = {
      ...levelForm.value,
      earn_percent: Number(levelForm.value.earn_percent) / 100,
    };
    if (levelForm.value.id) {
      await api.put(`/api/admin/loyalty/levels/${levelForm.value.id}`, payload);
    } else {
      await api.post("/api/admin/loyalty/levels", payload);
    }
    await loadLevels();
    closeLevelModal();
  } finally {
    savingLevel.value = false;
  }
};

const deleteLevel = async (level) => {
  if (!confirm(`Удалить уровень ${level.name}?`)) return;
  await api.delete(`/api/admin/loyalty/levels/${level.id}`);
  await loadLevels();
};

// Методы для работы с исключениями
const loadExclusions = async () => {
  const response = await api.get("/api/loyalty-settings/exclusions");
  exclusions.value = response.data.exclusions || [];
};

const loadCategories = async () => {
  const response = await api.get("/api/menu/admin/all-categories");
  categories.value = response.data.categories || [];
};

const loadProducts = async () => {
  const response = await api.get("/api/menu/admin/items");
  products.value = response.data.items || [];
};

const openExclusionModal = () => {
  exclusionForm.value = {
    type: "",
    entity_id: null,
    reason: "",
  };
  showExclusionModal.value = true;
};

const closeExclusionModal = () => {
  showExclusionModal.value = false;
};

const onExclusionTypeChange = async () => {
  exclusionForm.value.entity_id = null;
  if (exclusionForm.value.type === "category" && categories.value.length === 0) {
    await loadCategories();
  } else if (exclusionForm.value.type === "product" && products.value.length === 0) {
    await loadProducts();
  }
};

const saveExclusion = async () => {
  savingExclusion.value = true;
  try {
    await api.post("/api/loyalty-settings/exclusions", exclusionForm.value);
    await loadExclusions();
    closeExclusionModal();
    showSuccessNotification("Исключение добавлено");
  } catch (error) {
    console.error("Failed to save exclusion:", error);
    const message = error.response?.data?.error || "Ошибка при добавлении исключения";
    showErrorNotification(message);
  } finally {
    savingExclusion.value = false;
  }
};

const deleteExclusion = async (exclusion) => {
  const typeName = exclusion.type === "category" ? "категории" : "товара";
  if (!confirm(`Удалить исключение для ${typeName} "${exclusion.entity_name}"?`)) return;

  try {
    await api.delete(`/api/loyalty-settings/exclusions/${exclusion.id}`);
    await loadExclusions();
    showSuccessNotification("Исключение удалено");
  } catch (error) {
    console.error("Failed to delete exclusion:", error);
    showErrorNotification("Ошибка при удалении исключения");
  }
};

const viewOrderDetails = (orderId) => {
  router.push(`/orders/${orderId}`);
};

const viewClientDetails = (userId) => {
  router.push(`/clients/${userId}`);
};

onMounted(async () => {
  await Promise.all([loadLevels(), loadLoyaltySettings(), loadExclusions(), loadLogs(), loadAudit()]);
});
</script>
