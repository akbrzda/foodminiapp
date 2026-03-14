<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Роли и доступы" description="Управление ролями и правами доступа">
          <template #actions>
            <div class="header-actions">
              <Button variant="outline" :disabled="loading" @click="loadInitialData">
                <RefreshCcw :size="16" />
                Обновить
              </Button>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card>
        <CardContent class="space-y-4">
          <div class="text-sm font-semibold text-foreground">Роли</div>

          <div v-if="loading" class="space-y-2">
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </div>

          <div v-else-if="roles.length === 0" class="rounded-lg border border-border p-4 text-sm text-muted-foreground">Роли не найдены</div>

          <div v-else class="space-y-2">
            <button
              v-for="role in roles"
              :key="role.id"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedRole?.id === role.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40'"
              @click="selectRole(role)"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-medium text-foreground">{{ role.name }}</div>
                  <div class="text-xs text-muted-foreground">{{ role.code }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <Badge variant="outline">{{ getSystemRoleLabel(role.code) }}</Badge>
                  <Badge v-if="role.is_system" variant="secondary">Системная</Badge>
                  <Badge :variant="role.is_active ? 'default' : 'outline'">{{ role.is_active ? "Активна" : "Неактивна" }}</Badge>
                </div>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">Прав: {{ role.permissions_count || 0 }}</div>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-sm font-semibold text-foreground">Права роли</div>
              <div class="text-xs text-muted-foreground">
                {{ selectedRole ? `${selectedRole.name} (${selectedRole.code})` : "Выберите роль" }}
              </div>
            </div>
            <Button v-if="canManageAccess" :disabled="!selectedRole || permissionsLoading || permissionsSaving" @click="saveRolePermissions">
              <Save :size="16" />
              Сохранить права
            </Button>
          </div>
          <div class="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            Создание, удаление и изменение метаданных ролей отключено. Доступно только управление правами системных ролей.
          </div>

          <div v-if="permissionsLoading" class="space-y-2">
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
          </div>

          <div v-else-if="!selectedRole" class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Выберите роль слева, чтобы редактировать доступы.
          </div>

          <div v-else class="space-y-4">
            <div v-for="group in groupedPermissions" :key="group.module" class="rounded-lg border border-border p-3">
              <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ formatModule(group.module) }}</div>
              <div class="space-y-2">
                <Label v-for="permission in group.items" :key="permission.code" class="flex items-start gap-3 text-sm">
                  <input
                    v-model="selectedPermissionCodes"
                    type="checkbox"
                    :value="permission.code"
                    :disabled="!canManageAccess"
                    class="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span class="space-y-0.5">
                    <span class="block font-medium text-foreground">{{ permission.description || "Описание не задано" }}</span>
                    <span class="block text-xs text-muted-foreground">{{ permission.code }}</span>
                  </span>
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RefreshCcw, Save } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { devError } from "@/shared/utils/logger";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Label } from "@/shared/components/ui/label";

const { showErrorNotification, showSuccessNotification } = useNotifications();
const authStore = useAuthStore();
const canManageAccess = computed(() => authStore.hasPermission("system.access.manage"));

const loading = ref(false);
const permissionsLoading = ref(false);
const permissionsSaving = ref(false);

const roles = ref([]);
const permissions = ref([]);
const selectedRole = ref(null);
const selectedPermissionCodes = ref([]);

const groupedPermissions = computed(() => {
  const groups = new Map();
  for (const permission of permissions.value) {
    const moduleName = permission.module || "other";
    if (!groups.has(moduleName)) {
      groups.set(moduleName, []);
    }
    groups.get(moduleName).push(permission);
  }

  return Array.from(groups.entries())
    .map(([module, items]) => ({
      module,
      items: items.slice().sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "ru")),
    }))
    .sort((a, b) => String(a.module).localeCompare(String(b.module), "ru"));
});

const formatModule = (value) => {
  const labels = {
    dashboard: "Дашборд",
    orders: "Заказы",
    clients: "Клиенты",
    locations: "Локации",
    menu: "Меню",
    marketing: "Маркетинг",
    system: "Система",
  };
  return labels[value] || value;
};
const getSystemRoleLabel = (value) => {
  const labels = {
    admin: "Admin",
    manager: "Manager",
    ceo: "CEO",
  };
  return labels[value] || value;
};

const loadRoles = async () => {
  const response = await api.get("/api/admin/access/roles");
  roles.value = response.data?.data || [];
};

const loadPermissions = async () => {
  const response = await api.get("/api/admin/access/permissions");
  permissions.value = response.data?.data || [];
};

const selectRole = async (role) => {
  selectedRole.value = role;
  permissionsLoading.value = true;
  try {
    const response = await api.get(`/api/admin/access/roles/${role.id}/permissions`);
    selectedPermissionCodes.value = response.data?.data?.permissions || [];
  } catch (error) {
    devError("Ошибка загрузки прав роли:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось загрузить права роли");
  } finally {
    permissionsLoading.value = false;
  }
};

const loadInitialData = async () => {
  loading.value = true;
  try {
    await Promise.all([loadRoles(), loadPermissions()]);
    if (selectedRole.value) {
      const updated = roles.value.find((role) => role.id === selectedRole.value.id);
      if (updated) {
        await selectRole(updated);
      } else {
        selectedRole.value = null;
        selectedPermissionCodes.value = [];
      }
    }
  } catch (error) {
    devError("Ошибка загрузки матрицы доступов:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось загрузить матрицу доступов");
  } finally {
    loading.value = false;
  }
};

const saveRolePermissions = async () => {
  if (!canManageAccess.value) return;
  if (!selectedRole.value) return;
  permissionsSaving.value = true;
  try {
    await api.put(`/api/admin/access/roles/${selectedRole.value.id}/permissions`, {
      permission_codes: selectedPermissionCodes.value,
    });
    showSuccessNotification("Права роли обновлены");
    await loadRoles();
  } catch (error) {
    devError("Ошибка сохранения прав роли:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить права роли");
  } finally {
    permissionsSaving.value = false;
  }
};

onMounted(async () => {
  await loadInitialData();
});
</script>
