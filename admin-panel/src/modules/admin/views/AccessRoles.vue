<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Роли и доступы" description="Управление ролями и их правами доступа">
          <template #actions>
            <Button variant="outline" :disabled="loading" @click="loadInitialData">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
            <Button @click="openRoleDialog()">
              <Plus :size="16" />
              Новая роль
            </Button>
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
                  <Badge v-if="role.is_system" variant="secondary">Системная</Badge>
                  <Badge :variant="role.is_active ? 'default' : 'outline'">{{ role.is_active ? "Активна" : "Неактивна" }}</Badge>
                </div>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">Прав: {{ role.permissions_count || 0 }}</div>
              <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click.stop="openRoleDialog(role)">
                  <Pencil :size="16" />
                  Изменить
                </Button>
                <Button v-if="!role.is_system" variant="ghost" size="sm" class="text-red-600 hover:text-red-700" @click.stop="deleteRole(role)">
                  <Trash2 :size="16" />
                  Удалить
                </Button>
              </div>
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
            <Button :disabled="!selectedRole || permissionsLoading || permissionsSaving" @click="saveRolePermissions">
              <Save :size="16" />
              Сохранить права
            </Button>
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
                  <input v-model="selectedPermissionCodes" type="checkbox" :value="permission.code" class="mt-0.5 h-4 w-4 rounded border-border" />
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

    <Dialog v-if="roleDialogOpen" :open="roleDialogOpen" @update:open="(value) => (value ? null : closeRoleDialog())">
      <DialogContent class="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{{ editingRole ? "Редактировать роль" : "Новая роль" }}</DialogTitle>
          <DialogDescription>
            {{ editingRole ? "Обновите название и статус роли" : "Создайте дополнительную роль для гибкой выдачи доступов" }}
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitRole">
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Код роли</FieldLabel>
            <FieldContent>
              <Input v-model="roleForm.code" :disabled="Boolean(editingRole)" required placeholder="например, support" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
            <FieldContent>
              <Input v-model="roleForm.name" required placeholder="Например, Поддержка" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
            <FieldContent>
              <Select v-model="roleForm.is_active">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="true">Активна</SelectItem>
                  <SelectItem :value="false">Неактивна</SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Button class="w-full" type="submit" :disabled="roleSaving">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { devError } from "@/shared/utils/logger";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

const { showErrorNotification, showSuccessNotification } = useNotifications();

const loading = ref(false);
const permissionsLoading = ref(false);
const permissionsSaving = ref(false);
const roleSaving = ref(false);

const roles = ref([]);
const permissions = ref([]);
const selectedRole = ref(null);
const selectedPermissionCodes = ref([]);

const roleDialogOpen = ref(false);
const editingRole = ref(null);
const roleForm = ref({
  code: "",
  name: "",
  is_active: true,
});

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

const openRoleDialog = (role = null) => {
  editingRole.value = role;
  roleForm.value = role
    ? {
        code: role.code,
        name: role.name,
        is_active: Boolean(role.is_active),
      }
    : {
        code: "",
        name: "",
        is_active: true,
      };
  roleDialogOpen.value = true;
};

const closeRoleDialog = () => {
  roleDialogOpen.value = false;
  editingRole.value = null;
};

const submitRole = async () => {
  roleSaving.value = true;
  try {
    const isEditMode = Boolean(editingRole.value);
    if (editingRole.value) {
      await api.put(`/api/admin/access/roles/${editingRole.value.id}`, {
        name: roleForm.value.name,
        is_active: roleForm.value.is_active,
      });
    } else {
      await api.post("/api/admin/access/roles", {
        code: roleForm.value.code,
        name: roleForm.value.name,
        is_active: roleForm.value.is_active,
      });
    }

    closeRoleDialog();
    showSuccessNotification(isEditMode ? "Роль обновлена" : "Роль создана");
    await loadInitialData();
  } catch (error) {
    devError("Ошибка сохранения роли:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось сохранить роль");
  } finally {
    roleSaving.value = false;
  }
};

const deleteRole = async (role) => {
  if (!confirm(`Удалить роль "${role.name}"?`)) return;
  try {
    await api.delete(`/api/admin/access/roles/${role.id}`);
    showSuccessNotification("Роль удалена");
    if (selectedRole.value?.id === role.id) {
      selectedRole.value = null;
      selectedPermissionCodes.value = [];
    }
    await loadRoles();
  } catch (error) {
    devError("Ошибка удаления роли:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось удалить роль");
  }
};

onMounted(async () => {
  await loadInitialData();
});
</script>
