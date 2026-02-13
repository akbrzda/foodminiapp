import { defineStore } from "pinia";

/**
 * Store для управления навигационным контекстом списочных страниц.
 * Сохраняет фильтры, позицию скролла и другие параметры состояния
 * при переходе на детальные страницы и восстанавливает их при возврате.
 */
export const useNavigationContextStore = defineStore("navigationContext", {
  state: () => ({
    // Карта контекстов: ключ - имя маршрута списка, значение - объект контекста
    contexts: {},
  }),

  getters: {
    /**
     * Проверяет, нужно ли восстанавливать контекст для указанного списка
     */
    shouldRestore: (state) => (listName) => {
      const context = state.contexts[listName];
      return context && context.isReturning === true;
    },

    /**
     * Получить контекст для указанного списка
     */
    getContext: (state) => (listName) => {
      return state.contexts[listName] || null;
    },
  },

  actions: {
    /**
     * Сохранить контекст списка
     * @param {string} listName - имя маршрута списка
     * @param {object} context - объект контекста { filters, scroll, ...customData }
     */
    saveContext(listName, context) {
      if (!listName) {
        return;
      }

      this.contexts[listName] = {
        ...context,
        timestamp: Date.now(),
        isReturning: false,
      };
    },

    /**
     * Восстановить контекст списка
     * @param {string} listName - имя маршрута списка
     * @returns {object|null} - объект контекста или null
     */
    restoreContext(listName) {
      if (!listName) {
        return null;
      }

      const context = this.contexts[listName];

      return context || null;
    },

    /**
     * Очистить контекст конкретного списка
     * @param {string} listName - имя маршрута списка
     */
    clearContext(listName) {
      if (!listName) return;

      if (this.contexts[listName]) {
        delete this.contexts[listName];
      }
    },

    /**
     * Очистить все контексты
     */
    clearAllContexts() {
      this.contexts = {};
    },

    /**
     * Установить флаг ожидания возврата на список
     * @param {string} listName - имя маршрута списка
     * @param {boolean} value - значение флага
     */
    setReturning(listName, value) {
      if (!listName) return;

      if (this.contexts[listName]) {
        this.contexts[listName].isReturning = value;
      }
    },

    /**
     * Очистить устаревшие контексты
     * @param {number} ttl - время жизни контекста в миллисекундах (по умолчанию 1 час)
     */
    cleanupOldContexts(ttl = 3600000) {
      const now = Date.now();
      const toDelete = [];

      Object.entries(this.contexts).forEach(([key, context]) => {
        if (context.timestamp && now - context.timestamp > ttl) {
          toDelete.push(key);
        }
      });

      toDelete.forEach((key) => {
        delete this.contexts[key];
      });
    },

    /**
     * Ограничить количество сохраненных контекстов
     * @param {number} maxContexts - максимальное количество контекстов
     */
    enforceLimit(maxContexts = 15) {
      const entries = Object.entries(this.contexts);

      if (entries.length > maxContexts) {
        // Сортируем по timestamp, удаляем самые старые
        const sorted = entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
        const toDelete = sorted.slice(0, entries.length - maxContexts);

        toDelete.forEach(([key]) => {
          delete this.contexts[key];
        });
      }
    },
  },
});

// Отладочные команды для dev режима
if (import.meta.env.DEV) {
  window.debugNavigation = {
    getContexts: () => {
      const store = useNavigationContextStore();
      return store.contexts;
    },
    clearAll: () => {
      const store = useNavigationContextStore();
      store.clearAllContexts();
    },
    clearContext: (listName) => {
      const store = useNavigationContextStore();
      store.clearContext(listName);
    },
  };
}
