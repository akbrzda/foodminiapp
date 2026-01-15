<template>
  <div class="select-branch">
    <PageHeader title="Выберите филиал" />

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
import { ArrowRight } from "lucide-vue-next";
import PageHeader from "../components/PageHeader.vue";
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
  background: var(--color-background-secondary);
}

.city-name {
  padding: 16px;
  text-align: center;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.empty {
  text-align: center;
  padding: 64px 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
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
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  margin-bottom: 12px;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-duration) var(--transition-easing), transform var(--transition-duration) var(--transition-easing);
}

.branch-card:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.branch-info {
  flex: 1;
}

.branch-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.branch-address {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.branch-hours {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.arrow {
  color: var(--color-primary);
  margin-left: 16px;
  flex-shrink: 0;
}
</style>
