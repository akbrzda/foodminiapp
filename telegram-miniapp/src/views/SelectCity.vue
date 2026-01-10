<template>
  <div class="select-city">
    <div class="header">
      <h1>Выберите город</h1>
    </div>

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else class="cities-list">
      <button v-for="city in cities" :key="city.id" class="city-card" @click="selectCity(city)">
        <span class="city-name">{{ city.name }}</span>
        <span class="arrow">→</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { citiesAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const locationStore = useLocationStore();

const cities = ref([]);
const loading = ref(false);

onMounted(async () => {
  await loadCities();
});

async function loadCities() {
  try {
    loading.value = true;
    const response = await citiesAPI.getCities();
    cities.value = response.data.cities || [];
  } catch (error) {
    console.error("Failed to load cities:", error);
  } finally {
    loading.value = false;
  }
}

async function selectCity(city) {
  try {
    hapticFeedback("light");
    locationStore.setCity(city);

    // Загружаем филиалы города
    const response = await citiesAPI.getBranches(city.id);
    locationStore.setBranches(response.data.branches || []);

    // Если есть филиалы - переходим к выбору филиала
    if (response.data.branches?.length > 0) {
      router.push("/select-branch");
    } else {
      // Если филиалов нет - сразу на главную
      router.push("/");
    }
  } catch (error) {
    hapticFeedback("error");
    console.error("Failed to select city:", error);
  }
}
</script>

<style scoped>
.select-city {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  padding: 24px 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  text-align: center;
}

.header h1 {
  font-size: 24px;
}

.loading {
  text-align: center;
  padding: 64px 16px;
  color: #666;
}

.cities-list {
  padding: 16px;
}

.city-card {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border: none;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}

.city-card:hover {
  transform: translateY(-2px);
}

.city-name {
  font-size: 18px;
  font-weight: 600;
}

.arrow {
  font-size: 20px;
  color: #667eea;
}
</style>
