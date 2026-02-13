<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Клиенты" description="Поиск по клиентам и фильтр по городу" />
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <div class="flex flex-wrap items-end gap-3">
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
        </div>
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
            <template v-if="isLoading">
              <TableRow v-for="index in 6" :key="`loading-${index}`">
                <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-8" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="client in paginatedClients" :key="client.id" class="cursor-pointer" @click="openClient(client.id)">
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
              <TableRow v-if="clients.length === 0">
                <TableCell colspan="6" class="py-8 text-center text-sm text-muted-foreground">Клиенты не найдены</TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <TablePagination :total="clients.length" :page="page" :page-size="pageSize" @update:page="page = $event" @update:page-size="onPageSizeChange" />
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ChevronRight, Search } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import { useReferenceStore } from "@/shared/stores/reference.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
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
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
const referenceStore = useReferenceStore();
const { showErrorNotification } = useNotifications();
const router = useRouter();

// Навигационный контекст
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("clients");
const clients = ref([]);
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const loadTimer = ref(null);
const filters = reactive({
  search: "",
  city_id: "",
});
const paginatedClients = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return clients.value.slice(start, start + pageSize.value);
});
const loadClients = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const response = await api.get("/api/admin/clients", { params });
    clients.value = response.data.clients || [];
    if (!preservePage) {
      page.value = 1;
    }
  } catch (error) {
    devError("Ошибка загрузки клиентов:", error);
    showErrorNotification("Ошибка загрузки клиентов");
  } finally {
    isLoading.value = false;
  }
};
const scheduleLoad = () => {
  if (loadTimer.value) {
    clearTimeout(loadTimer.value);
  }
  loadTimer.value = setTimeout(loadClients, 300);
};
const openClient = (clientId) => {
  // Сохраняем контекст перед переходом
  saveContext(filters, { page: page.value, pageSize: pageSize.value });
  router.push(`/clients/${clientId}`);
};
const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};
onMounted(async () => {
  try {
    await referenceStore.loadCities();
    
    // Проверяем, нужно ли восстанавливать контекст
    if (shouldRestore.value) {
      const context = restoreContext();
      
      if (context) {
        // Восстанавливаем фильтры и пагинацию
        Object.assign(filters, context.filters);
        if (context.page) page.value = context.page;
        if (context.pageSize) pageSize.value = context.pageSize;
        
        await loadClients({ preservePage: true });
        restoreScroll(context.scroll);
      }
    } else {
      await loadClients();
    }
  } catch (error) {
    devError("Ошибка загрузки клиентов:", error);
    showErrorNotification("Ошибка загрузки клиентов");
  }
});
watch(
  filters,
  () => {
    page.value = 1;
    scheduleLoad();
  },
  { deep: true },
);
</script>
