<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Редактирование пользователя" description="Профиль, роль и индивидуальные доступы">
          <template #actions>
             <BackButton label="Назад" @click="goBack" />
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Card v-if="isLoading">
      <CardContent class="space-y-3 py-8">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-48 w-full" />
      </CardContent>
    </Card>

    <form v-else class="space-y-6" @submit.prevent="submitForm">
      <Card>
        <CardContent class="space-y-4">
          <div class="text-sm font-semibold text-foreground">Основные данные</div>
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Имя</FieldLabel>
              <FieldContent>
                <Input v-model="form.first_name" required />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фамилия</FieldLabel>
              <FieldContent>
                <Input v-model="form.last_name" required />
              </FieldContent>
            </Field>
          </FieldGroup>
 <FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</FieldLabel>
            <FieldContent>
              <Input v-model="form.email" type="email" required />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Новый пароль (Оставьте пустым, чтобы не менять пароль.)</FieldLabel>
            <FieldContent>
              <Input v-model="form.password" type="password" minlength="6" />
            </FieldContent>
          </Field>
        </fieldgroup>
          <FieldGroup class="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
              <FieldContent>
                <Select v-model="form.is_active">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="true">Активен</SelectItem>
                    <SelectItem :value="false">Неактивен</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram ID (опционально)</FieldLabel>
              <FieldContent>
                <Input v-model="form.telegram_id" type="number" />
              </FieldContent>
            </Field>
          </FieldGroup>
<FieldGroup class="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eruda</FieldLabel>
            <FieldContent>
              <Select v-model="form.eruda_enabled" :disabled="!hasTelegramId || authStore.role === 'ceo'">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Включено</SelectItem>
                  <SelectItem :value="false">Выключено</SelectItem>
                </SelectContent>
              </Select>
              <p v-if="authStore.role === 'ceo'" class="text-xs text-muted-foreground">CEO не может включать Eruda.</p>
              <p v-else-if="!hasTelegramId" class="text-xs text-muted-foreground">Для включения нужен Telegram ID.</p>
            </FieldContent>
          </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="text-sm font-semibold text-foreground">Роль</div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="option in roleOptions"
                :key="option.value"
                type="button"
                class="rounded-md border px-4 py-2 text-sm transition"
                :class="form.role === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-accent/40'"
                @click="form.role = option.value"
              >
                {{ option.label }}
              </button>
              <Button
                v-if="authStore.hasPermission('system.access.manage')"
                type="button"
                variant="ghost"
                class="text-primary"
                @click="router.push({ name: 'admin-users-access-roles' })"
              >
                + Новая роль
              </Button>
            </div>
          </div>

          <Field v-if="form.role === 'manager'">
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Города доступа</FieldLabel>
            <FieldContent>
              <div class="grid gap-2 md:grid-cols-2">
                <Label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" :value="Number(city.id)" v-model="form.city_ids" class="h-4 w-4 rounded border-border" />
                  <span>{{ city.name }}</span>
                </Label>
              </div>
            </FieldContent>
          </Field>

          <Field v-if="form.role === 'manager'">
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Филиалы доступа</FieldLabel>
            <FieldContent>
              <div class="grid gap-2 md:grid-cols-2">
                <Label v-for="branch in availableBranches" :key="branch.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" :value="Number(branch.id)" v-model="form.branch_ids" class="h-4 w-4 rounded border-border" />
                  <span>{{ branch.name }}{{ branch.city_name ? ` · ${branch.city_name}` : "" }}</span>
                </Label>
              </div>
              <p class="text-xs text-muted-foreground">Филиалы ограничены выбранными городами.</p>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>

      <Card v-if="authStore.hasPermission('system.access.manage')">
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-semibold text-foreground">Доступы пользователя</div>
            <div class="flex gap-2">
              <Button type="button" variant="outline" :disabled="accessLoading || isSaving" @click="resetAccessToRole">
                Сбросить до роли
              </Button>
            </div>
          </div>

          <div v-if="accessLoading" class="space-y-2">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </div>

          <div v-else class="overflow-x-auto rounded-lg border border-border">
            <table class="min-w-[720px] w-full text-sm">
              <thead class="bg-muted/60 text-muted-foreground">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold uppercase tracking-wide">Раздел</th>
                  <th class="w-72 px-4 py-3 text-left font-semibold uppercase tracking-wide">Доступ</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in sectionRows" :key="row.module">
                  <tr class="border-t border-border">
                    <td class="px-4 py-3 text-foreground">
                      <button
                        type="button"
                        class="flex items-center gap-2 text-left hover:text-primary"
                        :class="row.permissions.length > 1 ? '' : 'cursor-default hover:text-foreground'"
                        @click="toggleSection(row)"
                      >
                        <ChevronRight
                          v-if="row.permissions.length > 1"
                          :size="16"
                          class="shrink-0 transition-transform"
                          :class="isSectionExpanded(row.module) ? 'rotate-90' : ''"
                        />
                        <span>{{ row.label }}</span>
                      </button>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-border"
                          :checked="isSectionAllowed(row)"
                          @change="(event) => setSectionAccess(row, event.target.checked)"
                        />
                        <span class="text-xs text-muted-foreground">{{ getSectionStateLabel(row) }}</span>
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-for="permission in getVisibleSubPermissions(row)"
                    :key="permission.code"
                    class="border-t border-border bg-muted/20"
                  >
                    <td class="px-4 py-3 pl-10 text-sm text-muted-foreground">
                      {{ permission.label }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-border"
                          :checked="resolvePermissionEnabled(permission.code)"
                          @change="(event) => setPermissionAccess(permission.code, event.target.checked)"
                        />
                        <span class="text-xs text-muted-foreground">{{ getPermissionOriginLabel(permission.code) }}</span>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted-foreground">
            Чекбокс раздела включает/выключает все подразделы. Клик по названию раздела раскрывает подразделы для точечной настройки.
          </p>
        </CardContent>
      </Card>

      <div class="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" @click="router.push({ name: 'admin-users' })">Отмена</Button>
        <Button type="submit" :disabled="isSaving">Сохранить</Button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { ChevronRight } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { devError } from "@/shared/utils/logger";
import PageHeader from "@/shared/components/PageHeader.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import BackButton from "@/shared/components/BackButton.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";

const route = useRoute();
const router = useRouter();
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();

const userId = computed(() => Number(route.params.id));
const isLoading = ref(true);
const accessLoading = ref(true);
const isSaving = ref(false);

const form = ref({
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  role: "manager",
  is_active: true,
  telegram_id: "",
  eruda_enabled: false,
  city_ids: [],
  branch_ids: [],
});

const allPermissions = ref([]);
const rolePermissionCodes = ref([]);
const overrideEffectMap = ref({});
const accessRoles = ref([]);
const rolePermissionsCache = ref({});
const expandedSections = ref({});
const goBack = () => {
  router.push("/admin-users");
};
const roleOptions = [
  { value: "ceo", label: "CEO" },
  { value: "admin", label: "Администратор системы" },
  { value: "manager", label: "Менеджер" },
];

const moduleLabels = {
  dashboard: "Дашборд",
  orders: "Заказы",
  clients: "Клиенты",
  locations: "Локации",
  menu: "Меню",
  marketing: "Маркетинг",
  system: "Система",
};

const hasTelegramId = computed(() => Boolean(String(form.value.telegram_id || "").trim()));
const rolePermissionSet = computed(() => new Set(rolePermissionCodes.value));

const availableBranches = computed(() => {
  const cityIds = form.value.city_ids || [];
  if (cityIds.length === 0) return [];
  const cityNames = new Map(referenceStore.cities.map((city) => [city.id, city.name]));
  return cityIds.flatMap((cityId) => {
    const branches = referenceStore.branchesByCity?.[cityId] || [];
    return branches.map((branch) => ({
      ...branch,
      city_name: cityNames.get(branch.city_id) || "",
    }));
  });
});

const formatPermissionLabel = (permission) => {
  if (permission?.description) return permission.description;
  const code = String(permission?.code || "");
  const action = code.split(".").slice(1).join(".");
  return action || code;
};

const sectionRows = computed(() => {
  const groups = new Map();
  for (const permission of allPermissions.value) {
    const moduleName = permission.module || "other";
    if (!groups.has(moduleName)) {
      groups.set(moduleName, []);
    }
    groups.get(moduleName).push({
      code: permission.code,
      label: formatPermissionLabel(permission),
    });
  }

  return Array.from(groups.entries())
    .map(([module, permissions]) => ({
      module,
      label: moduleLabels[module] || module,
      permissions: permissions
        .slice()
        .sort((a, b) => String(a.label).localeCompare(String(b.label), "ru")),
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
});

const resolvePermissionEnabled = (code) => {
  const effect = overrideEffectMap.value[code];
  if (effect === "deny") return false;
  if (effect === "allow") return true;
  return rolePermissionSet.value.has(code);
};

const applyPermissionAccess = (next, code, enabled) => {
  const roleEnabled = rolePermissionSet.value.has(code);
  if (enabled === roleEnabled) {
    delete next[code];
    return;
  }
  next[code] = enabled ? "allow" : "deny";
};

const setPermissionAccess = (code, enabled) => {
  const next = { ...overrideEffectMap.value };
  applyPermissionAccess(next, code, enabled);
  overrideEffectMap.value = next;
};

const isSectionAllowed = (row) => {
  if (!row?.permissions?.length) return false;
  return row.permissions.some((permission) => resolvePermissionEnabled(permission.code));
};

const getSectionStateLabel = (row) => {
  const total = row?.permissions?.length || 0;
  if (total === 0) return "Нет прав";
  const enabled = row.permissions.filter((permission) => resolvePermissionEnabled(permission.code)).length;
  if (enabled === 0) return "Запрещено";
  if (enabled === total) return "Разрешено";
  return `Частично: ${enabled} из ${total}`;
};

const getPermissionOriginLabel = (code) => {
  const effect = overrideEffectMap.value[code];
  if (effect === "allow") return "Разрешено (индивидуально)";
  if (effect === "deny") return "Запрещено (индивидуально)";
  return rolePermissionSet.value.has(code) ? "Разрешено (по роли)" : "Запрещено (по роли)";
};

const setSectionAccess = (row, enabled) => {
  if (!row?.permissions?.length) return;
  const next = { ...overrideEffectMap.value };
  for (const permission of row.permissions) {
    applyPermissionAccess(next, permission.code, enabled);
  }
  overrideEffectMap.value = next;
};

const isSectionExpanded = (module) => Boolean(expandedSections.value[module]);

const toggleSection = (row) => {
  if (!row?.permissions || row.permissions.length <= 1) return;
  expandedSections.value = {
    ...expandedSections.value,
    [row.module]: !expandedSections.value[row.module],
  };
};

const getVisibleSubPermissions = (row) => {
  if (!row?.permissions || row.permissions.length <= 1) return [];
  if (!isSectionExpanded(row.module)) return [];
  return row.permissions;
};

const loadRolePermissionsByCode = async (roleCode) => {
  if (!authStore.hasPermission("system.access.manage")) {
    rolePermissionCodes.value = [];
    return;
  }

  if (rolePermissionsCache.value[roleCode]) {
    rolePermissionCodes.value = rolePermissionsCache.value[roleCode];
    return;
  }

  const role = accessRoles.value.find((item) => item.code === roleCode);
  if (!role) {
    rolePermissionCodes.value = [];
    return;
  }

  const response = await api.get(`/api/admin/access/roles/${role.id}/permissions`);
  const permissions = response.data?.data?.permissions || [];
  rolePermissionsCache.value = {
    ...rolePermissionsCache.value,
    [roleCode]: permissions,
  };
  rolePermissionCodes.value = permissions;
};

const loadUser = async () => {
  const response = await api.get(`/api/admin/users/${userId.value}`);
  const user = response.data?.user;
  if (!user) {
    throw new Error("Пользователь не найден");
  }

  form.value = {
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    email: user.email || "",
    password: "",
    role: user.role || "manager",
    is_active: user.is_active === undefined ? true : Boolean(user.is_active),
    telegram_id: user.telegram_id || "",
    eruda_enabled: Boolean(user.eruda_enabled),
    city_ids: (user.cities || []).map((city) => Number(city.id)).filter(Number.isFinite),
    branch_ids: (user.branches || []).map((branch) => Number(branch.id)).filter(Number.isFinite),
  };
};

const loadAccess = async () => {
  if (!authStore.hasPermission("system.access.manage")) return;
  accessLoading.value = true;
  try {
    const [permissionsResponse, overridesResponse, rolesResponse] = await Promise.all([
      api.get("/api/admin/access/permissions"),
      api.get(`/api/admin/access/users/${userId.value}/overrides`),
      api.get("/api/admin/access/roles"),
    ]);

    allPermissions.value = permissionsResponse.data?.data || [];
    accessRoles.value = rolesResponse.data?.data || [];

    const overrides = overridesResponse.data?.data?.overrides || [];
    overrideEffectMap.value = overrides.reduce((acc, item) => {
      if (item?.permission_code && ["allow", "deny"].includes(item?.effect)) {
        acc[item.permission_code] = item.effect;
      }
      return acc;
    }, {});

    await loadRolePermissionsByCode(form.value.role);
  } catch (error) {
    devError("Ошибка загрузки доступов пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось загрузить доступы пользователя");
  } finally {
    accessLoading.value = false;
  }
};

const resetAccessToRole = async () => {
  if (!authStore.hasPermission("system.access.manage")) return;
  try {
    await api.delete(`/api/admin/access/users/${userId.value}/overrides`);
    overrideEffectMap.value = {};
    showSuccessNotification("Индивидуальные доступы сброшены до прав роли");
  } catch (error) {
    devError("Ошибка сброса доступов:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сбросить доступы");
  }
};

const submitForm = async () => {
  isSaving.value = true;
  try {
    const payload = {
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      email: form.value.email,
      role: form.value.role,
      is_active: form.value.is_active,
      telegram_id: form.value.telegram_id ? Number(form.value.telegram_id) : null,
      eruda_enabled: Boolean(form.value.eruda_enabled),
      cities: form.value.city_ids,
      branch_ids: form.value.branch_ids || [],
    };

    if (form.value.password) {
      payload.password = form.value.password;
    }

    await api.put(`/api/admin/users/${userId.value}`, payload);

    if (authStore.hasPermission("system.access.manage")) {
      const overrides = Object.keys(overrideEffectMap.value).map((permission_code) => ({
        permission_code,
        effect: overrideEffectMap.value[permission_code],
      }));
      await api.put(`/api/admin/access/users/${userId.value}/overrides`, { overrides });
    }

    showSuccessNotification("Пользователь обновлен");
    router.push({ name: "admin-users" });
  } catch (error) {
    devError("Ошибка сохранения пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить пользователя");
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  try {
    if (!Number.isInteger(userId.value) || userId.value <= 0) {
      showErrorNotification("Некорректный идентификатор пользователя");
      router.push({ name: "admin-users" });
      return;
    }

    await referenceStore.loadCities();
    await loadUser();
    if (form.value.role === "manager") {
      await Promise.all((form.value.city_ids || []).map((cityId) => referenceStore.loadBranches(cityId)));
    }
    await loadAccess();
  } catch (error) {
    devError("Ошибка загрузки страницы редактирования:", error);
    showErrorNotification(error.response?.data?.error || error.message || "Не удалось загрузить пользователя");
    router.push({ name: "admin-users" });
  } finally {
    isLoading.value = false;
  }
});

watch(
  () => [...(form.value.city_ids || [])],
  async (cityIds) => {
    if (form.value.role !== "manager") return;
    await Promise.all(cityIds.map((cityId) => referenceStore.loadBranches(cityId)));
    if (form.value.branch_ids?.length) {
      form.value.branch_ids = form.value.branch_ids.filter((branchId) => availableBranches.value.some((branch) => branch.id === branchId));
    }
  },
);

watch(
  () => form.value.role,
  async (role) => {
    if (role !== "manager") {
      form.value.city_ids = [];
      form.value.branch_ids = [];
    }

    if (authStore.hasPermission("system.access.manage")) {
      await loadRolePermissionsByCode(role);
    }
  },
);

watch(
  () => form.value.telegram_id,
  (telegramId) => {
    if (!telegramId) {
      form.value.eruda_enabled = false;
    }
  },
);
</script>
