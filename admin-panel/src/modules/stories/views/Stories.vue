<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Stories" description="Список stories-кампаний и управление">
          <template #actions>
            <Badge variant="secondary">Показано: {{ paginatedStories.length }} / {{ filteredStories.length }}</Badge>
            <Button v-if="canManageStories" @click="createStory">
              <Plus :size="16" />
              Создать stories
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <BaseFilters v-model="filtersModel" :fields="filterFields" />

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardContent class="space-y-1 pt-4">
          <div class="text-xs text-muted-foreground">Кампаний</div>
          <div class="text-2xl font-semibold">{{ summary.total_campaigns }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-1 pt-4">
          <div class="text-xs text-muted-foreground">Активных</div>
          <div class="text-2xl font-semibold">{{ summary.active_campaigns }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-1 pt-4">
          <div class="text-xs text-muted-foreground">Показы</div>
          <div class="text-2xl font-semibold">{{ summary.impressions }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-1 pt-4">
          <div class="text-xs text-muted-foreground">Уникальные</div>
          <div class="text-2xl font-semibold">{{ summary.unique_impressions }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="space-y-1 pt-4">
          <div class="text-xs text-muted-foreground">CTR</div>
          <div class="text-2xl font-semibold">{{ summary.ctr }}%</div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="space-y-3 p-3 md:hidden">
          <template v-if="isLoading">
            <div v-for="index in 6" :key="`mobile-loading-${index}`" class="rounded-xl border border-border p-3 space-y-3">
              <Skeleton class="h-4 w-44" />
              <Skeleton class="h-3 w-36" />
              <Skeleton class="h-3 w-24" />
            </div>
          </template>
          <template v-else>
            <div v-for="story in paginatedStories" :key="`mobile-${story.id}`" class="rounded-xl border border-border bg-background p-3">
              <div class="font-medium text-foreground">{{ story.name }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ story.title }}</div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{{ story.placement }}</Badge>
                <Badge :class="statusClass(story.status)" variant="secondary">{{ statusLabel(story.status) }}</Badge>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">
                Слайдов: {{ story.slides_count || 0 }} · Показы: {{ story.impressions_count || 0 }} · CTR: {{ getCtr(story) }}
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  :title="isActiveStatus(story.status) ? 'Отключить' : 'Включить'"
                  @click="toggleStory(story)"
                >
                  <component :is="isActiveStatus(story.status) ? PowerOff : Power" :size="16" />
                </Button>
                <Button variant="ghost" size="icon" @click="editStory(story)">
                  <Pencil :size="16" />
                </Button>
              </div>
            </div>
            <div v-if="filteredStories.length === 0" class="py-8 text-center text-sm text-muted-foreground">Stories-кампании не найдены</div>
          </template>
        </div>

        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Слайды</TableHead>
                <TableHead>Показы</TableHead>
                <TableHead>Клики</TableHead>
                <TableHead>CTR</TableHead>
                <TableHead>Обновлена</TableHead>
                <TableHead class="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isLoading">
                <TableRow v-for="index in 6" :key="`loading-${index}`">
                  <TableCell><Skeleton class="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton class="h-4 w-28" /></TableCell>
                  <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-10" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="story in paginatedStories" :key="story.id">
                  <TableCell>
                    <div class="font-medium text-foreground">{{ story.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ story.title }}</div>
                  </TableCell>
                  <TableCell>{{ story.placement }}</TableCell>
                  <TableCell>
                    <Badge :class="statusClass(story.status)" variant="secondary">{{ statusLabel(story.status) }}</Badge>
                  </TableCell>
                  <TableCell>{{ story.slides_count || 0 }}</TableCell>
                  <TableCell>{{ story.impressions_count || 0 }}</TableCell>
                  <TableCell>{{ story.clicks_count || 0 }}</TableCell>
                  <TableCell>{{ getCtr(story) }}</TableCell>
                  <TableCell>{{ formatDateTime(story.updated_at) || "—" }}</TableCell>
                  <TableCell class="text-right">
                    <div class="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        :title="isActiveStatus(story.status) ? 'Отключить' : 'Включить'"
                        @click="toggleStory(story)"
                      >
                        <component :is="isActiveStatus(story.status) ? PowerOff : Power" :size="16" />
                      </Button>
                      <Button variant="ghost" size="icon" @click="editStory(story)">
                        <Pencil :size="16" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="filteredStories.length === 0">
                  <TableCell colspan="9" class="py-8 text-center text-sm text-muted-foreground">Stories-кампании не найдены</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <TablePagination
      :total="filteredStories.length"
      :page="page"
      :page-size="pageSize"
      @update:page="page = $event"
      @update:page-size="onPageSizeChange"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Plus, Pencil, Power, PowerOff } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth.js";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useListContext } from "@/shared/composables/useListContext.js";
import { devError } from "@/shared/utils/logger";
import { formatDateTime } from "@/shared/utils/format.js";
import { storiesAPI } from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import BaseFilters from "@/shared/components/filters/BaseFilters.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import TablePagination from "@/shared/components/TablePagination.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";

const router = useRouter();
const authStore = useAuthStore();
const { showErrorNotification } = useNotifications();
const canManageStories = computed(() => authStore.hasPermission("marketing.stories.manage"));
const { shouldRestore, saveContext, restoreContext, restoreScroll } = useListContext("stories");

const stories = ref([]);
const summary = ref({
  total_campaigns: 0,
  active_campaigns: 0,
  impressions: 0,
  unique_impressions: 0,
  clicks: 0,
  ctr: 0,
  completions: 0,
});
const isLoading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const filters = ref({
  search: "",
  status: "",
  placement: "",
});

const filtersModel = computed({
  get: () => ({ ...filters.value }),
  set: (value) => {
    filters.value = { ...filters.value, ...(value || {}) };
  },
});

const filterFields = computed(() => [
  {
    key: "search",
    label: "Поиск",
    placeholder: "Поиск по названию",
    type: "text",
    defaultValue: "",
  },
  {
    key: "status",
    label: "Статус",
    placeholder: "Все статусы",
    type: "select",
    defaultValue: "",
    options: [
      { value: "", label: "Все" },
      { value: "draft", label: "Черновик" },
      { value: "active", label: "Активна" },
      { value: "paused", label: "Пауза" },
      { value: "archived", label: "Архив" },
    ],
  },
  {
    key: "placement",
    label: "Placement",
    placeholder: "Все",
    type: "select",
    defaultValue: "",
    options: [
      { value: "", label: "Все" },
      { value: "home", label: "home" },
    ],
  },
]);

const loadStories = async ({ preservePage = false } = {}) => {
  isLoading.value = true;
  try {
    const [listResponse, dashboardResponse] = await Promise.all([
      storiesAPI.list({
        search: filters.value.search,
        status: filters.value.status,
        placement: filters.value.placement,
        page: 1,
        limit: 200,
      }),
      storiesAPI.dashboard(),
    ]);
    stories.value = listResponse.data?.data || [];
    summary.value = {
      ...summary.value,
      ...(dashboardResponse.data?.data || {}),
    };
    if (!preservePage) page.value = 1;
  } catch (error) {
    devError("Ошибка загрузки stories-кампаний:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось загрузить stories-кампании");
  } finally {
    isLoading.value = false;
  }
};

const filteredStories = computed(() => stories.value);

const paginatedStories = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredStories.value.slice(start, start + pageSize.value);
});

const onPageSizeChange = (value) => {
  pageSize.value = value;
  page.value = 1;
};

const isActiveStatus = (status) => String(status || "").trim().toLowerCase() === "active";

const statusLabel = (status) => {
  const labels = {
    draft: "Черновик",
    active: "Активна",
    paused: "Пауза",
    archived: "Архив",
  };
  return labels[status] || status || "—";
};

const statusClass = (status) => {
  if (status === "active") return "bg-emerald-100 text-emerald-700 border-transparent";
  if (status === "paused") return "bg-amber-100 text-amber-700 border-transparent";
  if (status === "archived") return "bg-muted text-muted-foreground border-transparent";
  return "bg-muted text-muted-foreground border-transparent";
};

const getCtr = (story) => {
  const impressions = Number(story.impressions_count || 0);
  const clicks = Number(story.clicks_count || 0);
  if (!impressions) return "0%";
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
};

const createStory = () => {
  if (!canManageStories.value) return;
  saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "stories-new" });
};

const editStory = (story) => {
  if (!canManageStories.value) return;
  saveContext(filters.value, { page: page.value, pageSize: pageSize.value });
  router.push({ name: "stories-edit", params: { id: story.id } });
};

const toggleStory = async (story) => {
  if (!canManageStories.value) return;
  try {
    const response = await storiesAPI.toggle(story.id, !isActiveStatus(story.status));
    const updated = response?.data?.data;
    if (updated?.id) {
      stories.value = stories.value.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
      return;
    }
    await loadStories({ preservePage: true });
  } catch (error) {
    devError("Ошибка переключения stories-кампании:", error);
    showErrorNotification(error?.response?.data?.error || "Не удалось изменить статус кампании");
  }
};

watch(
  () => ({ ...filters.value }),
  () => {
    loadStories();
  },
  { deep: true }
);

onMounted(async () => {
  if (shouldRestore.value) {
    const context = restoreContext();
    if (context) {
      filters.value = { ...filters.value, ...(context.filters || {}) };
      page.value = context.page || 1;
      pageSize.value = context.pageSize || 20;
      await loadStories({ preservePage: true });
      restoreScroll(context.scroll || 0);
      return;
    }
  }
  await loadStories();
});
</script>
