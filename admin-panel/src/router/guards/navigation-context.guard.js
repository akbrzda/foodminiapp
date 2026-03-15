import { useNavigationContextStore } from "@/shared/stores/navigationContext.js";

export const navigationContextGuard = (to, from) => {
  const navigationStore = useNavigationContextStore();

  if (
    from.meta.isList &&
    from.meta.listName &&
    (to.meta.isDetail || to.meta.isEdit) &&
    to.meta.parentList === from.meta.listName
  ) {
    navigationStore.setReturning(from.meta.listName, true);
    return true;
  }

  if (from.meta.isList && from.meta.listName && to.meta.parentList !== from.meta.listName) {
    navigationStore.clearContext(from.meta.listName);
  }

  if (to.meta.isList && to.meta.listName && from.meta.parentList !== to.meta.listName) {
    navigationStore.clearContext(to.meta.listName);
  }

  return true;
};

export const scrollRestoreGuard = (to, from, savedPosition) => {
  if (to.meta.isList && to.meta.listName) {
    const navigationStore = useNavigationContextStore();
    if (navigationStore.shouldRestore(to.meta.listName)) {
      return false;
    }
  }

  if (savedPosition) {
    return savedPosition;
  }

  return { top: 0, left: 0 };
};

export const resetReturningFlagAfterNavigation = (to) => {
  if (to.meta.isList && to.meta.listName) {
    const navigationStore = useNavigationContextStore();
    setTimeout(() => {
      navigationStore.setReturning(to.meta.listName, false);
    }, 100);
  }
};
