<template>
  <div class="space-y-6">
    <Card>
      <CardHeader class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Позиции меню</CardTitle>
          <CardDescription>Управление товарами и их параметрами</CardDescription>
        </div>
        <Button @click="createItem">
          <Plus :size="16" />
          Добавить позицию
        </Button>
      </CardHeader>
      <CardContent class="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Позиция</TableHead>
              <TableHead>Категории</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead class="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in items" :key="item.id">
              <TableCell>
                <div class="flex items-center gap-3">
                  <img v-if="item.image_url" :src="normalizeImageUrl(item.image_url)" :alt="item.name" class="h-12 w-12 rounded-lg object-cover" />
                  <div>
                    <div class="font-medium text-foreground">{{ item.name }}</div>
                    <div class="text-xs text-muted-foreground">{{ item.description || "—" }}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge v-for="cat in item.categories" :key="cat.id" variant="secondary" class="text-xs">{{ cat.name }}</Badge>
                </div>
              </TableCell>
              <TableCell>{{ formatCurrency(item.base_price || 0) }}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  :class="item.is_active ? 'bg-emerald-100 text-emerald-700 border-transparent' : 'bg-muted text-muted-foreground border-transparent'"
                >
                  {{ item.is_active ? "Активна" : "Скрыта" }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" @click="editItem(item)">
                    <Pencil :size="16" />
                  </Button>
                  <Button variant="ghost" size="icon" @click="deleteItem(item)">
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
import { useRouter } from "vue-router";
import { Pencil, Plus, Trash2 } from "lucide-vue-next";
import api from "../api/client.js";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import CardContent from "../components/ui/CardContent.vue";
import CardDescription from "../components/ui/CardDescription.vue";
import CardHeader from "../components/ui/CardHeader.vue";
import CardTitle from "../components/ui/CardTitle.vue";
import Table from "../components/ui/Table.vue";
import TableBody from "../components/ui/TableBody.vue";
import TableCell from "../components/ui/TableCell.vue";
import TableHead from "../components/ui/TableHead.vue";
import TableHeader from "../components/ui/TableHeader.vue";
import TableRow from "../components/ui/TableRow.vue";
import { useNotifications } from "../composables/useNotifications.js";
import { formatCurrency } from "../utils/format.js";
const router = useRouter();
const items = ref([]);
const { showErrorNotification } = useNotifications();
const normalizeImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env.VITE_UPLOADS_URL || import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
};
const loadItems = async () => {
  try {
    const response = await api.get("/api/menu/admin/items");
    items.value = response.data.items || [];
  } catch (error) {
    console.error("Failed to load items:", error);
    showErrorNotification(`Ошибка при загрузке позиций: ${error.response?.data?.error || error.message}`);
  }
};
const createItem = () => {
  router.push({ name: "menu-item-form", params: { id: "new" } });
};
const editItem = (item) => {
  router.push({ name: "menu-item-form", params: { id: item.id } });
};
const deleteItem = async (item) => {
  if (!confirm(`Удалить позицию "${item.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/items/${item.id}`);
    await loadItems();
  } catch (error) {
    console.error("Failed to delete item:", error);
    showErrorNotification(`Ошибка: ${error.response?.data?.error || error.message}`);
  }
};
onMounted(loadItems);
</script>
