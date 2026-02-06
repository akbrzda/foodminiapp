import { devError } from "@/shared/utils/logger";
<template>
  <div class="space-y-6">
    <Card>
      <CardContent>
        <PageHeader title="Города" description="Управление городами доставки">
          <template #actions>
            <Badge variant="secondary">Всего: {{ cities.length }}</Badge>
            <Button @click="goToCreate">
              <Plus :size="16" />
              Добавить город
            </Button>
          </template>
        </PageHeader>
      </CardContent>
    </Card>
    <Card>
      <CardContent class="!p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Город</TableHead>
              <TableHead>Координаты</TableHead>
              <TableHead>Часовой пояс</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="city in cities" :key="city.id">
              <TableCell>
                <div class="font-medium text-foreground">{{ city.name }}</div>
                <div class="text-xs text-muted-foreground">ID: {{ city.id }}</div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin :size="14" />
                  {{ city.latitude && city.longitude ? `${city.latitude}, ${city.longitude}` : "—" }}
                </div>
              </TableCell>
              <TableCell>
                <div class="text-sm text-muted-foreground">
                  {{ city.timezone || "Europe/Moscow" }}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  :class="city.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ city.is_active ? "Активен" : "Неактивен" }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="goToEdit(city)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteCity(city)">
                    <Trash2 :size="16" class="text-red-600" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
<script setup>
import { onMounted, ref } from "vue";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";

const router = useRouter();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const cities = ref([]);

const loadCities = async () => {
  try {
    const response = await api.get("/api/cities/admin/all");
    cities.value = response.data.cities || [];
  } catch (error) {
    devError("Failed to load cities:", error);
    showErrorNotification("Ошибка при загрузке городов");
  }
};

const goToCreate = () => {
  router.push({ name: "city-new" });
};

const goToEdit = (city) => {
  router.push({ name: "city-edit", params: { id: city.id } });
};

const deleteCity = async (city) => {
  if (!confirm(`Удалить город \"${city.name}\"?`)) return;
  try {
    await api.delete(`/api/cities/admin/${city.id}`);
    showSuccessNotification("Город удален");
    await loadCities();
  } catch (error) {
    devError("Ошибка удаления города:", error);
    showErrorNotification(error.response?.data?.error || "Ошибка удаления города");
  }
};

onMounted(() => {
  loadCities();
});
</script>
