import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

export function useQueryTab({
  queryKey = "tab",
  defaultValue,
  allowedValues = null,
  parse = (value) => value,
  serialize = (value) => String(value),
} = {}) {
  const route = useRoute();
  const router = useRouter();
  const currentTab = ref(defaultValue);

  const normalize = (rawValue) => {
    const parsedValue = parse(rawValue);
    if (Array.isArray(allowedValues) && allowedValues.length > 0) {
      return allowedValues.includes(parsedValue) ? parsedValue : defaultValue;
    }
    if (parsedValue === undefined || parsedValue === null || parsedValue === "") {
      return defaultValue;
    }
    return parsedValue;
  };

  watch(
    () => route.query?.[queryKey],
    (queryValue) => {
      const rawValue = Array.isArray(queryValue) ? queryValue[0] : queryValue;
      const nextTab = normalize(rawValue);
      if (currentTab.value !== nextTab) {
        currentTab.value = nextTab;
      }
    },
    { immediate: true },
  );

  watch(
    currentTab,
    (value) => {
      const normalizedTab = normalize(value);
      if (value !== normalizedTab) {
        currentTab.value = normalizedTab;
        return;
      }

      const serializedValue = serialize(normalizedTab);
      const currentQueryValue = Array.isArray(route.query?.[queryKey]) ? route.query?.[queryKey]?.[0] : route.query?.[queryKey];
      if (String(currentQueryValue ?? "") === String(serializedValue ?? "")) {
        return;
      }

      const nextQuery = { ...route.query };
      if (serializedValue === undefined || serializedValue === null || serializedValue === "") {
        delete nextQuery[queryKey];
      } else {
        nextQuery[queryKey] = serializedValue;
      }

      router.replace({ query: nextQuery }).catch(() => {});
    },
    { immediate: true },
  );

  return currentTab;
}

export default {
  useQueryTab,
};
