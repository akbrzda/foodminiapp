<template>
  <div class="select-branch">
    <div class="header">
      <button class="back-btn" @click="$router.back()">← Назад</button>
      <h1>Выберите филиал</h1>
    </div>

    <div class="city-name">
      {{ locationStore.selectedCity?.name }}
    </div>

    <div v-if="locationStore.branches.length === 0" class="empty">Филиалы не найдены</div>

    <div v-else class="branches-list">
      <button v-for="branch in locationStore.branches" :key="branch.id" class="branch-card" @click="selectBranch(branch)">
        <div class="branch-info">
          <div class="branch-name">{{ branch.name }}</div>
          <div class="branch-address">{{ branch.address }}</div>
          <div class="branch-hours">{{ branch.work_hours }}</div>
        </div>
        <span class="arrow">→</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const locationStore = useLocationStore();

function selectBranch(branch) {
  hapticFeedback("light");
  locationStore.setBranch(branch);
  router.push("/");
}
</script>

<style scoped>
.select-branch {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.back-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  margin-right: 12px;
}

.header h1 {
  font-size: 20px;
}

.city-name {
  padding: 16px;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: #666;
}

.empty {
  text-align: center;
  padding: 64px 16px;
  color: #666;
}

.branches-list {
  padding: 16px;
}

.branch-card {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: none;
  background: white;
  border-radius: 12px;
  margin-bottom: 12px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}

.branch-card:hover {
  transform: translateY(-2px);
}

.branch-info {
  flex: 1;
}

.branch-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.branch-address {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.branch-hours {
  font-size: 12px;
  color: #999;
}

.arrow {
  font-size: 20px;
  color: #667eea;
  margin-left: 16px;
}
</style>
