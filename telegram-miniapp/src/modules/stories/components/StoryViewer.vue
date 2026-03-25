<template>
  <Teleport to="body">
    <div v-if="modelValue && hasSlides" class="story-viewer">
      <div class="story-viewer__progress">
        <div
          v-for="(slide, index) in story.slides"
          :key="slide.id || index"
          class="story-viewer__progress-item"
        >
          <span
            class="story-viewer__progress-fill"
            :style="{ width: getProgressWidth(index) }"
          />
        </div>
      </div>

      <button class="story-viewer__close" type="button" aria-label="Закрыть" @click="closeViewer">
        <X :size="28" />
      </button>

      <div class="story-viewer__media-wrap">
        <img
          class="story-viewer__media"
          :src="currentSlideMedia"
          :alt="currentSlide.title || story.title"
        />
      </div>

      <div class="story-viewer__overlay" />

      <div class="story-viewer__content">
        <h3 class="story-viewer__title">{{ currentSlide.title || story.title }}</h3>
        <p v-if="currentSlide.subtitle" class="story-viewer__subtitle">{{ currentSlide.subtitle }}</p>

        <button
          v-if="currentSlide.cta_text"
          class="story-viewer__cta"
          type="button"
          @click="handleCtaClick"
        >
          {{ currentSlide.cta_text }}
        </button>
      </div>

      <button
        class="story-viewer__nav story-viewer__nav--left"
        type="button"
        aria-label="Предыдущий слайд"
        @click="prevSlide"
      />
      <button
        class="story-viewer__nav story-viewer__nav--right"
        type="button"
        aria-label="Следующий слайд"
        @click="nextSlide"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { normalizeImageUrl } from "@/shared/utils/format.js";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  story: {
    type: Object,
    default: null,
  },
  initialSlideIndex: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(["update:modelValue", "slide-view", "cta-click", "completed"]);

const currentSlideIndex = ref(0);
const progressPercent = ref(0);
let intervalId = null;
let lockedScrollY = 0;

const hasSlides = computed(() => Array.isArray(props.story?.slides) && props.story.slides.length > 0);

const currentSlide = computed(() => {
  if (!hasSlides.value) return {};
  return props.story.slides[currentSlideIndex.value] || props.story.slides[0];
});

const currentSlideMedia = computed(() => normalizeImageUrl(currentSlide.value?.media_url || ""));

const lockBackgroundScroll = () => {
  if (typeof window === "undefined") return;
  const body = document.body;
  if (body.dataset.storyViewerScrollLock === "1") return;

  lockedScrollY = Number(window.scrollY || window.pageYOffset || 0);
  body.dataset.storyViewerScrollLock = "1";
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
};

const unlockBackgroundScroll = () => {
  if (typeof window === "undefined") return;
  const body = document.body;
  if (body.dataset.storyViewerScrollLock !== "1") return;

  body.style.removeProperty("position");
  body.style.removeProperty("top");
  body.style.removeProperty("left");
  body.style.removeProperty("right");
  body.style.removeProperty("width");
  body.style.removeProperty("overflow");
  delete body.dataset.storyViewerScrollLock;

  window.scrollTo({
    top: lockedScrollY,
    left: 0,
    behavior: "auto",
  });
};

const stopTimer = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

const startTimer = () => {
  stopTimer();
  progressPercent.value = 0;

  const durationMs = Math.max(Number(currentSlide.value?.duration_seconds || 6) * 1000, 1000);
  const tickMs = 100;
  const step = (tickMs / durationMs) * 100;

  intervalId = setInterval(() => {
    progressPercent.value = Math.min(progressPercent.value + step, 100);
    if (progressPercent.value >= 100) {
      nextSlide();
    }
  }, tickMs);
};

const openViewer = () => {
  if (!hasSlides.value) return;
  const maxIndex = props.story.slides.length - 1;
  const nextIndex = Math.min(Math.max(Number(props.initialSlideIndex || 0), 0), maxIndex);
  currentSlideIndex.value = nextIndex;
  emit("slide-view", {
    slide: currentSlide.value,
    slideIndex: currentSlideIndex.value,
  });
  startTimer();
};

const closeViewer = () => {
  stopTimer();
  emit("update:modelValue", false);
};

const goToSlide = (index) => {
  if (!hasSlides.value) return;
  const maxIndex = props.story.slides.length - 1;
  const nextIndex = Math.min(Math.max(index, 0), maxIndex);
  if (nextIndex === currentSlideIndex.value) return;

  currentSlideIndex.value = nextIndex;
  emit("slide-view", {
    slide: currentSlide.value,
    slideIndex: currentSlideIndex.value,
  });
  startTimer();
};

const prevSlide = () => {
  if (currentSlideIndex.value <= 0) {
    closeViewer();
    return;
  }
  goToSlide(currentSlideIndex.value - 1);
};

const nextSlide = () => {
  if (!hasSlides.value) {
    closeViewer();
    return;
  }

  if (currentSlideIndex.value >= props.story.slides.length - 1) {
    stopTimer();
    emit("completed", {
      slide: currentSlide.value,
      slideIndex: currentSlideIndex.value,
    });
    closeViewer();
    return;
  }

  goToSlide(currentSlideIndex.value + 1);
};

const handleCtaClick = () => {
  emit("cta-click", {
    slide: currentSlide.value,
    slideIndex: currentSlideIndex.value,
  });
};

const getProgressWidth = (index) => {
  if (index < currentSlideIndex.value) return "100%";
  if (index > currentSlideIndex.value) return "0%";
  return `${progressPercent.value}%`;
};

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      lockBackgroundScroll();
      openViewer();
      return;
    }
    stopTimer();
    unlockBackgroundScroll();
  }
);

onBeforeUnmount(() => {
  stopTimer();
  unlockBackgroundScroll();
});
</script>

<style scoped>
.story-viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #000;
}

.story-viewer__media-wrap {
  position: absolute;
  inset: 0;
}

.story-viewer__media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.story-viewer__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.08) 35%, rgba(0, 0, 0, 0.62) 100%);
}

.story-viewer__progress {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 1002;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 6px;
}

.story-viewer__progress-item {
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
  overflow: hidden;
}

.story-viewer__progress-fill {
  display: block;
  height: 100%;
  background: #fff;
  transition: width 0.08s linear;
}

.story-viewer__close {
  position: absolute;
  top: 28px;
  right: 14px;
  z-index: 1003;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, 0.25);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.story-viewer__content {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 1003;
}

.story-viewer__title {
  margin: 0;
  color: #fff;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
}

.story-viewer__subtitle {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  line-height: 1.35;
}

.story-viewer__cta {
  margin-top: 14px;
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #ffd100;
  color: #18222f;
  font-size: 16px;
  font-weight: 700;
}

.story-viewer__nav {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 36%;
  border: 0;
  background: transparent;
  z-index: 1001;
}

.story-viewer__nav--left {
  left: 0;
}

.story-viewer__nav--right {
  right: 0;
}
</style>
