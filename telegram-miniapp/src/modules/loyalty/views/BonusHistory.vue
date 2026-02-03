<template>
  <div class="bonus-history">
    <div class="content">
      <div v-if="!bonusesEnabled" class="bonus-disabled">Бонусная система временно отключена</div>
      <template v-else>
        <div class="loyalty-card">
          <div class="loyalty-card-header">
            <div class="loyalty-balance">
              <div class="loyalty-icon">
                <Award :size="20" />
              </div>
              <div class="loyalty-amount">{{ formatPrice(bonusBalance) }}</div>
            </div>
            <div class="loyalty-status">
              <div class="loyalty-rate">Ваш статус {{ currentRateLabel }}%</div>
              <div class="loyalty-tier">
                <span>{{ currentLevel.name }}</span>
                <button class="level-info-button" type="button" @click="openLevelsPopup">!</button>
              </div>
            </div>
          </div>
          <div class="loyalty-benefits">
            <div class="benefit-item">
              <span class="benefit-label">Начисление:</span>
              <span class="benefit-value">{{ currentRateLabel }}%</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-label">Списание до:</span>
              <span class="benefit-value">{{ maxRedeemPercentLabel }}%</span>
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
          <div class="progress-caption" v-if="nextLevel">
            До обновления статуса — {{ formatPrice(amountToNextLevel) }} ₽ за последние {{ levelCalculationDays }} дней
          </div>
          <div class="progress-caption" v-else>У вас максимальный статус</div>

          <div v-if="nextLevel" class="next-level-card">
            <div class="next-level-icon dimmed">
              <Trophy :size="18" />
            </div>
            <div class="next-level-info">
              <div class="next-level-name">{{ nextLevel.name }}</div>
              <div class="next-level-benefits">
                <span>Начисление: {{ Math.round(nextLevel.rate * 100) }}%</span>
                <span>•</span>
                <span>Списание до: {{ Math.round((nextLevel.redeemPercent ?? loyaltyStore.fallbackRedeemPercent) * 100) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="levelsPopup.open" class="level-popup">
          <div class="level-popup__overlay" @click="closeLevelsPopup"></div>
          <div class="level-popup__content level-popup__content--list">
            <div class="level-popup__title">Уровни и условия</div>
            <div class="levels-list">
              <div v-for="level in formattedLevels" :key="level.id" class="levels-list__item">
                <div class="levels-list__header">
                  <span class="levels-list__name">{{ level.name }}</span>
                  <span v-if="level.id === currentLevel.id" class="levels-list__badge">Текущий</span>
                </div>
                <div class="levels-list__meta">
                  <span>Начисление: {{ level.rateLabel }}%</span>
                  <span>Списание до: {{ level.redeemLabel }}%</span>
                </div>
                <div class="levels-list__range">Порог: {{ level.rangeLabel }}</div>
              </div>
            </div>
            <button class="level-popup__button" @click="closeLevelsPopup">Понятно</button>
          </div>
        </div>

        <div v-if="expiringBonuses.length > 0" class="expiring-section">
          <div class="expiring-alert">
            <div class="expiring-icon">
              <AlertTriangle :size="16" />
            </div>
            <div class="expiring-text">
              <strong>{{ formatPrice(totalExpiring) }} бонусов</strong> сгорят в ближайшие {{ expiringDaysThreshold }} дней
            </div>
          </div>
          <div class="expiring-list">
            <div v-for="bonus in expiringBonuses" :key="bonus.id" class="expiring-item">
              <span class="expiring-amount">{{ formatPrice(bonus.amount) }} ₽</span>
              <span class="expiring-date">{{ formatDateShort(bonus.expires_at) }}</span>
              <span class="expiring-days" :class="{ urgent: bonus.days_left <= 3 }">{{ bonus.days_left }} дн.</span>
            </div>
          </div>
        </div>

        <div class="history-section">
          <h3>История операций</h3>
          <div class="loading" v-if="loading">Загрузка...</div>
          <div class="empty" v-else-if="!transactions.length">
            <p>У вас пока нет операций с бонусами</p>
          </div>
          <div class="transactions" v-else>
            <div v-for="transaction in transactions" :key="transaction.id" class="transaction-item">
              <div class="transaction-icon" :class="getTransactionClass(transaction.type)">
                <Plus v-if="isEarnType(transaction.type)" :size="20" />
                <Minus v-else-if="transaction.type === 'spend'" :size="20" />
                <X v-else :size="20" />
              </div>
              <div class="transaction-info">
                <div class="transaction-title">{{ getTransactionTitle(transaction) }}</div>
                <div class="transaction-date">{{ formatDate(transaction.created_at) }}</div>
                <div v-if="isActiveEarn(transaction)" class="transaction-expire">Действует до {{ formatDateShort(transaction.expires_at) }}</div>
                <div v-else-if="transaction.expires_at && new Date(transaction.expires_at) < new Date()" class="transaction-expired">Истек</div>
              </div>
              <div class="transaction-amount" :class="getTransactionClass(transaction.type)">
                {{ getTransactionSign(transaction.type) }}{{ formatPrice(Math.abs(transaction.amount)) }} ₽
              </div>
            </div>
            <button v-if="historyHasMore" class="history-more" type="button" :disabled="loadingMore" @click="loadMoreHistory">
              {{ loadingMore ? "Загрузка..." : "Загрузить еще" }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted } from "vue";
import { X, Plus, Minus, Award, Trophy, AlertTriangle, Info } from "lucide-vue-next";
import { bonusesAPI } from "@/shared/api/endpoints.js";
import { formatPrice } from "@/shared/utils/format";
import { useLoyaltyStore } from "@/modules/loyalty/stores/loyalty.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";

const bonusBalance = ref(0);
const transactions = ref([]);
const expiringBonuses = ref([]);
const totalExpiring = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const expiringDaysThreshold = 14;
const historyPage = ref(1);
const historyHasMore = ref(false);

const loyaltyStore = useLoyaltyStore();
const settingsStore = useSettingsStore();

const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const currentLevel = computed(() => loyaltyStore.currentLevel);
const nextLevel = computed(() => loyaltyStore.nextLevel);
const totalSpent = computed(() => loyaltyStore.totalSpent);
const currentRateLabel = computed(() => Math.round(currentLevel.value.rate * 100));
const maxRedeemPercentLabel = computed(() => Math.round(loyaltyStore.maxRedeemPercent * 100));
const progressPercent = computed(() => Math.round(loyaltyStore.progressToNextLevel * 100));
const amountToNextLevel = computed(() => loyaltyStore.amountToNextLevel);

const levelCalculationDays = computed(() => loyaltyStore.periodDays || 60);

const formattedLevels = computed(() =>
  loyaltyStore.levels.map((level) => ({
    ...level,
    rateLabel: Math.round(level.rate * 100),
    redeemLabel: Math.round((level.redeemPercent ?? loyaltyStore.fallbackRedeemPercent) * 100),
    rangeLabel: Number.isFinite(level.max) ? `${formatPrice(level.min)} ₽ – ${formatPrice(level.max)} ₽` : `от ${formatPrice(level.min)} ₽`,
  })),
);
const levelsPopup = ref({ open: false });
const openLevelsPopup = () => {
  levelsPopup.value = { open: true };
};
const closeLevelsPopup = () => {
  levelsPopup.value = { open: false };
};

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
    const [balanceResponse, historyResponse] = await Promise.all([
      bonusesAPI.getBalance(),
      bonusesAPI.getHistory({ page: historyPage.value, limit: 20 }),
    ]);
    bonusBalance.value = balanceResponse.data.balance || 0;
    expiringBonuses.value = balanceResponse.data.expiring_bonuses || [];
    totalExpiring.value = balanceResponse.data.total_expiring || 0;
    transactions.value = historyResponse.data.transactions || [];
    historyHasMore.value = Boolean(historyResponse.data.has_more);
  } catch (error) {
    console.error("Failed to load bonus data:", error);
  } finally {
    loading.value = false;
  }
}

async function loadMoreHistory() {
  if (loadingMore.value || !historyHasMore.value) return;
  loadingMore.value = true;
  try {
    const nextPage = historyPage.value + 1;
    const response = await bonusesAPI.getHistory({ page: nextPage, limit: 20 });
    const newItems = response.data.transactions || [];
    transactions.value = [...transactions.value, ...newItems];
    historyPage.value = nextPage;
    historyHasMore.value = Boolean(response.data.has_more);
  } catch (error) {
    console.error("Failed to load bonus history:", error);
  } finally {
    loadingMore.value = false;
  }
}

const isEarnType = (type) => ["earn", "registration", "birthday", "adjustment"].includes(type);

const isActiveEarn = (transaction) => {
  if (!isEarnType(transaction.type)) return false;
  if (!transaction.expires_at) return false;
  return new Date(transaction.expires_at) > new Date();
};

function getTransactionClass(type) {
  if (isEarnType(type)) return "earn";
  if (type === "spend") return "spend";
  return "other";
}

function getTransactionSign(type) {
  if (isEarnType(type)) return "+";
  if (type === "spend") return "−";
  return "";
}

function getTransactionTitle(transaction) {
  const typeLabels = {
    earn: "Начислено за заказ",
    spend: "Списано в заказе",
    registration: "Бонус за регистрацию",
    birthday: "Бонус на день рождения",
    adjustment: "Корректировка",
    expire: "Сгорело",
  };

  const label = typeLabels[transaction.type] || "Операция";
  const orderRef = transaction.order_number ? `#${transaction.order_number}` : transaction.order_id ? `#${transaction.order_id}` : "";

  if (["earn", "spend"].includes(transaction.type) && orderRef) {
    return `${label} ${orderRef}`;
  }

  return label;
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
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.level-info-button {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--color-text-primary);
  background: transparent;
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

/* Преимущества уровня */
.loyalty-benefits {
  display: flex;
  gap: 24px;
  padding-top: 16px;
}

.benefit-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.benefit-label {
  font-size: var(--font-size-caption);
  color: var(--color-text-primary);
}

.benefit-value {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
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
  margin-bottom: 16px;
}

/* Карточка следующего уровня */
.next-level-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-md);
  margin-top: 16px;
}

.next-level-icon {
  font-size: 32px;
  opacity: 1;
}

.next-level-icon.dimmed {
  opacity: 0.5;
}

.next-level-info {
  flex: 1;
}

.next-level-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.next-level-benefits {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Секция истекающих бонусов */
.expiring-section {
  margin-bottom: 20px;
}

.expiring-alert {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fff3cd;
  border-radius: var(--border-radius-md);
  margin-bottom: 12px;
}

.expiring-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.expiring-text {
  flex: 1;
  font-size: var(--font-size-body);
  color: #856404;
}

.expiring-text strong {
  font-weight: var(--font-weight-bold);
}

.expiring-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.expiring-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-sm);
}

.expiring-amount {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.expiring-date {
  flex: 1;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  text-align: center;
}

.expiring-days {
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
  color: #ff9800;
  padding: 4px 8px;
  background: rgba(255, 152, 0, 0.1);
  border-radius: var(--border-radius-sm);
}

.expiring-days.urgent {
  color: #f44336;
  background: rgba(244, 67, 54, 0.1);
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
.history-more {
  width: 100%;
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  cursor: pointer;
}
.history-more:disabled {
  opacity: 0.6;
  cursor: default;
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
  transition: background-color var(--transition-duration);
}

.level-row.current-level {
  background: rgba(var(--color-primary-rgb), 0.1);
  border: 1px solid var(--color-primary);
}

.level-name {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-badge {
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-normal);
  color: var(--color-primary);
  padding: 2px 8px;
  background: rgba(var(--color-primary-rgb), 0.1);
  border-radius: var(--border-radius-sm);
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

.transaction-icon.other {
  background: rgba(158, 158, 158, 0.1);
  color: #9e9e9e;
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
  color: #4caf50;
  font-weight: var(--font-weight-semibold);
}

.transaction-expired {
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
  font-style: italic;
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

.transaction-amount.other {
  color: var(--color-text-secondary);
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

.levels-section {
  margin-top: 20px;
  background: white;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 6px 16px rgba(17, 24, 39, 0.08);
}

.levels-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.levels-grid {
  display: grid;
  gap: 12px;
}
.level-popup {
  position: fixed;
  inset: 0;
  z-index: 50;
}
.level-popup__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.level-popup__content {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(90vw, 320px);
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  text-align: center;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
}
.level-popup__content--list {
  text-align: left;
}
.level-popup__title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}
.level-popup__text {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}
.level-popup__button {
  width: 100%;
  margin-top: 6px;
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  background: #ffd200;
  color: #111827;
  font-weight: 600;
}

.levels-list {
  display: grid;
  gap: 10px;
  margin: 12px 0 4px;
}

.levels-list__item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
  background: #f9fafb;
}

.levels-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.levels-list__name {
  font-weight: 600;
  color: #111827;
}

.levels-list__badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.15);
  color: #065f46;
}

.levels-list__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #374151;
}

.levels-list__range {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}

.level-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px 14px;
  background: #f9fafb;
}

.level-card.current {
  border-color: #16a34a;
  background: rgba(16, 185, 129, 0.08);
}

.level-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.level-name {
  font-weight: 600;
  color: #111827;
}

.level-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.15);
  color: #065f46;
}

.level-metrics {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #374151;
}

.level-threshold {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}
</style>
