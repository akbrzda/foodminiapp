<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Клиенты" description="Поиск по клиентам и фильтр по городу">
          <template #filters>
            <div class="min-w-[220px] flex-1 space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</label>
              <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
                <Input v-model="filters.search" class="pl-9" placeholder="Имя или телефон" @keyup.enter="loadClients" />
              </div>
            </div>
            <div class="min-w-[180px] space-y-1">
              <label class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</label>
              <Select v-model="filters.city_id">
                <option value="">Все</option>
                <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
              </Select>
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
              <TableHead>Клиент</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Город</TableHead>
              <TableHead>Заказы</TableHead>
              <TableHead>Бонусы</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="client in clients" :key="client.id" class="cursor-pointer" @click="openClient(client.id)">
              <TableCell>
                <div class="font-medium text-foreground">{{ client.first_name }} {{ client.last_name }}</div>
                <div class="text-xs text-muted-foreground">ID: {{ client.id }}</div>
              </TableCell>
              <TableCell>{{ formatPhone(client.phone) || "—" }}</TableCell>
              <TableCell>
                <Badge variant="secondary">{{ client.city_name || "—" }}</Badge>
              </TableCell>
              <TableCell>{{ formatNumber(client.orders_count) }}</TableCell>
              <TableCell>{{ formatNumber(client.loyalty_balance) }}</TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="icon">
                  <ChevronRight :size="16" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ChevronRight, Search } from "lucide-vue-next";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { useNotifications } from "../composables/useNotifications.js";
import { formatNumber, formatPhone } from "../utils/format.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import CardContent from "../components/ui/CardContent.vue";
import PageHeader from "../components/PageHeader.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();
const router = useRouter();
const clients = ref([]);
const loadTimer = ref(null);
const filters = reactive({
  search: "",
  city_id: "",
});
const loadClients = async () => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const response = await api.get("/api/admin/clients", { params });
  clients.value = response.data.clients || [];
};
const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadClients, 300);
};
const openClient = (clientId) => {
  router.push(`/clients/${clientId}`);
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    await loadClients();
  } catch (error) {
    console.error("Ошибка загрузки клиентов:", error);
    showErrorNotification("Ошибка загрузки клиентов");
  }
});
watch(
  filters,
  () => {
    scheduleLoad();
  },
  { deep: true },
);
</script>
