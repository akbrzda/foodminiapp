<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Уровни лояльности" description="Управление уровнями и маппингом на PremiumBonus">
          <template #actions>
            <div class="header-actions">
              <Button v-if="canManageLoyaltyLevels" variant="secondary" :disabled="loading || saving" @click="loadLevels">
                <RefreshCcw :size="16" />
                Обновить
              </Button>
              <Button v-if="canManageLoyaltyLevels" variant="secondary" :disabled="loading || saving" @click="addLevel">
                <Plus :size="16" />
                Добавить уровень
              </Button>
              <Button v-if="canManageLoyaltyLevels" :disabled="loading || saving" @click="saveLevels">
                <Save v-if="!saving" :size="16" />
                <RefreshCcw v-else class="h-4 w-4 animate-spin" />
                {{ saving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="space-y-3 pt-6">
        <div class="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <div class="font-medium">Режим лояльности: {{ modeLabel }}</div>
          <div class="text-xs text-muted-foreground">
            При внешнем режиме отображаются локальные уровни, а расчёт начисления/списания/переходов берётся из PremiumBonus.
          </div>
        </div>
        <div v-if="pbGroups.length" class="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          В PremiumBonus найдено групп: {{ pbGroups.length }}. Используйте кнопку «Подставить из PB» для быстрого маппинга.
        </div>
      </CardContent>
    </Card>

    <div v-if="loading" class="space-y-3">
      <Card v-for="index in 3" :key="`level-skeleton-${index}`">
        <CardContent class="space-y-3 pt-6">
          <Skeleton class="h-4 w-56" />
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-else class="space-y-3">
      <Card v-for="(level, index) in levels" :key="level.local_key">
        <CardHeader class="pb-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <CardTitle class="text-base">Уровень #{{ index + 1 }}</CardTitle>
            <div class="flex gap-1">
              <Button
                v-if="canManageLoyaltyLevels"
                type="button"
                size="sm"
                variant="outline"
                :disabled="index === 0"
                @click="moveLevel(index, -1)"
              >
                <ChevronUp :size="14" />
              </Button>
              <Button
                v-if="canManageLoyaltyLevels"
                type="button"
                size="sm"
                variant="outline"
                :disabled="index === levels.length - 1"
                @click="moveLevel(index, 1)"
              >
                <ChevronDown :size="14" />
              </Button>
              <Button
                v-if="canManageLoyaltyLevels"
                type="button"
                size="sm"
                variant="outline"
                :disabled="!pbGroups.length"
                @click="applyNextPbGroup(level)"
              >
                <Link :size="14" />
                Подставить из PB
              </Button>
              <Button v-if="canManageLoyaltyLevels" type="button" size="sm" variant="outline" @click="removeLevel(index)">
                <Trash2 :size="14" />
                {{ level.id ? "Отключить" : "Удалить" }}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-4 pt-0">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel>Название</FieldLabel>
              <FieldContent>
                <Input v-model="level.name" placeholder="Карта 3%" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Порог суммы оплат</FieldLabel>
              <FieldContent>
                <Input v-model.number="level.threshold_amount" type="number" min="0" step="0.01" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Начисление, %</FieldLabel>
              <FieldContent>
                <Input v-model.number="level.earn_percentage" type="number" min="0" max="100" step="1" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Макс. списание, %</FieldLabel>
              <FieldContent>
                <Input v-model.number="level.max_spend_percentage" type="number" min="0" max="100" step="1" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Порядок сортировки</FieldLabel>
              <FieldContent>
                <Input v-model.number="level.sort_order" type="number" step="1" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <FieldContent>
                <Select v-model="level.is_enabled">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Активен</SelectItem>
                    <SelectItem :value="false">Отключен</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>PB Group ID</FieldLabel>
              <FieldContent>
                <Input v-model="level.pb_group_id" placeholder="ID группы в PremiumBonus" />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>PB Group Name</FieldLabel>
              <FieldContent>
                <Input v-model="level.pb_group_name" placeholder="Название группы в PremiumBonus" />
              </FieldContent>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card v-if="!levels.length">
        <CardContent class="py-8 text-center text-sm text-muted-foreground">Уровни не найдены. Добавьте первый уровень.</CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { ChevronDown, ChevronUp, Link, Plus, RefreshCcw, Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Button from "@/shared/components/ui/button/Button.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useAuthStore } from "@/shared/stores/auth.js";

const { showErrorNotification, showSuccessNotification } = useNotifications();
const authStore = useAuthStore();
const canManageLoyaltyLevels = computed(() => authStore.hasPermission("system.loyalty_levels.manage"));

const loading = ref(false);
const saving = ref(false);
const levels = ref([]);
const pbGroups = ref([]);
const mode = ref({
  premiumbonus_enabled: false,
  loyalty_integration_mode: "local",
});

const modeLabel = computed(() => {
  const isExternal = mode.value.premiumbonus_enabled && String(mode.value.loyalty_integration_mode || "local").toLowerCase() === "external";
  return isExternal ? "PremiumBonus (external)" : "Локальный";
});

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeLevel = (level = {}, index = 0) => ({
  local_key: `${String(level.id || "new")}-${Date.now()}-${index}`,
  id: Number(level.id) || null,
  name: String(level.name || "").trim(),
  threshold_amount: toNumber(level.threshold_amount, 0),
  earn_percentage: Math.max(0, Math.min(100, Math.floor(toNumber(level.earn_percentage, 0)))),
  max_spend_percentage: Math.max(0, Math.min(100, Math.floor(toNumber(level.max_spend_percentage, 0)))),
  is_enabled: level.is_enabled !== false,
  sort_order: Math.floor(toNumber(level.sort_order, (index + 1) * 10)),
  pb_group_id: String(level.pb_group_id || "").trim(),
  pb_group_name: String(level.pb_group_name || "").trim(),
});

const loadLevels = async () => {
  loading.value = true;
  try {
    const response = await api.get("/api/admin/loyalty/levels");
    levels.value = (Array.isArray(response.data?.levels) ? response.data.levels : []).map((level, index) => normalizeLevel(level, index));
    pbGroups.value = Array.isArray(response.data?.pb_groups) ? response.data.pb_groups : [];
    mode.value = response.data?.mode || {
      premiumbonus_enabled: false,
      loyalty_integration_mode: "local",
    };
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить уровни лояльности");
  } finally {
    loading.value = false;
  }
};

const addLevel = () => {
  if (!canManageLoyaltyLevels.value) return;
  levels.value.push(
    normalizeLevel(
      {
        id: null,
        name: "",
        threshold_amount: 0,
        earn_percentage: 0,
        max_spend_percentage: 0,
        is_enabled: true,
        sort_order: (levels.value.length + 1) * 10,
        pb_group_id: "",
        pb_group_name: "",
      },
      levels.value.length,
    ),
  );
};

const removeLevel = (index) => {
  if (!canManageLoyaltyLevels.value) return;
  const target = levels.value[index];
  if (!target) return;

  if (target.id) {
    levels.value[index] = {
      ...target,
      is_enabled: false,
    };
    return;
  }

  levels.value.splice(index, 1);
};

const moveLevel = (index, direction) => {
  if (!canManageLoyaltyLevels.value) return;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= levels.value.length) return;

  const moved = [...levels.value];
  const [item] = moved.splice(index, 1);
  moved.splice(nextIndex, 0, item);
  levels.value = moved.map((level, idx) => ({
    ...level,
    sort_order: (idx + 1) * 10,
  }));
};

const findUnusedPbGroup = () => {
  const usedIds = new Set(levels.value.map((level) => String(level.pb_group_id || "").trim()).filter(Boolean));
  return pbGroups.value.find((group) => !usedIds.has(String(group.id || "").trim())) || pbGroups.value[0] || null;
};

const applyNextPbGroup = (level) => {
  if (!canManageLoyaltyLevels.value) return;
  const nextGroup = findUnusedPbGroup();
  if (!nextGroup) return;
  level.pb_group_id = String(nextGroup.id || "").trim();
  level.pb_group_name = String(nextGroup.name || "").trim();
};

const saveLevels = async () => {
  if (!canManageLoyaltyLevels.value) return;
  const payload = levels.value.map((level, index) => ({
    id: level.id,
    name: String(level.name || "").trim(),
    threshold_amount: Math.max(0, toNumber(level.threshold_amount, 0)),
    earn_percentage: Math.max(0, Math.min(100, Math.floor(toNumber(level.earn_percentage, 0)))),
    max_spend_percentage: Math.max(0, Math.min(100, Math.floor(toNumber(level.max_spend_percentage, 0)))),
    is_enabled: level.is_enabled !== false,
    sort_order: Math.floor(toNumber(level.sort_order, (index + 1) * 10)),
    pb_group_id: String(level.pb_group_id || "").trim(),
    pb_group_name: String(level.pb_group_name || "").trim(),
  }));

  if (!payload.length) {
    showErrorNotification("Добавьте минимум один уровень");
    return;
  }

  saving.value = true;
  try {
    const response = await api.put("/api/admin/loyalty/levels", { levels: payload });
    levels.value = (Array.isArray(response.data?.levels) ? response.data.levels : []).map((level, index) => normalizeLevel(level, index));
    showSuccessNotification("Уровни лояльности сохранены");
  } catch (error) {
    showErrorNotification(error?.response?.data?.error || "Не удалось сохранить уровни");
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadLevels();
});
</script>
