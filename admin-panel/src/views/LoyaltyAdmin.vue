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
          <CardHeader>
            <CardTitle>Логи лояльности</CardTitle>
            <CardDescription>Системные события бонусной программы</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
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
                  <TableCell>{{ log.severity }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ log.message }}</TableCell>
                  <TableCell class="text-muted-foreground">{{ formatDateTime(log.created_at) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">Логи не найдены</div>
          </CardContent>
        </Card>
      </div>

      <div v-else class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Аудит</CardTitle>
            <CardDescription>Проверка дублей и расхождений</CardDescription>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="dup in duplicates" :key="`${dup.order_id}-${dup.type}`">
                    <TableCell>#{{ dup.order_id }}</TableCell>
                    <TableCell>{{ dup.type }}</TableCell>
                    <TableCell>{{ dup.total }}</TableCell>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in mismatches" :key="row.user_id">
                    <TableCell>{{ row.user_id }}</TableCell>
                    <TableCell>{{ formatNumber(row.user_balance) }}</TableCell>
                    <TableCell>{{ formatNumber(row.calculated_balance) }}</TableCell>
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
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
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

const tabs = ["Уровни", "Настройки", "Логи", "Аудит"];
const activeTab = ref(0);
const levels = ref([]);
const logs = ref([]);
const duplicates = ref([]);
const mismatches = ref([]);
const loyaltyItems = ref([]);
const loyaltyForm = ref({});
const loyaltyLoading = ref(false);
const loyaltySaving = ref(false);
const showLevelModal = ref(false);
const savingLevel = ref(false);
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
const percentKeys = new Set([
  "bonus_max_redeem_percent",
  "loyalty_level_1_redeem_percent",
  "loyalty_level_2_redeem_percent",
  "loyalty_level_3_redeem_percent",
  "loyalty_level_1_rate",
  "loyalty_level_2_rate",
  "loyalty_level_3_rate",
]);
const { showErrorNotification, showSuccessNotification } = useNotifications();

const levelModalTitle = computed(() => (levelForm.value.id ? "Редактировать уровень" : "Новый уровень"));

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
  const response = await api.get("/api/admin/loyalty/logs", { params: { limit: 50 } });
  logs.value = response.data.logs || [];
};

const loadAudit = async () => {
  const [dupResponse, mismatchResponse] = await Promise.all([
    api.get("/api/admin/loyalty/audit/duplicates"),
    api.get("/api/admin/loyalty/audit/mismatches"),
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

onMounted(async () => {
  await Promise.all([loadLevels(), loadLoyaltySettings(), loadLogs(), loadAudit()]);
});
</script>
