<template>
  <div class="space-y-6">
    <section class="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
      <div class="grid gap-4 md:grid-cols-4">
        <div class="md:col-span-2">
          <label class="text-xs uppercase tracking-widest text-ink/60">Поиск</label>
          <input
            v-model="filters.search"
            class="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-2 text-sm"
            placeholder="Имя или телефон"
            @keyup.enter="loadClients"
          />
        </div>
        <div>
          <label class="text-xs uppercase tracking-widest text-ink/60">Город</label>
          <select v-model="filters.city_id" class="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">Все</option>
            <option v-for="city in referenceStore.cities" :key="city.id" :value="city.id">{{ city.name }}</option>
          </select>
        </div>
        <div class="flex items-end">
          <button class="w-full rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white" @click="loadClients">
            Обновить
          </button>
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="space-y-3">
        <div
          v-for="client in clients"
          :key="client.id"
          class="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm transition"
          :class="selectedClient?.id === client.id ? 'ring-2 ring-mint' : ''"
          @click="selectClient(client)"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="panel-title text-base font-semibold text-ink">{{ client.first_name }} {{ client.last_name }}</p>
              <p class="text-xs text-ink/60">{{ formatPhone(client.phone) || "Нет телефона" }}</p>
            </div>
            <span class="rounded-full bg-ink/10 px-3 py-1 text-xs uppercase tracking-widest text-ink/60">{{ client.city_name || "—" }}</span>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-ink/60">
            <span>Заказов: {{ client.orders_count }}</span>
            <span>Бонусы: {{ client.bonus_balance }}</span>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
        <div v-if="!selectedClient" class="text-sm text-ink/60">Выберите клиента</div>
        <div v-else class="space-y-4">
          <div>
            <p class="panel-title text-lg font-semibold text-ink">{{ selectedClient.first_name }} {{ selectedClient.last_name }}</p>
            <p class="text-xs text-ink/60">{{ formatPhone(selectedClient.phone) }}</p>
            <p class="text-xs text-ink/60">{{ selectedClient.email || "email не указан" }}</p>
          </div>

          <div class="rounded-2xl border border-line bg-paper px-4 py-3">
            <p class="text-xs uppercase tracking-widest text-ink/60">Бонусный баланс</p>
            <p class="panel-title text-2xl font-semibold">{{ selectedClient.bonus_balance }}</p>
          </div>

          <div>
            <p class="text-xs uppercase tracking-widest text-ink/60">История заказов</p>
            <div class="mt-2 space-y-2">
              <div
                v-for="order in clientOrders"
                :key="order.id"
                class="rounded-2xl border border-line bg-white px-4 py-2 text-sm"
              >
                <div class="flex items-center justify-between">
                  <span>#{{ order.order_number }}</span>
                  <span>{{ formatCurrency(order.total) }}</span>
                </div>
                <div class="text-xs text-ink/60">{{ formatDateTime(order.created_at) }}</div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs uppercase tracking-widest text-ink/60">История бонусов</p>
            <div class="mt-2 space-y-2">
              <div
                v-for="bonus in bonusHistory"
                :key="bonus.id"
                class="rounded-2xl border border-line bg-white px-4 py-2 text-sm"
              >
                <div class="flex items-center justify-between">
                  <span>{{ bonus.type === "earned" ? "Начисление" : "Списание" }}</span>
                  <span>{{ bonus.amount }}</span>
                </div>
                <div class="text-xs text-ink/60">{{ formatDateTime(bonus.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import api from "../api/client.js";
import { useReferenceStore } from "../stores/reference.js";
import { formatCurrency, formatDateTime, formatPhone } from "../utils/format.js";

const referenceStore = useReferenceStore();
const clients = ref([]);
const selectedClient = ref(null);
const clientOrders = ref([]);
const bonusHistory = ref([]);

const filters = reactive({
  search: "",
  city_id: "",
});

const loadClients = async () => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const response = await api.get("/api/admin/clients", { params });
  clients.value = response.data.clients || [];
};

const selectClient = async (client) => {
  selectedClient.value = client;
  const [ordersResponse, bonusResponse] = await Promise.all([
    api.get(`/api/admin/clients/${client.id}/orders`),
    api.get(`/api/admin/clients/${client.id}/bonuses`),
  ]);
  clientOrders.value = ordersResponse.data.orders || [];
  bonusHistory.value = bonusResponse.data.transactions || [];
};

onMounted(async () => {
  await referenceStore.loadCities();
  await loadClients();
});
</script>
