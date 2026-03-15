import { useAuthStore } from "@/shared/stores/auth.js";

export const authGuard = async (to) => {
  const authStore = useAuthStore();

  if (!authStore.sessionChecked) {
    await authStore.restoreSession();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.meta.public && authStore.isAuthenticated && to.name === "login") {
    return { name: "dashboard" };
  }

  return true;
};
