import { onMounted, onUnmounted, ref } from "vue";

/**
 * Composable для отслеживания состояния клавиатуры на мобильных устройствах
 *
 * Определяет открыта ли клавиатура на основе изменения viewport height
 * Работает на iOS и Android
 *
 * @returns {Object} { isKeyboardOpen, viewportHeight }
 */
export function useKeyboardHandler() {
  const isKeyboardOpen = ref(false);
  const viewportHeight = ref(window.innerHeight);
  const initialHeight = window.innerHeight;

  function handleResize() {
    const currentHeight = window.visualViewport?.height || window.innerHeight;

    // Если высота уменьшилась значительно (более 20%) - клавиатура открыта
    if (currentHeight < initialHeight * 0.8) {
      isKeyboardOpen.value = true;
    } else {
      isKeyboardOpen.value = false;
    }

    viewportHeight.value = currentHeight;
  }

  onMounted(() => {
    // Стандартное событие resize
    window.addEventListener("resize", handleResize);

    // Для iOS используем visualViewport API (более точный)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
    }
  });

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", handleResize);
      window.visualViewport.removeEventListener("scroll", handleResize);
    }
  });

  return {
    isKeyboardOpen,
    viewportHeight,
  };
}
