import { useAuthStore } from "@/shared/stores/auth.js";

export const permissionGuard = (to) => {
  const authStore = useAuthStore();

  const requiredPermissions = Array.isArray(to.meta.permissions)
    ? to.meta.permissions
    : to.meta.permissions
      ? [to.meta.permissions]
      : [];

  if (requiredPermissions.length > 0 && !authStore.hasAnyPermission(requiredPermissions)) {
    return { name: "not-found" };
  }

  return true;
};
