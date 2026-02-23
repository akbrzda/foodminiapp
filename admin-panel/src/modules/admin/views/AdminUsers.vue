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
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div class="min-w-0 xl:col-span-2">
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
          <div class="min-w-0 xl:col-span-2">
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
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-40" />
              <Skeleton class="h-3 w-36" />
              <div class="flex items-center gap-2">
                <Skeleton class="h-6 w-20" />
                <Skeleton class="h-6 w-24" />
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="user in paginatedUsers" :key="`mobile-${user.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ user.first_name }} {{ user.last_name }}</div>
              <div class="text-xs text-muted-foreground">{{ user.email }}</div>
              <div v-if="user.telegram_id" class="text-xs text-muted-foreground mt-1">Telegram ID: {{ user.telegram_id }}</div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <Badge :variant="roleVariant(user.role)" :class="roleClass(user.role)">{{ getRoleLabel(user.role) }}</Badge>
                <Badge
                  variant="secondary"
                  :class="user.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ user.is_active ? "Активен" : "Неактивен" }}
                </Badge>
                <Badge
                  variant="secondary"
                  :class="user.eruda_enabled ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  Eruda: {{ user.eruda_enabled ? "Вкл" : "Выкл" }}
                </Badge>
              </div>
              <div class="mt-3">
                <div v-if="user.role === 'manager'" class="space-y-2">
                  <div v-if="user.branches?.length" class="flex flex-wrap gap-1">
                    <Badge v-for="branch in user.branches" :key="`mobile-branch-${user.id}-${branch.id}`" variant="secondary">{{ branch.name }}</Badge>
                  </div>
                  <div v-if="user.cities?.length" class="flex flex-wrap gap-1">
                    <Badge v-for="city in user.cities" :key="`mobile-city-${user.id}-${city.id}`" variant="outline">{{ city.name }}</Badge>
                  </div>
                  <span v-else class="text-xs text-muted-foreground">Доступ не назначен</span>
                </div>
                <span v-else class="text-xs text-muted-foreground">Полный доступ по роли</span>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <Button v-if="authStore.role === 'admin'" variant="ghost" size="icon" @click="openSecurityModal(user)">
                  <Shield :size="16" />
                </Button>
                <Button v-if="!(authStore.role === 'ceo' && user.role === 'admin')" variant="ghost" size="icon" @click="openModal(user)">
                  <Pencil :size="16" />
                </Button>
                <Button
                  v-if="user.id !== authStore.user?.id && !(authStore.role === 'ceo' && user.role === 'admin')"
                  variant="ghost"
                  size="icon"
                  @click="deleteUser(user)"
                >
                  <Trash2 :size="16" class="text-red-600" />
                </Button>
              </div>
            </div>
            <div v-if="users.length === 0" class="py-8 text-center text-sm text-muted-foreground">Пользователи не найдены</div>
          </template>
        </div>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Eruda</TableHead>
                <TableHead>Доступ</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-28" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-40" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="user in paginatedUsers" :key="user.id">
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
                    <Badge
                      variant="secondary"
                      :class="user.eruda_enabled ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                    >
                      {{ user.eruda_enabled ? "Включено" : "Выключено" }}
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
                      <Button v-if="authStore.role === 'admin'" variant="ghost" size="icon" @click="openSecurityModal(user)">
                        <Shield :size="16" />
                      </Button>
                      <Button
                        v-if="!(authStore.role === 'ceo' && user.role === 'admin')"
                        variant="ghost"
                        size="icon"
                        @click="openModal(user)"
                      >
                        <Pencil :size="16" />
                      </Button>
                      <Button
                        v-if="user.id !== authStore.user?.id && !(authStore.role === 'ceo' && user.role === 'admin')"
                        variant="ghost"
                        size="icon"
                        @click="deleteUser(user)"
                      >
                        <Trash2 :size="16" class="text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="users.length === 0">
                  <TableCell colspan="6" class="py-8 text-center text-sm text-muted-foreground">Пользователи не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <TablePagination :total="users.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
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
                  <Select v-model="form.role" required :disabled="authStore.role === 'ceo' && Boolean(editing)">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите роль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-if="authStore.role !== 'ceo'" value="admin">Администратор</SelectItem>
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
                <p class="text-xs text-muted-foreground">Используется для доступа к Eruda в mini app.</p>
              </FieldContent>
            </Field>
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
    <Dialog v-if="showSecurityModal" :open="showSecurityModal" @update:open="(value) => (value ? null : closeSecurityModal())">
      <DialogContent class="w-full max-w-3xl">
        <DialogHeader>
          <DialogTitle>Безопасность пользователя</DialogTitle>
          <DialogDescription>
            {{ securityUser?.first_name }} {{ securityUser?.last_name }} · {{ securityUser?.email }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outline" :disabled="securityLoading" @click="loadSecurityData">
              <RefreshCcw :size="16" />
              Обновить
            </Button>
            <Button variant="destructive" :disabled="securityLoading || securityResetLoading" @click="resetSecurityLimits()">
              <RotateCcw :size="16" />
              Сбросить все лимиты
            </Button>
          </div>

          <Card>
            <CardContent class="space-y-3">
              <div class="text-sm font-semibold text-foreground">Лимиты по IP</div>
              <div v-if="securityLoading" class="space-y-2">
                <Skeleton class="h-10 w-full" />
                <Skeleton class="h-10 w-full" />
              </div>
              <div v-else-if="securityLimits.length === 0" class="text-sm text-muted-foreground">Активных лимитов по IP не найдено</div>
              <div v-else class="space-y-2">
                <div v-for="item in securityLimits" :key="item.ip" class="rounded-lg border border-border p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-sm font-medium text-foreground">{{ item.ip }}</div>
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Попытки: {{ item.login_attempts }}</Badge>
                      <Badge variant="outline">Strikes: {{ item.shield_strikes }}</Badge>
                      <Badge v-if="item.is_banned" variant="secondary" class="bg-red-100 text-red-700 border-transparent">
                        Бан: {{ item.ban_ttl_seconds }}с
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        :disabled="securityResetLoading"
                        @click="resetSecurityLimits(item.ip)"
                      >
                        Сбросить IP
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="space-y-3">
              <div class="text-sm font-semibold text-foreground">Последние auth-события</div>
              <div v-if="securityLoading" class="space-y-2">
                <Skeleton class="h-8 w-full" />
                <Skeleton class="h-8 w-full" />
              </div>
              <div v-else-if="securityLogs.length === 0" class="text-sm text-muted-foreground">События пока отсутствуют</div>
              <div v-else class="space-y-2">
                <div v-for="log in securityLogs" :key="log.id" class="rounded-lg border border-border p-3 text-sm">
                  <div class="font-medium text-foreground">{{ log.action }}</div>
                  <div class="text-xs text-muted-foreground">{{ formatDateTime(log.created_at) }} · IP: {{ log.ip_address || "—" }}</div>
                  <div v-if="log.description" class="text-xs text-muted-foreground mt-1">{{ log.description }}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref, watch } from "vue";
import { Pencil, Plus, RefreshCcw, RotateCcw, Save, Shield, Trash2 } from "lucide-vue-next";
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
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { formatDateTime, normalizeBoolean } from "@/shared/utils/format.js";
const referenceStore = useReferenceStore();
const authStore = useAuthStore();
const { showErrorNotification } = useNotifications();
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("admin-users");
const users = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const showModal = ref(false);
const showSecurityModal = ref(false);
const editing = ref(null);
const securityUser = ref(null);
const securityLoading = ref(false);
const securityResetLoading = ref(false);
const securityLimits = ref([]);
const securityLogs = ref([]);
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
  eruda_enabled: false,
  city_ids: [],
  branch_ids: [],
});
const modalTitle = computed(() => (editing.value ? "Редактировать пользователя" : "Новый пользователь"));
const modalSubtitle = computed(() => (editing.value ? "Измените данные пользователя" : "Добавьте нового администратора или менеджера"));
const paginatedUsers = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return users.value.slice(start, start + pageSize.value);
});
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
const loadUsers = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const params = {};
    if (filters.value.role) params.role = filters.value.role;
    if (filters.value.is_active) params.is_active = filters.value.is_active;
    const response = await api.get("/api/admin/users", { params });
    users.value = response.data.users || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки пользователей:", error);
  } finally {
    isLoading.value = false;
  }
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
const openModal = (user = null) => {
  if (authStore.role === "ceo" && user?.role === "admin") {
    return;
  }
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
      eruda_enabled: normalizeBoolean(user.eruda_enabled, false),
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
      eruda_enabled: false,
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
const openSecurityModal = async (user) => {
  if (authStore.role !== "admin") return;
  securityUser.value = user;
  showSecurityModal.value = true;
  await loadSecurityData();
};
const closeSecurityModal = () => {
  showSecurityModal.value = false;
  securityUser.value = null;
  securityLimits.value = [];
  securityLogs.value = [];
};
const loadSecurityData = async () => {
  if (!securityUser.value?.id || authStore.role !== "admin") return;
  securityLoading.value = true;
  try {
    const response = await api.get(`/api/admin/users/${securityUser.value.id}/security`);
    securityLimits.value = response.data?.limits?.attempts_by_ip || [];
    securityLogs.value = response.data?.auth_logs || [];
  } catch (error) {
    devError("Ошибка загрузки данных безопасности пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка загрузки данных безопасности");
  } finally {
    securityLoading.value = false;
  }
};
const resetSecurityLimits = async (ip = "") => {
  if (!securityUser.value?.id || authStore.role !== "admin") return;
  securityResetLoading.value = true;
  try {
    await api.post(`/api/admin/users/${securityUser.value.id}/security/reset`, {
      type: "all",
      ip: ip || undefined,
    });
    await loadSecurityData();
  } catch (error) {
    devError("Ошибка сброса лимитов безопасности:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сброса лимитов");
  } finally {
    securityResetLoading.value = false;
  }
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
      eruda_enabled: Boolean(form.value.eruda_enabled),
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
    devError("Ошибка сохранения пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка сохранения пользователя");
  }
};
const hasTelegramId = computed(() => Boolean(String(form.value.telegram_id || "").trim()));
const deleteUser = async (user) => {
  if (!confirm(`Удалить пользователя "${user.first_name} ${user.last_name}"?`)) return;
  try {
    await api.delete(`/api/admin/users/${user.id}`);
    await loadUsers();
  } catch (error) {
    devError("Ошибка удаления пользователя:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления пользователя");
  }
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    if (shouldRestore.value) {
      const context = restoreContext();
      if (context) {
        filters.value = { ...filters.value, ...(context.filters || {}) };
        if (context.page) page.value = context.page;
        if (context.pageSize) pageSize.value = context.pageSize;
        await loadUsers({ preservePage: true });
        restoreScroll(context.scroll);
        return;
      }
    }
    await loadUsers();
  } catch (error) {
    devError("Ошибка загрузки пользователей:", error);
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
watch(
  () => form.value.telegram_id,
  (telegramId) => {
    if (!telegramId) {
      form.value.eruda_enabled = false;
    }
  },
);
watch(
  () => [filters.value.role, filters.value.is_active, page.value, pageSize.value],
  () => {
    saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  },
);
</script>
