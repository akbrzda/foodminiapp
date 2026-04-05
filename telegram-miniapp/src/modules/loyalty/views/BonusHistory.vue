<template>
  <div class="bonus-history">
    <div class="content page-container">
      <div v-if="!bonusesEnabled" class="bonus-disabled">Бонусная система временно отключена</div>
      <template v-else>
        <template v-if="loading">
          <div class="loyalty-card loyalty-card--skeleton">
            <div class="loyalty-card-header">
              <div class="loyalty-balance">
                <div class="skeleton skeleton-circle"></div>
                <div class="skeleton skeleton-line skeleton-w-40 skeleton-h-36"></div>
              </div>
              <div class="loyalty-status">
                <div class="skeleton skeleton-line skeleton-w-56"></div>
                <div class="skeleton skeleton-line skeleton-w-44"></div>
              </div>
            </div>
            <div class="loyalty-benefits">
              <div class="benefit-item">
                <span class="skeleton skeleton-line skeleton-w-48"></span>
                <span class="skeleton skeleton-line skeleton-w-36 skeleton-h-24"></span>
              </div>
              <div class="benefit-item">
                <span class="skeleton skeleton-line skeleton-w-48"></span>
                <span class="skeleton skeleton-line skeleton-w-36 skeleton-h-24"></span>
              </div>
            </div>
          </div>
          <div class="progress-card">
            <div class="skeleton skeleton-line skeleton-w-52 skeleton-h-22"></div>
            <div
              class="skeleton skeleton-line skeleton-w-100 skeleton-h-8 skeleton-rounded-full"
            ></div>
            <div class="skeleton skeleton-line skeleton-w-80"></div>
          </div>
          <div v-if="showTransactionHistory" class="history-section">
            <h3>История операций</h3>
            <div class="transactions">
              <div v-for="index in 4" :key="`history-skeleton-${index}`" class="transaction-item">
                <div class="skeleton skeleton-circle"></div>
                <div class="transaction-info">
                  <div class="skeleton skeleton-line skeleton-w-72"></div>
                  <div class="skeleton skeleton-line skeleton-w-44"></div>
                </div>
                <div class="skeleton skeleton-line skeleton-w-28"></div>
              </div>
            </div>
          </div>
        </template>
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
                  <button
                    class="level-info-button"
                    type="button"
                    aria-label="Показать уровни бонусной программы"
                    @click="openLevelsPopup"
                  >
                    !
                  </button>
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
            <button
              v-if="hasInfoSections"
              class="info-card-button"
              type="button"
              @click="openInfoPopup"
            >
              Как все работает
            </button>
          </div>

          <div class="progress-card">
            <div class="progress-values">
              <span>{{ formatPriceWithCurrency(totalSpent, settingsStore.currencyCode) }}</span>
              <span>/</span>
              <span v-if="nextLevel">{{
                formatPriceWithCurrency(nextLevel.min, settingsStore.currencyCode)
              }}</span>
              <span v-else>∞</span>
            </div>
            <div class="progress-bar">
              <span class="progress-fill" :style="{ width: `${progressPercent}%` }"></span>
            </div>
            <div v-if="nextLevel" class="progress-caption">
              До обновления статуса —
              {{ formatPriceWithCurrency(amountToNextLevel, settingsStore.currencyCode) }} за всё
              время
            </div>
            <div class="progress-caption" v-else>У вас максимальный статус</div>
          </div>

          <div v-if="levelsPopup.open" class="level-popup">
            <div class="level-popup__overlay" @click="closeLevelsPopup"></div>
            <div class="level-popup__content level-popup__content--list">
              <div class="level-popup__title">Уровни и условия</div>
              <div class="levels-list">
                <div v-for="level in formattedLevels" :key="level.id" class="levels-list__item">
                  <div class="levels-list__header">
                    <span class="levels-list__name">{{ level.name }}</span>
                    <span v-if="level.id === currentLevel.id" class="levels-list__badge"
                      >Текущий</span
                    >
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

          <div v-if="showTransactionHistory" class="history-section">
            <h3>История операций</h3>
            <div class="empty" v-if="!transactions.length">
              <p>У вас пока нет операций с бонусами</p>
            </div>
            <div class="transactions" v-else>
              <div
                v-for="transaction in transactions"
                :key="transaction.id"
                class="transaction-item"
                :class="{ 'transaction-item--pending': isPendingEarn(transaction) }"
              >
                <div class="transaction-icon" :class="getTransactionClass(transaction.type)">
                  <Plus v-if="isEarnType(transaction.type)" :size="20" />
                  <Minus v-else-if="transaction.type === 'spend'" :size="20" />
                  <X v-else :size="20" />
                </div>
                <div class="transaction-info">
                  <div
                    class="transaction-title"
                    :class="{ 'transaction-text--muted': isPendingEarn(transaction) }"
                  >
                    {{ getTransactionTitle(transaction) }}
                  </div>
                  <div
                    class="transaction-date"
                    :class="{ 'transaction-text--muted': isPendingEarn(transaction) }"
                  >
                    {{ formatCalendarDateTime(transaction.created_at) }}
                  </div>
                  <div
                    v-if="getPromoAmount(transaction) > 0"
                    class="transaction-breakdown"
                    :class="[
                      `transaction-breakdown--${getPromoClass(transaction.type)}`,
                      { 'transaction-text--muted': isPendingEarn(transaction) },
                    ]"
                  >
                    Акционные: {{ getPromoSign(transaction.type)
                    }}{{
                      formatPriceWithCurrency(
                        getPromoAmount(transaction),
                        settingsStore.currencyCode
                      )
                    }}
                  </div>
                  <div v-if="isPendingEarn(transaction)" class="transaction-pending">
                    Активация через {{ getActivationCountdown(transaction) }}
                  </div>
                  <div v-else-if="isActiveEarn(transaction)" class="transaction-expire">
                    Действует до {{ formatDateShort(transaction.expires_at) }}
                  </div>
                  <div
                    v-else-if="
                      transaction.expires_at && new Date(transaction.expires_at) < new Date()
                    "
                    class="transaction-expired"
                  >
                    Истек
                  </div>
                </div>
                <div
                  class="transaction-amount"
                  :class="[
                    getTransactionClass(transaction.type),
                    { muted: isPendingEarn(transaction) },
                  ]"
                >
                  {{ getTransactionSign(transaction.type)
                  }}{{
                    formatPriceWithCurrency(
                      Math.abs(transaction.amount),
                      settingsStore.currencyCode
                    )
                  }}
                </div>
              </div>
              <button
                v-if="historyHasMore"
                class="history-more"
                type="button"
                :disabled="loadingMore"
                @click="loadMoreHistory"
              >
                {{ loadingMore ? "Загрузка..." : "Загрузить еще" }}
              </button>
            </div>
          </div>

          <div v-if="infoPopupOpen && hasInfoSections" class="info-sheet">
            <div class="info-sheet__overlay" @click="closeInfoPopup"></div>
            <div
              ref="infoSheetContentRef"
              class="info-sheet__content"
              @touchstart.passive="handleInfoSheetTouchStart"
              @touchmove="handleInfoSheetTouchMove"
              @touchend="handleInfoSheetTouchEnd"
            >
              <div class="info-sheet__handle"></div>
              <div class="info-sheet__header">
                <h2 class="info-sheet__title">Как все работает</h2>
              </div>
              <div ref="infoSheetBodyRef" class="info-sheet__body">
                <section
                  v-for="(section, index) in infoSections"
                  :key="`${section.title}-${index}`"
                  class="info-sheet__section"
                >
                  <h3 class="info-sheet__section-title">{{ section.title }}</h3>
                  <p class="info-sheet__section-description">{{ section.description }}</p>
                </section>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import { X, Plus, Minus, Award } from "lucide-vue-next";
import { bonusesAPI } from "@/shared/api/endpoints.js";
import { formatPrice, formatPriceWithCurrency } from "@/shared/utils/format";
import { formatCalendarDateTime, formatDate as formatDateByTz } from "@/shared/utils/date";
import { useLoyaltyStore } from "@/modules/loyalty/stores/loyalty.js";
import { useSettingsStore } from "@/modules/settings/stores/settings.js";
import { devError } from "@/shared/utils/logger.js";

const bonusBalance = ref(0);
const transactions = ref([]);
const inactiveBonusAmount = ref(0);
const inactiveBonusActivationText = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const historyPage = ref(1);
const historyHasMore = ref(false);
const nowTs = ref(Date.now());
const timerId = ref(null);

const loyaltyStore = useLoyaltyStore();
const settingsStore = useSettingsStore();

const bonusesEnabled = computed(() => settingsStore.bonusesEnabled);
const showTransactionHistory = computed(() => loyaltyStore.historyAvailableForClient);
const currentLevel = computed(() => loyaltyStore.currentLevel);
const nextLevel = computed(() => loyaltyStore.nextLevel);
const totalSpent = computed(() => loyaltyStore.totalSpent);
const infoSections = computed(() => loyaltyStore.infoSections);
const hasInfoSections = computed(() => infoSections.value.length > 0);
const currentRateLabel = computed(() => Math.round(currentLevel.value.rate * 100));
const maxRedeemPercentLabel = computed(() => Math.round(loyaltyStore.maxRedeemPercent * 100));
const progressPercent = computed(() => Math.round(loyaltyStore.progressToNextLevel * 100));
const amountToNextLevel = computed(() => loyaltyStore.amountToNextLevel);

const formattedLevels = computed(() =>
  loyaltyStore.levels.map((level) => ({
    ...level,
    rateLabel: Math.round(level.rate * 100),
    redeemLabel: Math.round((level.redeemPercent ?? loyaltyStore.fallbackRedeemPercent) * 100),
    rangeLabel: Number.isFinite(level.max)
      ? `${formatPriceWithCurrency(level.min, settingsStore.currencyCode)} – ${formatPriceWithCurrency(level.max, settingsStore.currencyCode)}`
      : `от ${formatPriceWithCurrency(level.min, settingsStore.currencyCode)}`,
  }))
);
const levelsPopup = ref({ open: false });
const infoPopupOpen = ref(false);
const infoSheetContentRef = ref(null);
const infoSheetBodyRef = ref(null);
const infoSheetTouchStartY = ref(0);
const infoSheetTouchOffset = ref(0);
const infoSheetTouchActive = ref(false);
const lockedScrollTop = ref(0);
const openLevelsPopup = () => {
  levelsPopup.value = { open: true };
};
const closeLevelsPopup = () => {
  levelsPopup.value = { open: false };
};
const openInfoPopup = () => {
  infoPopupOpen.value = true;
};
const closeInfoPopup = () => {
  infoPopupOpen.value = false;
};
const lockPageScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const body = document.body;
  lockedScrollTop.value = window.scrollY || window.pageYOffset || 0;
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollTop.value}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
};
const unlockPageScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const body = document.body;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "";
  window.scrollTo(0, lockedScrollTop.value || 0);
};
const resetInfoSheetPosition = () => {
  const content = infoSheetContentRef.value;
  if (!content) return;
  content.style.transition = "transform 180ms ease";
  content.style.transform = "translateY(0px)";
};
const handleInfoSheetTouchStart = (event) => {
  const content = infoSheetContentRef.value;
  if (!content) return;
  infoSheetTouchActive.value = true;
  infoSheetTouchStartY.value = Number(event.touches?.[0]?.clientY || 0);
  infoSheetTouchOffset.value = 0;
  content.style.transition = "none";
};
const handleInfoSheetTouchMove = (event) => {
  if (!infoSheetTouchActive.value) return;
  const content = infoSheetContentRef.value;
  if (!content) return;
  const currentY = Number(event.touches?.[0]?.clientY || 0);
  const delta = Math.max(0, currentY - infoSheetTouchStartY.value);
  const bodyScrollTop = Number(infoSheetBodyRef.value?.scrollTop || 0);
  const isAtTop = bodyScrollTop <= 0;
  if (!isAtTop || delta <= 0) return;

  infoSheetTouchOffset.value = Math.min(delta, 280);
  content.style.transform = `translateY(${infoSheetTouchOffset.value}px)`;
  if (event.cancelable) {
    event.preventDefault();
  }
};
const handleInfoSheetTouchEnd = () => {
  if (!infoSheetTouchActive.value) return;
  infoSheetTouchActive.value = false;
  if (infoSheetTouchOffset.value > 120) {
    closeInfoPopup();
  } else {
    resetInfoSheetPosition();
  }
};

watch(
  () => infoPopupOpen.value,
  (open) => {
    if (open) {
      lockPageScroll();
      return;
    }
    unlockPageScroll();
    resetInfoSheetPosition();
  }
);

onMounted(async () => {
  if (!bonusesEnabled.value) {
    loading.value = false;
    return;
  }
  timerId.value = setInterval(() => {
    nowTs.value = Date.now();
  }, 1000);
  await Promise.all([loadData(), loyaltyStore.refreshFromProfile()]);
});

onBeforeUnmount(() => {
  unlockPageScroll();
  if (timerId.value) {
    clearInterval(timerId.value);
    timerId.value = null;
  }
});

async function loadData() {
  loading.value = true;
  try {
    const balanceResponse = await bonusesAPI.getBalance();
    loyaltyStore.setClientCapabilities(balanceResponse.data || {});
    bonusBalance.value = balanceResponse.data.balance || 0;
    inactiveBonusAmount.value = Math.max(0, Number(balanceResponse.data?.bonus_inactive || 0));
    inactiveBonusActivationText.value = String(
      balanceResponse.data?.bonus_next_activation_text || ""
    ).trim();
    if (!showTransactionHistory.value) {
      transactions.value = [];
      historyHasMore.value = false;
      historyPage.value = 1;
      return;
    }
    const historyResponse = await bonusesAPI.getHistory({ page: historyPage.value, limit: 20 });
    transactions.value = markPendingEarnTransactions(
      sortTransactions(historyResponse.data.transactions || []),
      inactiveBonusAmount.value
    );
    historyHasMore.value = Boolean(historyResponse.data.has_more);
  } catch (error) {
    devError("Не удалось загрузить данные бонусов:", error);
  } finally {
    loading.value = false;
  }
}

async function loadMoreHistory() {
  if (!showTransactionHistory.value) return;
  if (loadingMore.value || !historyHasMore.value) return;
  loadingMore.value = true;
  try {
    const nextPage = historyPage.value + 1;
    const response = await bonusesAPI.getHistory({ page: nextPage, limit: 20 });
    const newItems = response.data.transactions || [];
    transactions.value = markPendingEarnTransactions(
      sortTransactions([...transactions.value, ...newItems]),
      inactiveBonusAmount.value
    );
    historyPage.value = nextPage;
    historyHasMore.value = Boolean(response.data.has_more);
  } catch (error) {
    devError("Не удалось загрузить историю бонусов:", error);
  } finally {
    loadingMore.value = false;
  }
}

const isEarnType = (type) => ["earn", "registration", "birthday", "adjustment"].includes(type);

const isExplicitPendingTransaction = (transaction) => {
  if (!isEarnType(transaction?.type)) return false;
  if (String(transaction?.status || "").toLowerCase() === "pending") return true;
  if (!transaction?.activate_at) return false;
  const activateAt = new Date(transaction.activate_at).getTime();
  if (Number.isNaN(activateAt)) return false;
  return activateAt > nowTs.value;
};

const isActiveEarn = (transaction) => {
  if (!isEarnType(transaction.type)) return false;
  if (isPendingEarn(transaction)) return false;
  if (!transaction.expires_at) return false;
  return new Date(transaction.expires_at) > new Date();
};

const isPendingEarn = (transaction) => {
  if (!isEarnType(transaction?.type)) return false;
  if (transaction?._pending === true) return true;
  if (String(transaction?.status || "").toLowerCase() === "pending") return true;
  if (!transaction?.activate_at) return false;
  const activateAt = new Date(transaction.activate_at).getTime();
  if (Number.isNaN(activateAt)) return false;
  return activateAt > nowTs.value;
};

const getActivationCountdown = (transaction) => {
  const activateAt = new Date(transaction?.activate_at || "").getTime();
  if (!Number.isFinite(activateAt) || Number.isNaN(activateAt)) {
    const fallbackText = String(inactiveBonusActivationText.value || "").trim();
    if (!fallbackText) return "по правилам программы";
    const marker = "через";
    const markerIndex = fallbackText.toLowerCase().indexOf(marker);
    if (markerIndex >= 0) {
      return fallbackText.slice(markerIndex + marker.length).trim() || fallbackText;
    }
    return fallbackText;
  }
  const diffMs = Math.max(0, activateAt - nowTs.value);
  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function getPromoAmount(transaction) {
  const amount = Number(transaction?.promo_amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function getPromoSign(type) {
  if (isEarnType(type)) return "+";
  if (type === "spend" || type === "expire") return "−";
  return "";
}

function getPromoClass(type) {
  if (isEarnType(type)) return "earn";
  if (type === "spend" || type === "expire") return "spend";
  return "other";
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
  const orderRef = transaction.order_number
    ? `#${transaction.order_number}`
    : transaction.order_id
      ? `#${transaction.order_id}`
      : "";

  if (transaction.type === "earn" && !orderRef) {
    return "Начисление бонусов";
  }

  if (["earn", "spend"].includes(transaction.type) && orderRef) {
    return `${label} ${orderRef}`;
  }

  return label;
}

function formatDateShort(dateString) {
  if (!dateString) return "";
  return formatDateByTz(new Date(dateString), { day: "numeric", month: "short" });
}

function sortTransactions(list = []) {
  return [...list].sort((a, b) => {
    const diff = new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    if (diff !== 0) return diff;
    const sameOrder =
      String(a?.order_id || "") && String(a?.order_id || "") === String(b?.order_id || "");
    if (sameOrder && a?.type !== b?.type) {
      if (a?.type === "earn") return -1;
      if (b?.type === "earn") return 1;
    }
    const idDiff = Number(b?.id || 0) - Number(a?.id || 0);
    if (idDiff !== 0) return idDiff;
    if (a?.type === b?.type) return 0;
    if (a?.type === "earn") return -1;
    if (b?.type === "earn") return 1;
    return 0;
  });
}

function markPendingEarnTransactions(list = [], inactiveAmount = 0) {
  const base = Array.isArray(list) ? [...list] : [];
  if (!base.length) return [];

  // Для PremiumBonus fallback по inactive может неверно "подсвечивать" старые начисления,
  // если API истории не возвращает отдельные pending-операции.
  const hasPremiumBonusMarkers = base.some((tx) =>
    Object.prototype.hasOwnProperty.call(tx || {}, "raw_status")
  );
  if (hasPremiumBonusMarkers) {
    return base;
  }

  if (base.some((tx) => isExplicitPendingTransaction(tx))) {
    return base;
  }

  let remainingInactive = Math.max(0, Number(inactiveAmount) || 0);
  if (remainingInactive <= 0) return base;

  return base.map((tx) => {
    if (!isEarnType(tx?.type) || remainingInactive <= 0) return tx;
    const amount = Math.max(0, Math.abs(Number(tx?.amount) || 0));
    if (amount <= 0) return tx;

    remainingInactive = Math.max(0, remainingInactive - amount);
    return {
      ...tx,
      _pending: true,
    };
  });
}
</script>

<style scoped>
.bonus-history {
  min-height: 100vh;
  background: var(--color-background);
  padding-bottom: 24px;
}
.loyalty-card.loyalty-card--skeleton {
  border: 1px solid var(--color-border);
  background: var(--color-background);
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
  padding: 12px;
  background: var(--color-primary);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--color-primary);
  margin-bottom: 8px;
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
.info-card-button {
  margin-top: 12px;
  width: 100%;
  padding: 11px 14px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.12) 100%);
  color: #111827;
  font-size: var(--font-size-body);
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background 0.12s ease;
}
.info-card-button:active {
  transform: translateY(1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.08);
}
.info-card-button:hover {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.16) 100%);
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
  padding: 12px;
  border: 1px solid var(--color-border);
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
.expiring-section h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.inactive-bonus-card {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}

.inactive-bonus-card__title {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}

.inactive-bonus-card__value {
  margin-top: 4px;
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.inactive-bonus-card__hint {
  margin-top: 6px;
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
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
  border: 1px solid var(--color-border);
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
.info-sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
}
.info-sheet__overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
}
.info-sheet__content {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 88vh;
  background: var(--color-background);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: 10px 16px 24px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.18);
  touch-action: pan-y;
}
.info-sheet__handle {
  width: 64px;
  height: 6px;
  border-radius: 999px;
  background: var(--color-border);
  margin: 0 auto 12px;
}
.info-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.info-sheet__title {
  margin: 0;
  font-size: 40px;
  line-height: 1.05;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}
.info-sheet__body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.info-sheet__section-title {
  margin: 0 0 8px;
  font-size: 48px;
  line-height: 1.08;
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}
.info-sheet__section-description {
  margin: 0;
  white-space: pre-line;
  font-size: 20px;
  line-height: 1.35;
  color: var(--color-text-primary);
}
@media (max-width: 520px) {
  .info-sheet__title {
    font-size: 24px;
  }
  .info-sheet__section-title {
    font-size: 18px;
  }
  .info-sheet__section-description {
    font-size: 16px;
  }
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
  padding: 12px;
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
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-background);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  transition: border-color var(--transition-duration) var(--transition-easing);
}
.transaction-item:hover {
  border-color: var(--color-border-hover);
}
.transaction-item--pending {
  background: var(--color-background-secondary);
  border-color: var(--color-border);
}
.transaction-item--pending .transaction-icon {
  background: rgba(158, 158, 158, 0.12) !important;
  color: var(--color-text-muted) !important;
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
.transaction-breakdown {
  margin-top: 6px;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.25;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
}
.transaction-breakdown--earn {
  color: #2e7d32;
  background: rgba(76, 175, 80, 0.12);
  border-color: rgba(76, 175, 80, 0.28);
}
.transaction-breakdown--spend {
  color: #c62828;
  background: rgba(244, 67, 54, 0.12);
  border-color: rgba(244, 67, 54, 0.28);
}
.transaction-breakdown--other {
  color: var(--color-text-secondary);
  background: var(--color-background-secondary);
  border-color: var(--color-border);
}
.transaction-text--muted {
  color: var(--color-text-muted);
}
.transaction-text--muted.transaction-breakdown {
  background: var(--color-background-secondary);
  border-color: var(--color-border);
}
.transaction-pending {
  margin-top: 4px;
  font-size: var(--font-size-caption);
  color: var(--color-text-muted);
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
.transaction-amount.muted {
  color: var(--color-text-muted);
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
