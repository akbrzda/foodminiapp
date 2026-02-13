import { computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useNavigationContextStore } from "@/shared/stores/navigationContext.js";

/**
 * Composable для работы с навигационным контекстом списочных страниц.
 * Предоставляет методы для сохранения и восстановления состояния списка
 * при переходе на детальные страницы и возврате.
 *
 * @param {string} listName - уникальное имя списка (должно совпадать с meta.listName в роутере)
 * @returns {object} - методы и computed свойства для работы с контекстом
 */
export function useListContext(listName) {
  const router = useRouter();
  const navigationStore = useNavigationContextStore();

  /**
   * Нужно ли восстанавливать контекст для текущего списка
   */
  const shouldRestore = computed(() => {
    return navigationStore.shouldRestore(listName);
  });

  /**
   * Сохранить текущий контекст списка
   * @param {object} filters - объект с фильтрами списка
   * @param {object} additionalData - дополнительные данные (currentPage, activeTab и т.д.)
   */
  const saveContext = (filters, additionalData = {}) => {
    if (!listName) return;

    // Получаем текущую позицию скролла
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    navigationStore.saveContext(listName, {
      filters: { ...filters },
      scroll: scrollY,
      ...additionalData,
    });

  };

  /**
   * Восстановить сохраненный контекст списка
   * @returns {object|null} - объект контекста или null если контекста нет
   */
  const restoreContext = () => {
    if (!listName) return null;

    const context = navigationStore.restoreContext(listName);

    return context;
  };

  /**
   * Восстановить позицию скролла
   * @param {number} scrollPosition - позиция скролла
   */
  const restoreScroll = (scrollPosition) => {
    if (typeof scrollPosition !== "number" || scrollPosition < 0) return;

    // Ждем отрисовки DOM, затем восстанавливаем скролл
    nextTick(() => {
      setTimeout(() => {
        window.scrollTo({
          top: scrollPosition,
          left: 0,
          behavior: "instant",
        });

      }, 50);
    });
  };

  /**
   * Очистить контекст списка
   */
  const clearContext = () => {
    if (!listName) return;

    navigationStore.clearContext(listName);

  };

  /**
   * Перейти на детальную страницу
   * (контекст сохранится автоматически в navigation guard)
   * @param {string} detailRouteName - имя маршрута детальной страницы
   * @param {object} params - параметры маршрута
   * @param {object} query - query параметры
   */
  const navigateToDetail = (detailRouteName, params = {}, query = {}) => {
    router.push({ name: detailRouteName, params, query });
  };

  return {
    // Computed свойства
    shouldRestore,

    // Методы
    saveContext,
    restoreContext,
    restoreScroll,
    clearContext,
    navigateToDetail,
  };
}
