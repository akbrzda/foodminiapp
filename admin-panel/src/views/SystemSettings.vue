<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Системные настройки</CardTitle>
        <CardDescription>Включение и отключение ключевых модулей</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Изменения применяются сразу после сохранения. Отключенные модули скрываются в клиентском интерфейсе.
        </div>
      </CardContent>
    </Card>

    <Card v-if="groupedSettings.length">
      <CardHeader>
        <CardTitle>Модули</CardTitle>
        <CardDescription>Управление состоянием сервисных блоков</CardDescription>
      </CardHeader>
      <CardContent class="pt-0">
        <div class="space-y-6">
          <div v-for="group in groupedSettings" :key="group.name" class="space-y-4">
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {{ group.name }}
            </div>
            <div class="space-y-3">
              <div
                v-for="item in group.items"
                :key="item.key"
                class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-background px-4 py-3"
              >
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                  <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                </div>
                <div class="w-40">
                  <Select v-model="form[item.key]">
                    <option :value="true">Включено</option>
                    <option :value="false">Выключено</option>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card v-else>
      <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки не найдены</CardContent>
    </Card>

    <div class="flex flex-wrap justify-end gap-3">
      <Button variant="secondary" :disabled="loading || saving" @click="loadSettings">
        <RefreshCcw :size="16" />
        Сбросить
      </Button>
      <Button :disabled="loading || saving" @click="saveSettings">
        <Save :size="16" />
        {{ saving ? "Сохранение..." : "Сохранить" }}
      </Button>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from "vue";
import { RefreshCcw, Save } from "lucide-vue-next";
import api from "../api/client.js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Select from "../components/ui/Select.vue";
import { useNotifications } from "../composables/useNotifications.js";

const items = ref([]);
const form = ref({});
const loading = ref(false);
const saving = ref(false);
const { showErrorNotification, showSuccessNotification } = useNotifications();

const groupedSettings = computed(() => {
  const groups = new Map();
  for (const item of items.value) {
    const groupName = item.group || "Общее";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(item);
  }
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
});

const hydrateForm = () => {
  form.value = items.value.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
};

const loadSettings = async () => {
  loading.value = true;
  try {
    const response = await api.get("/api/settings/admin");
    items.value = response.data.items || [];
    hydrateForm();
  } catch (error) {
    console.error("Failed to load settings:", error);
    showErrorNotification("Ошибка при загрузке настроек");
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  saving.value = true;
  try {
    const response = await api.put("/api/settings/admin", { settings: form.value });
    items.value = response.data.items || [];
    hydrateForm();
    showSuccessNotification("Настройки сохранены");
  } catch (error) {
    console.error("Failed to save settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек";
    showErrorNotification(message);
  } finally {
    saving.value = false;
  }
};

onMounted(loadSettings);
</script>
