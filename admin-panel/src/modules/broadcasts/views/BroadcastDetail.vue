import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader :title="campaign?.name || 'Рассылка'" :description="campaign?.description || 'Детальная статистика'">
          <template #actions>
            <Button variant="secondary" @click="goBack">
              <ArrowLeft :size="16" />
              Назад
            </Button>
            <Button variant="secondary" @click="editCampaign">
              <Pencil :size="16" />
              Редактировать
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <div class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Всего получателей</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.total_recipients || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Отправлено</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.sent_count || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Ошибки</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.failed_count || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Клики</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.click_count || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Конверсии</div>
          <div class="text-2xl font-semibold">{{ formatNumber(stats.conversion_count || 0) }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="text-xs text-muted-foreground">Выручка</div>
          <div class="text-2xl font-semibold">{{ formatCurrency(stats.conversion_amount || 0) }}</div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Контент рассылки</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
          {{ campaign?.content_text || "—" }}
        </div>
        <div v-if="campaign?.content_image_url" class="rounded-lg border border-border p-2">
          <img :src="campaign.content_image_url" alt="" class="w-full rounded-md" />
        </div>
        <div v-if="buttons.length" class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Кнопки</div>
          <div class="flex flex-wrap gap-2">
            <Badge v-for="(btn, index) in buttons" :key="index" variant="secondary">{{ btn.text || btn.label || btn.url }}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Сообщения</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Отправлено</TableHead>
              <TableHead>Ошибка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="message in messages" :key="message.id">
              <TableCell>
                <div class="text-sm">{{ message.first_name }} {{ message.last_name }}</div>
                <a
                  v-if="normalizePhone(message.phone)"
                  class="text-xs text-muted-foreground hover:underline"
                  :href="`tel:${normalizePhone(message.phone)}`"
                >
                  {{ formatPhone(message.phone) }}
                </a>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </TableCell>
              <TableCell>{{ statusLabel(message.status) }}</TableCell>
              <TableCell>{{ formatDateTime(message.sent_at) || "—" }}</TableCell>
              <TableCell class="text-xs text-muted-foreground">{{ message.error_message || "—" }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Конверсии</CardTitle>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Заказ</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Дней после</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="conversion in conversions" :key="conversion.id">
              <TableCell>
                <div class="text-sm">{{ conversion.first_name }} {{ conversion.last_name }}</div>
                <a
                  v-if="normalizePhone(conversion.phone)"
                  class="text-xs text-muted-foreground hover:underline"
                  :href="`tel:${normalizePhone(conversion.phone)}`"
                >
                  {{ formatPhone(conversion.phone) }}
                </a>
                <div v-else class="text-xs text-muted-foreground">—</div>
              </TableCell>
              <TableCell>#{{ conversion.order_number }}</TableCell>
              <TableCell>{{ formatCurrency(conversion.order_total || 0) }}</TableCell>
              <TableCell>{{ formatDateTime(conversion.order_created_at) }}</TableCell>
              <TableCell>{{ conversion.days_after_broadcast }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { ArrowLeft, Pencil } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useOrdersStore } from "@/modules/orders/stores/orders.js";
import { formatCurrency, formatDateTime, formatNumber, formatPhone, normalizePhone } from "@/shared/utils/format.js";

const route = useRoute();
const router = useRouter();
const { showErrorNotification } = useNotifications();
const ordersStore = useOrdersStore();
const campaignId = computed(() => Number(route.params.id || 0));
const campaign = ref(null);
const stats = ref({});
const messages = ref([]);
const conversions = ref([]);

const buttons = computed(() => {
  if (!campaign.value?.content_buttons) return [];
  if (Array.isArray(campaign.value.content_buttons)) return campaign.value.content_buttons;
  return [];
});

const statusLabel = (status) => {
  const labels = {
    pending: "Ожидает",
    sending: "Отправляется",
    sent: "Отправлено",
    failed: "Ошибка",
  };
  return labels[status] || status || "—";
};
const updateBreadcrumbs = () => {
  const name = campaign.value?.name || "Рассылка";
  ordersStore.setBreadcrumbs([{ label: "Рассылки", to: "/broadcasts" }, { label: "Статистика " + name }], route.name);
};

const loadCampaign = async () => {
  try {
    const response = await api.get(`/api/broadcasts/${campaignId.value}`);
    campaign.value = response.data?.data?.campaign || null;
    stats.value = response.data?.data?.stats || {};
    updateBreadcrumbs();
  } catch (error) {
    devError("Ошибка загрузки рассылки:", error);
    showErrorNotification("Не удалось загрузить рассылку");
  }
};

const loadMessages = async () => {
  try {
    const response = await api.get(`/api/broadcasts/${campaignId.value}/messages`);
    messages.value = response.data?.data?.items || [];
  } catch (error) {
    devError("Ошибка загрузки сообщений:", error);
  }
};

const loadConversions = async () => {
  try {
    const response = await api.get(`/api/broadcasts/${campaignId.value}/conversions`);
    conversions.value = response.data?.data?.items || [];
  } catch (error) {
    devError("Ошибка загрузки конверсий:", error);
  }
};

const goBack = () => {
  router.push({ name: "broadcasts" });
};
const editCampaign = () => {
  router.push({ name: "broadcast-edit", params: { id: campaignId.value } });
};

onMounted(async () => {
  await loadCampaign();
  await loadMessages();
  await loadConversions();
});

watch(
  () => campaign.value?.name,
  () => {
    updateBreadcrumbs();
  },
);

watch(
  () => ordersStore.lastBroadcastEvent,
  async (event) => {
    const eventCampaignId = event?.data?.campaignId;
    if (!event || eventCampaignId !== campaignId.value) return;
    if (event.type === "broadcast:stats:update") {
      await loadCampaign();
      return;
    }
    await loadCampaign();
    await loadMessages();
    await loadConversions();
  },
);
</script>
