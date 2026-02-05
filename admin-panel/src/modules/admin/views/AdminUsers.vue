<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Пользователи панели" description="Администраторы и менеджеры">
          <template #actions>
            <Badge variant="secondary">Всего: {{ users.length }}</Badge>
            <Button @click="openModal()">
              <Plus :size="16" />
              Добавить пользователя
            </Button>
          </template>
          <template #filters>
            <div class="min-w-[180px]">
              <Field>
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Роль</FieldLabel>
                <FieldContent>
                  <Select v-model="filters.role" @update:modelValue="loadUsers">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Все роли" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все роли</SelectItem>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="manager">Менеджер</SelectItem>
                      <SelectItem value="ceo">CEO</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>
            <div class="min-w-[180px]">
              <Field>
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="filters.is_active" @update:modelValue="loadUsers">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Все статусы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все статусы</SelectItem>
                      <SelectItem value="true">Активные</SelectItem>
                      <SelectItem value="false">Неактивные</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Доступ</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="user in users" :key="user.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ user.first_name }} {{ user.last_name }}</div>
                <div class="text-xs text-muted-foreground">{{ user.email }}</div>
                <div v-if="user.telegram_id" class="text-xs text-muted-foreground">Telegram ID: {{ user.telegram_id }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="roleVariant(user.role)" :class="roleClass(user.role)">{{ getRoleLabel(user.role) }}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  :class="user.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ user.is_active ? "Активен" : "Неактивен" }}
                </Badge>
              </TableCell>
              <TableCell>
                <div v-if="user.role === 'manager'" class="space-y-2">
                  <div v-if="user.branches?.length" class="flex flex-wrap gap-1">
                    <Badge v-for="branch in user.branches" :key="branch.id" variant="secondary">{{ branch.name }}</Badge>
                  </div>
                  <div v-if="user.cities?.length" class="flex flex-wrap gap-1">
                    <Badge v-for="city in user.cities" :key="city.id" variant="outline">{{ city.name }}</Badge>
                  </div>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </div>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(user)">
                    <Pencil :size="16" />
                  </Button>
                  <Button v-if="user.id !== authStore.user?.id" variant="ghost" size="icon" @click="deleteUser(user)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitUser">
          <FieldGroup>
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
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</FieldLabel>
              <FieldContent>
                <Input v-model="form.email" type="email" required />
              </FieldContent>
            </Field>
            <Field v-if="!editing">
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Пароль</FieldLabel>
              <FieldContent>
                <Input v-model="form.password" type="password" :required="!editing" minlength="6" />
                <p class="text-xs text-muted-foreground">Минимум 6 символов</p>
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Роль</FieldLabel>
                <FieldContent>
                  <Select v-model="form.role" required>
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите роль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="manager">Менеджер</SelectItem>
                      <SelectItem value="ceo">CEO</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
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
            </FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram ID (опционально)</FieldLabel>
              <FieldContent>
                <Input v-model="form.telegram_id" type="number" />
              </FieldContent>
            </Field>
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
          </FieldGroup>
          <Button class="w-full" type="submit">
            <Save :size="16" />
            Сохранить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useAuthStore } from "@/shared/stores/auth.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { normalizeBoolean } from "@/shared/utils/format.js";
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification } = useNotifications();
const users = ref([]);
const showModal = ref(false);
const editing = ref(null);
const filters = ref({
  role: "",
  is_active: "",
});
const form = ref({
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  role: "manager",
  is_active: true,
  telegram_id: "",
  city_ids: [],
  branch_ids: [],
});
const modalTitle = computed(() => (editing.value ? "Редактировать пользователя" : "Новый пользователь"));
const modalSubtitle = computed(() => (editing.value ? "Измените данные пользователя" : "Добавьте нового администратора или менеджера"));
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
const getRoleLabel = (role) => {
  const labels = {
    admin: "Администратор",
    manager: "Менеджер",
    ceo: "CEO",
  };
  return labels[role] || role;
};
const roleVariant = (role) => {
  if (role === "ceo") return "secondary";
  return "default";
};
const roleClass = (role) => {
  if (role === "admin") return "bg-amber-100 text-amber-700 border-transparent";
  return "";
};
const loadUsers = async () => {
  try {
    const params = {};
    if (filters.value.role) params.role = filters.value.role;
    if (filters.value.is_active) params.is_active = filters.value.is_active;
    const response = await api.get("/api/admin/users", { params });
    users.value = response.data.users || [];
  } catch (error) {
    console.error("Ошибка загрузки пользователей:", error);
  }
};
const openModal = (user = null) => {
  editing.value = user;
  if (user) {
    form.value = {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      password: "",
      role: user.role,
      is_active: normalizeBoolean(user.is_active, true),
      telegram_id: user.telegram_id || "",
      city_ids: (user.cities || []).map((c) => Number(c.id)).filter(Number.isFinite),
      branch_ids: (user.branches || []).map((branch) => Number(branch.id)).filter(Number.isFinite),
    };
  } else {
    form.value = {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      role: "manager",
      is_active: true,
      telegram_id: "",
      city_ids: [],
      branch_ids: [],
    };
  }
  showModal.value = true;
};
const closeModal = () => {
  showModal.value = false;
  editing.value = null;
};
const submitUser = async () => {
  try {
    const payload = {
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      email: form.value.email,
      role: form.value.role,
      is_active: form.value.is_active,
      telegram_id: form.value.telegram_id ? Number(form.value.telegram_id) : null,
      cities: form.value.city_ids,
      branch_ids: form.value.branch_ids || [],
    };
    if (!editing.value) {
      payload.password = form.value.password;
    } else if (form.value.password) {
      payload.password = form.value.password;
    }
    if (editing.value) {
      await api.put(`/api/admin/users/${editing.value.id}`, payload);
    } else {
      await api.post("/api/admin/users", payload);
    }
    showModal.value = false;
    await loadUsers();
  } catch (error) {
    console.error("Ошибка сохранения пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сохранения пользователя");
  }
};
const deleteUser = async (user) => {
  if (!confirm(`Удалить пользователя "${user.first_name} ${user.last_name}"?`)) return;
  try {
    await api.delete(`/api/admin/users/${user.id}`);
    await loadUsers();
  } catch (error) {
    console.error("Ошибка удаления пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления пользователя");
  }
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    await loadUsers();
  } catch (error) {
    console.error("Ошибка загрузки пользователей:", error);
    showErrorNotification("Ошибка загрузки пользователей");
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
  (role) => {
    if (role !== "manager") {
      form.value.city_ids = [];
      form.value.branch_ids = [];
    }
  },
);
</script>
