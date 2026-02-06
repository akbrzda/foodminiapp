import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Клиенты" description="Поиск по клиентам и фильтр по городу">
          <template #filters>
            <div class="min-w-[220px] flex-1">
              <Field>
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Поиск</FieldLabel>
                <FieldContent>
                  <div class="relative">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" :size="16" />
                    <Input v-model="filters.search" class="pl-9" placeholder="Имя или телефон" @keyup.enter="loadClients" />
                  </div>
                </FieldContent>
              </Field>
            </div>
            <div class="min-w-[180px]">
              <Field>
                <FieldLabel class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Город</FieldLabel>
                <FieldContent>
                  <Select v-model="filters.city_id">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Все города" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Все</SelectItem>
                      <SelectItem v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</SelectItem>
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
              <TableCell>
                <a
                  v-if="normalizePhone(client.phone)"
                  class="text-foreground hover:underline"
                  :href="`tel:${normalizePhone(client.phone)}`"
                  @click.stop
                >
                  {{ formatPhone(client.phone) }}
                </a>
                <span v-else>—</span>
              </TableCell>
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
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { formatNumber, formatPhone, normalizePhone } from "@/shared/utils/format.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Input from "@/shared/components/ui/input/Input.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Field, FieldContent, FieldLabel } from "@/shared/components/ui/field";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
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
    devError("Ошибка загрузки клиентов:", error);
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
