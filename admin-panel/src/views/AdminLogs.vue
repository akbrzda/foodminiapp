<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Действия администраторов</CardTitle>
        <CardDescription>История изменений в системе</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-5">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Администратор</label>
            <Select v-model="filters.admin_id">
              <option value="">Все</option>
              <option v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.first_name }} {{ admin.last_name }}</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип действия</label>
            <Select v-model="filters.action_type">
              <option value="">Все</option>
              <option value="create">Создание</option>
              <option value="update">Изменение</option>
              <option value="delete">Удаление</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Объект</label>
            <Select v-model="filters.object_type">
              <option value="">Все</option>
              <option value="category">Категория</option>
              <option value="item">Товар</option>
              <option value="modifier">Модификатор</option>
              <option value="order">Заказ</option>
              <option value="polygon">Полигон</option>
              <option value="settings">Настройки</option>
              <option value="user">Пользователь</option>
              <option value="city">Город</option>
              <option value="branch">Филиал</option>
            </Select>
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата от</label>
            <Input v-model="filters.date_from" type="date" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата до</label>
            <Input v-model="filters.date_to" type="date" />
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button @click="loadLogs">
            <RefreshCcw :size="16" />
            Обновить
          </Button>
          <Button variant="outline" @click="resetFilters">
            <RotateCcw :size="16" />
            Сбросить
          </Button>
          <Badge variant="secondary">Всего: {{ formatNumber(pagination.total) }}</Badge>
        </div>
      </CardContent>
    </Card>

    <Card v-if="loading">
      <CardContent class="py-12 text-center">
        <div class="text-muted-foreground">Загрузка...</div>
      </CardContent>
    </Card>

    <Card v-else-if="logs.length === 0">
      <CardContent class="py-12 text-center">
        <div class="text-muted-foreground">Логи не найдены</div>
      </CardContent>
    </Card>

    <Card v-else>
      <CardHeader>
        <CardTitle>Записи</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата/Время</TableHead>
              <TableHead>Администратор</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Объект</TableHead>
              <TableHead>IP</TableHead>
              <TableHead class="text-right">Детали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="log in logs" :key="log.id">
              <TableCell>
                <div class="text-sm">{{ formatDateTime(log.created_at) }}</div>
              </TableCell>
              <TableCell>
                <div class="text-sm font-medium">{{ log.admin_name }}</div>
                <div class="text-xs text-muted-foreground">{{ log.admin_email }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="getActionVariant(log.action)">
                  {{ getActionLabel(log.action) }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="text-sm">{{ getObjectLabel(log.object_type) }}</div>
                <div class="text-xs text-muted-foreground">#{{ log.object_id }}</div>
              </TableCell>
              <TableCell>
                <span class="text-xs text-muted-foreground">{{ log.ip_address || "—" }}</span>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" @click="showDetails(log)">
                  <Eye :size="16" />
                  Просмотр
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card v-if="pagination.total > pagination.limit">
      <CardContent class="py-4">
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            Показаны записи {{ (pagination.page - 1) * pagination.limit + 1 }} -
            {{ Math.min(pagination.page * pagination.limit, pagination.total) }} из {{ formatNumber(pagination.total) }}
          </div>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="pagination.page === 1" @click="prevPage">Назад</Button>
            <Button variant="outline" size="sm" :disabled="pagination.page >= Math.ceil(pagination.total / pagination.limit)" @click="nextPage">
              Вперед
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Модальное окно деталей -->
    <BaseModal v-model:open="detailsModal.open" :title="`Детали действия #${detailsModal.log?.id || ''}`">
      <div v-if="detailsModal.log" class="space-y-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дата и время</div>
          <div class="text-sm">{{ formatDateTime(detailsModal.log.created_at) }}</div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Администратор</div>
          <div class="text-sm">{{ detailsModal.log.admin_name }} ({{ detailsModal.log.admin_email }})</div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Действие</div>
          <div class="text-sm">{{ getActionLabel(detailsModal.log.action) }}</div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Объект</div>
          <div class="text-sm">{{ getObjectLabel(detailsModal.log.object_type) }} #{{ detailsModal.log.object_id }}</div>
        </div>
        <div v-if="detailsModal.log.ip_address">
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IP адрес</div>
          <div class="text-sm">{{ detailsModal.log.ip_address }}</div>
        </div>
        <div v-if="detailsModal.log.details">
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Детали изменений</div>
          <pre class="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{{ formatJSON(detailsModal.log.details) }}</pre>
        </div>
      </div>
      <template #footer>
        <Button variant="outline" @click="detailsModal.open = false">Закрыть</Button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { Eye, RefreshCcw, RotateCcw } from "lucide-vue-next";
import api from "../api/client.js";
import BaseModal from "../components/BaseModal.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatDateTime, formatNumber } from "../utils/format.js";
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

const logs = ref([]);
const admins = ref([]);
const loading = ref(false);
const { showErrorNotification } = useNotifications();

const filters = reactive({
  admin_id: "",
  action_type: "",
  object_type: "",
  date_from: "",
  date_to: "",
});

const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
});

const detailsModal = reactive({
  open: false,
  log: null,
});

const loadLogs = async () => {
  loading.value = true;
  try {
    const params = {
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
      page: pagination.page,
      limit: pagination.limit,
    };
    const response = await api.get("/api/admin/logs", { params });
    logs.value = response.data.logs || [];
    pagination.total = response.data.total || 0;
  } catch (error) {
    console.error("Ошибка загрузки логов:", error);
    const message = error.response?.data?.error || error.message || "Неизвестная ошибка";
    showErrorNotification(`Ошибка загрузки логов: ${message}`);
  } finally {
    loading.value = false;
  }
};

const loadAdmins = async () => {
  try {
    const response = await api.get("/api/admin/users/admins");
    admins.value = response.data.admins || [];
  } catch (error) {
    console.error("Ошибка загрузки администраторов:", error);
    const message = error.response?.data?.error || error.message || "Неизвестная ошибка";
    showErrorNotification(`Ошибка загрузки администраторов: ${message}`);
  }
};

const resetFilters = () => {
  Object.assign(filters, {
    admin_id: "",
    action_type: "",
    object_type: "",
    date_from: "",
    date_to: "",
  });
  pagination.page = 1;
  loadLogs();
};

const prevPage = () => {
  if (pagination.page > 1) {
    pagination.page--;
    loadLogs();
  }
};

const nextPage = () => {
  if (pagination.page < Math.ceil(pagination.total / pagination.limit)) {
    pagination.page++;
    loadLogs();
  }
};

const showDetails = (log) => {
  detailsModal.log = log;
  detailsModal.open = true;
};

const getActionLabel = (action) => {
  const labels = {
    create: "Создание",
    update: "Изменение",
    delete: "Удаление",
  };
  return labels[action] || action;
};

const getActionVariant = (action) => {
  const variants = {
    create: "success",
    update: "default",
    delete: "destructive",
  };
  return variants[action] || "default";
};

const getObjectLabel = (objectType) => {
  const labels = {
    category: "Категория",
    item: "Товар",
    modifier: "Модификатор",
    order: "Заказ",
    polygon: "Полигон",
    settings: "Настройки",
    user: "Пользователь",
    city: "Город",
    branch: "Филиал",
  };
  return labels[objectType] || objectType;
};

const formatJSON = (json) => {
  if (typeof json === "string") {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }
  return JSON.stringify(json, null, 2);
};

onMounted(async () => {
  await Promise.all([loadAdmins(), loadLogs()]);
});
</script>
