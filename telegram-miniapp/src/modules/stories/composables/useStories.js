import { ref } from "vue";

export const useStories = () => {
  const stories = ref([]);
  const loading = ref(false);

  const setStories = (items) => {
    stories.value = Array.isArray(items) ? items : [];
  };

  return {
    stories,
    loading,
    setStories,
  };
};
