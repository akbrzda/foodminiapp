<template>
  <div class="bonus-history">
    <div class="content">
      <div v-if="!bonusesEnabled" class="bonus-disabled">Бонусная система временно отключена</div>
      <template v-else>
        <div class="loyalty-card">
          <div class="loyalty-card-header">
            <div class="loyalty-balance">
              <div class="loyalty-icon">Б</div>
              <div class="loyalty-amount">{{ formatPrice(bonusBalance) }}</div>
            </div>
            <div class="loyalty-status">
              <div class="loyalty-rate">Ваш статус {{ currentRateLabel }}%</div>
              <div class="loyalty-tier">
                {{ currentLevel.name }}
                <button class="info-button" type="button" @click="showRulesModal = true">!</button>
              </div>
            </div>
          </div>
        </div>
        <div class="progress-card">
          <div class="progress-values">
            <span>{{ formatPrice(totalSpent) }} ₽</span>
            <span>/</span>
            <span v-if="nextLevel">{{ formatPrice(nextLevel.min) }} ₽</span>
            <span v-else>∞</span>
          </div>
          <div class="progress-bar">
            <span class="progress-fill" :style="{ width: `${progressPercent}%` }"></span>
          </div>
          <div class="progress-caption" v-if="nextLevel">До обновления статуса — {{ formatPrice(amountToNextLevel) }} ₽</div>
          <div class="progress-caption" v-else>У вас максимальный статус</div>
        </div>
        <div class="history-section">
          <h3>История операций</h3>
          <div class="loading" v-if="loading">Загрузка...</div>
          <div class="empty" v-else-if="!transactions.length">
            <p>У вас пока нет операций с бонусами</p>
          </div>
          <div class="transactions" v-else>
            <div v-for="transaction in transactions" :key="transaction.id" class="transaction-item">
              <div class="transaction-icon" :class="isEarnType(transaction.type) ? 'earn' : 'spend'">
                <Plus v-if="isEarnType(transaction.type)" :size="20" />
                <Minus v-else :size="20" />
              </div>
              <div class="transaction-info">
                <div class="transaction-title">{{ getTransactionTitle(transaction) }}</div>
                <div class="transaction-date">{{ formatDate(transaction.created_at) }}</div>
                <div v-if="isActiveEarn(transaction)" class="transaction-expire">Действует до {{ formatDateShort(transaction.expires_at) }}</div>
              </div>
              <div class="transaction-amount" :class="isEarnType(transaction.type) ? 'earn' : 'spend'">
                {{ isEarnType(transaction.type) ? "+" : "−" }}{{ formatPrice(Math.abs(transaction.amount)) }} ₽
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <div v-if="bonusesEnabled && showRulesModal" class="modal-overlay" @click.self="showRulesModal = false">
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>Бонусная система</h3>
          <button class="modal-close" type="button" @click="showRulesModal = false" aria-label="Закрыть">
            <X :size="18" />
          </button>
        </div>
        <div class="modal-body">
          <p>
            Статус зависит от суммы всех завершённых заказов и пересчитывается автоматически. Уровень может только повышаться. Можно списывать до
            {{ maxRedeemPercentLabel }}% от суммы заказа (1 бонус = 1 ₽).
          </p>
          <p>Бонусы начисляются после завершения заказа и доступны в течение {{ bonusLifetimeDays }} дней.</p>
          <div class="levels-table-header">
            <span>Уровень</span>
            <span>Начисление</span>
            <span>Списание</span>
            <span>Диапазон сумм</span>
          </div>
          <div class="levels-list">
            <div v-for="level in formattedLevels" :key="level.id" class="level-row">
              <span class="level-name">{{ level.name }}</span>
              <span class="level-rate">{{ level.rateLabel }}%</span>
              <span class="level-redeem">{{ level.redeemLabel }}%</span>
              <span class="level-range">{{ level.rangeLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted } from "vue";
import { X, Plus, Minus } from "lucide-vue-next";
import { bonusesAPI } from "../api/endpoints";
import { formatPrice } from "../utils/format";
import { useLoyaltyStore } from "../stores/loyalty";
import { useSettingsStore } from "../stores/settings";
const bonusBalance = ref(0);
const transactions = ref([]);
const loading = ref(true);
const loyaltyStore = useLoyaltyStore();
const settingsStore = useSettingsStore();
const showRulesModal = ref(false);
const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const currentLevel = computed(() => loyaltyStore.currentLevel);
const nextLevel = computed(() => loyaltyStore.nextLevel);
const totalSpent = computed(() => loyaltyStore.totalSpent);
const currentRateLabel = computed(() => Math.round(currentLevel.value.rate * 100));
const maxRedeemPercentLabel = computed(() => Math.round(loyaltyStore.maxRedeemPercent * 100));
const progressPercent = computed(() => Math.round(loyaltyStore.progressToNextLevel * 100));
const amountToNextLevel = computed(() => loyaltyStore.amountToNextLevel);
const bonusLifetimeDays = 60;
const formattedLevels = computed(() =>
  loyaltyStore.levels.map((level) => ({
    ...level,
    rateLabel: Math.round(level.rate * 100),
    redeemLabel: Math.round((level.redeemPercent ?? loyaltyStore.fallbackRedeemPercent) * 100),
    rangeLabel: Number.isFinite(level.max) ? `${formatPrice(level.min)} ₽ – ${formatPrice(level.max)} ₽` : `от ${formatPrice(level.min)} ₽`,
  })),
);
onMounted(async () => {
  if (!bonusesEnabled.value) {
    loading.value = false;
    return;
  }
  await Promise.all([loadData(), loyaltyStore.refreshFromProfile()]);
});
async function loadData() {
  loading.value = true;
  try {
    const [balanceResponse, historyResponse] = await Promise.all([bonusesAPI.getBalance(), bonusesAPI.getHistory()]);
    bonusBalance.value = balanceResponse.data.balance || 0;
    transactions.value = historyResponse.data.transactions || [];
  } catch (error) {
    console.error("Failed to load bonus data:", error);
  } finally {
    loading.value = false;
  }
}
const isEarnType = (type) => type === "earn";
const isActiveEarn = (transaction) => {
  if (!isEarnType(transaction.type)) return false;
  if (!transaction.expires_at) return false;
  return new Date(transaction.expires_at) > new Date();
};
function getTransactionTitle(transaction) {
  if (transaction.type === "earn") {
    return `Начислено за заказ #${transaction.order_number || transaction.order_id}`;
  } else if (transaction.type === "spend") {
    return `Списано в заказе #${transaction.order_number || transaction.order_id}`;
  }
  return "Операция";
}
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return "Сегодня в " + date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Вчера в " + date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } else if (days < 7) {
    return `${days} дн. назад`;
  } else {
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }
}
function formatDateShort(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
</script>
<style scoped>
.bonus-history {
  min-height: 100vh;
  background: var(--color-background);
  padding-bottom: 24px;
}
.content {
  padding: 16px 12px;
}
.bonus-disabled {
  padding: 20px;
  border-radius: var(--border-radius-lg);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  text-align: center;
  font-weight: var(--font-weight-semibold);
}
.loyalty-card {
  padding: 20px;
  background: var(--color-primary);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}
.loyalty-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.loyalty-balance {
  display: flex;
  align-items: center;
  gap: 12px;
}
.loyalty-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.12);
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: var(--font-weight-bold);
}
.loyalty-amount {
  font-size: 36px;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}
.loyalty-status {
  text-align: right;
}
.loyalty-rate {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.loyalty-tier {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.info-button {
  width: 22px;
  height: 22px;
  margin-left: 8px;
  border-radius: 50%;
  border: 1px solid var(--color-text-secondary);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  cursor: pointer;
}
.progress-card {
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 20px;
}
.progress-values {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}
.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--color-background-secondary);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}
.progress-fill {
  display: block;
  height: 100%;
  background: var(--color-primary);
  border-radius: 999px;
  transition: width var(--transition-duration) var(--transition-easing);
}
.progress-caption {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.history-section {
  margin-bottom: 16px;
}
.history-section h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}
.levels-table-header {
  display: grid;
  grid-template-columns: 1.1fr 0.7fr 0.7fr 1.2fr;
  gap: 8px;
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
  margin-bottom: 12px;
}
.levels-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.level-row {
  display: grid;
  grid-template-columns: 1.1fr 0.7fr 0.7fr 1.2fr;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-md);
}
.level-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.level-rate {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.level-redeem {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}
.level-range {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}
.levels-link {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  padding: 0;
  font-size: var(--font-size-body);
  color: var(--color-primary-hover);
  text-decoration: underline;
  cursor: pointer;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  z-index: 200;
}
.modal-card {
  width: 100%;
  max-width: 360px;
  background: var(--color-background);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
  padding: 16px;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.modal-header h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}
.modal-close {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.modal-body {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.transactions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.transaction-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-duration) var(--transition-easing);
}
.transaction-item:hover {
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.12);
}
.transaction-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}
.transaction-icon.earn {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
}
.transaction-icon.spend {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}
.transaction-info {
  flex: 1;
}
.transaction-title {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}
.transaction-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.transaction-date {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.transaction-expire {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.transaction-order-info {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
}
.transaction-details {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.transaction-amount {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}
.transaction-amount.earn {
  color: #4caf50;
}
.transaction-amount.spend {
  color: #f44336;
}
.loading,
.empty {
  text-align: center;
  padding: 32px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.empty p {
  margin: 0;
}
</style>
