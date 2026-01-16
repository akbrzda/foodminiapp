<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Пользователи панели</CardTitle>
          <CardDescription>Администраторы и менеджеры</CardDescription>
        </div>
        <Button @click="openModal()">
          <Plus :size="16" />
          Добавить пользователя
        </Button>
      </CardHeader>
    </Card>

    <Card>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Роль</label>
            <Select v-model="filters.role" @change="loadUsers">
              <option value="">Все роли</option>
              <option value="admin">Администратор</option>
              <option value="manager">Менеджер</option>
              <option value="ceo">CEO</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="filters.is_active" @change="loadUsers">
              <option value="">Все статусы</option>
              <option value="true">Активные</option>
              <option value="false">Неактивные</option>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Список пользователей</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
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
                <Badge :variant="roleVariant(user.role)">{{ getRoleLabel(user.role) }}</Badge>
              </TableCell>
              <TableCell>
                <Badge :variant="user.is_active ? 'success' : 'secondary'">{{ user.is_active ? "Активен" : "Неактивен" }}</Badge>
              </TableCell>
              <TableCell>
                <div v-if="user.role === 'manager' && user.cities?.length" class="flex flex-wrap gap-1">
                  <Badge v-for="city in user.cities" :key="city.id" variant="outline">{{ city.name }}</Badge>
                </div>
                <span v-else class="text-xs text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="openModal(user)">
                    <Pencil :size="16" />
                  </Button>
                  <Button
                    v-if="user.id !== authStore.user?.id"
                    variant="ghost"
                    size="icon"
                    @click="deleteUser(user)"
                  >
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <BaseModal v-if="showModal" :title="modalTitle" :subtitle="modalSubtitle" @close="closeModal">
      <form class="space-y-4" @submit.prevent="submitUser">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Имя</label>
            <Input v-model="form.first_name" required />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Фамилия</label>
            <Input v-model="form.last_name" required />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</label>
          <Input v-model="form.email" type="email" required />
        </div>

        <div v-if="!editing" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Пароль</label>
          <Input v-model="form.password" type="password" :required="!editing" minlength="6" />
          <p class="text-xs text-muted-foreground">Минимум 6 символов</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Роль</label>
            <Select v-model="form.role" required>
              <option value="admin">Администратор</option>
              <option value="manager">Менеджер</option>
              <option value="ceo">CEO</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</label>
            <Select v-model="form.is_active">
              <option :value="true">Активен</option>
              <option :value="false">Неактивен</option>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telegram ID (опционально)</label>
          <Input v-model="form.telegram_id" type="number" />
        </div>

        <div v-if="form.role === 'manager'">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Города доступа</label>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            <label v-for="city in referenceStore.cities" :key="city.id" class="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" :value="city.id" v-model="form.city_ids" class="h-4 w-4 rounded border-border" />
              <span>{{ city.name }}</span>
            </label>
          </div>
        </div>

        <Button class="w-full" type="submit">
          <Save :size="16" />
          Сохранить
        </Button>
      </form>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Save, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import { useReferenceStore } from "../stores/reference.js";
import { useAuthStore } from "../stores/auth.js";
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

const referenceStore = useReferenceStore();
const authStore = useAuthStore();

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
});

const modalTitle = computed(() => (editing.value ? "Редактировать пользователя" : "Новый пользователь"));
const modalSubtitle = computed(() => (editing.value ? "Измените данные пользователя" : "Добавьте нового администратора или менеджера"));

const getRoleLabel = (role) => {
  const labels = {
    admin: "Администратор",
    manager: "Менеджер",
    ceo: "CEO",
  };
  return labels[role] || role;
};

const roleVariant = (role) => {
  if (role === "admin") return "warning";
  if (role === "ceo") return "secondary";
  return "default";
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
      is_active: user.is_active,
      telegram_id: user.telegram_id || "",
      city_ids: user.cities?.map((c) => c.id) || [],
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
    alert(error.response?.data?.error || "Ошибка сохранения пользователя");
  }
};

const deleteUser = async (user) => {
  if (!confirm(`Удалить пользователя "${user.first_name} ${user.last_name}"?`)) return;
  try {
    await api.delete(`/api/admin/users/${user.id}`);
    await loadUsers();
  } catch (error) {
    console.error("Ошибка удаления пользователя:", error);
    alert(error.response?.data?.error || "Ошибка удаления пользователя");
  }
};

onMounted(async () => {
  await referenceStore.loadCities();
  await loadUsers();
});
</script>
