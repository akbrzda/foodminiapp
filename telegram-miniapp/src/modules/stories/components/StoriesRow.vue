<template>
  <section class="stories" v-if="hasStories || isLoading">
    <div class="stories__track" v-if="isLoading">
      <div v-for="index in 3" :key="`story-skeleton-${index}`" class="stories__card stories__card--skeleton" />
    </div>

    <div class="stories__track" v-else>
      <button
        v-for="story in stories"
        :key="story.id"
        class="stories__card"
        :class="{ 'stories__card--viewed': story.is_viewed }"
        type="button"
        @click="openStory(story)"
      >
        <img class="stories__image" :src="getStoryPreview(story)" :alt="story.title" loading="lazy" />
        <span class="stories__title">{{ story.title }}</span>
      </button>
    </div>

    <StoryViewer
      v-model="isViewerOpen"
      :story="activeStory"
      :initial-slide-index="initialSlideIndex"
      @slide-view="handleSlideView"
      @cta-click="handleCtaClick"
      @completed="handleCompleted"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storiesAPI } from "@/shared/api/endpoints.js";
import { getPlatformBridge } from "@/shared/platform/index.js";
import { normalizeImageUrl } from "@/shared/utils/format.js";
import { devError } from "@/shared/utils/logger.js";
import StoryViewer from "@/modules/stories/components/StoryViewer.vue";

const props = defineProps({
  cityId: {
    type: Number,
    default: null,
  },
  branchId: {
    type: Number,
    default: null,
  },
  placement: {
    type: String,
    default: "home",
  },
});

const router = useRouter();
const bridge = getPlatformBridge();

const isLoading = ref(false);
const stories = ref([]);
const activeStory = ref(null);
const isViewerOpen = ref(false);
const initialSlideIndex = ref(0);

const hasStories = computed(() => stories.value.length > 0);

const getStoryPreview = (story) => {
  return normalizeImageUrl(story?.cover_image_url || story?.slides?.[0]?.media_url || "");
};

const fetchStories = async () => {
  isLoading.value = true;
  try {
    const response = await storiesAPI.getActive({
      placement: props.placement,
      cityId: props.cityId,
      branchId: props.branchId,
    });
    const items = response?.data?.items;
    stories.value = Array.isArray(items) ? items.filter((item) => Array.isArray(item.slides) && item.slides.length > 0) : [];
  } catch (error) {
    devError("Ошибка загрузки stories:", error);
    stories.value = [];
  } finally {
    isLoading.value = false;
  }
};

const markStoryViewed = (storyId) => {
  stories.value = stories.value.map((story) => {
    if (story.id !== storyId) return story;
    return {
      ...story,
      is_viewed: true,
    };
  });
};

const openStory = (story) => {
  activeStory.value = story;
  initialSlideIndex.value = 0;
  isViewerOpen.value = true;
};

const handleSlideView = async ({ slide, slideIndex }) => {
  if (!activeStory.value?.id || !slide?.id) return;

  initialSlideIndex.value = slideIndex;
  markStoryViewed(activeStory.value.id);

  try {
    await storiesAPI.trackImpression({
      campaignId: activeStory.value.id,
      slideId: slide.id,
      placement: props.placement,
    });
  } catch (error) {
    devError("Ошибка трекинга показа stories:", error);
  }
};

const executeCta = async (ctaType, ctaValue) => {
  if (!ctaType || ctaType === "none" || !ctaValue) return;

  if (ctaType === "url") {
    bridge.openLink(ctaValue);
    return;
  }

  if (ctaType === "product") {
    await router.push(`/item/${ctaValue}`);
    return;
  }

  if (ctaType === "category") {
    await router.push({ path: "/", query: { category_id: String(ctaValue), story_nav: String(Date.now()) } });
  }
};

const handleCtaClick = async ({ slide }) => {
  if (!activeStory.value?.id || !slide?.id) return;
  const ctaType = String(slide.cta_type || "").trim().toLowerCase();

  try {
    await executeCta(ctaType, slide.cta_value);
  } catch (error) {
    devError("Ошибка обработки CTA stories:", error);
  }

  isViewerOpen.value = false;

  storiesAPI
    .trackClick({
      campaignId: activeStory.value.id,
      slideId: slide.id,
      placement: props.placement,
      ctaType,
      ctaValue: slide.cta_value,
    })
    .catch((error) => {
      devError("Ошибка трекинга клика stories:", error);
    });
};

const handleCompleted = async ({ slideIndex }) => {
  if (!activeStory.value?.id) return;

  try {
    await storiesAPI.trackComplete({
      campaignId: activeStory.value.id,
      lastSlideIndex: slideIndex,
    });
  } catch (error) {
    devError("Ошибка трекинга завершения stories:", error);
  }
};

watch(
  () => [props.cityId, props.branchId, props.placement],
  () => {
    fetchStories();
  }
);

onMounted(() => {
  fetchStories();
});
</script>

<style scoped>
.stories {
  margin: 14px 16px 8px;
}

.stories__track {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: none;
}

.stories__track::-webkit-scrollbar {
  display: none;
}

.stories__card {
  position: relative;
  flex: 0 0 116px;
  width: 116px;
  height: 162px;
  border-radius: 22px;
  border: 2px solid #ffd100;
  padding: 0;
  overflow: hidden;
  background: #f0f2f5;
}

.stories__card--viewed {
  border-color: #c2c9d2;
}

.stories__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stories__title {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-align: left;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.stories__card--skeleton {
  border: 0;
  background: linear-gradient(90deg, #eaedf2 0%, #f6f8fa 45%, #eaedf2 100%);
  background-size: 200% 100%;
  animation: stories-skeleton 1.2s ease-in-out infinite;
}

@keyframes stories-skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
