import { onMounted, onUnmounted, ref } from "vue";
export function useKeyboardHandler() {
  const isKeyboardOpen = ref(false);
  const viewportHeight = ref(window.innerHeight);
  const initialHeight = window.innerHeight;
  function handleResize() {
    const currentHeight = window.visualViewport?.height || window.innerHeight;
    if (currentHeight < initialHeight * 0.8) {
      isKeyboardOpen.value = true;
    } else {
      isKeyboardOpen.value = false;
    }
    viewportHeight.value = currentHeight;
  }
  onMounted(() => {
    window.addEventListener("resize", handleResize);
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
