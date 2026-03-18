import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { ROUTE_QUERY_KEYS } from "@/shared/constants/storage-keys.js";

const HOME_ROUTE = "/";
const LOGIN_ROUTE = "/login";

const createHomeWithOpenCityTarget = () => ({
  path: HOME_ROUTE,
  query: { [ROUTE_QUERY_KEYS.OPEN_CITY]: "1" },
  replace: true,
});

export const createNavigationContext = () => ({
  isRedirecting: false,
});

export const registerAuthGuard = (router, navigationContext) => {
  router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();
    const locationStore = useLocationStore();

    if (navigationContext.isRedirecting) {
      navigationContext.isRedirecting = false;
      return next();
    }

    if (to.meta.requiresAuth && (!authStore.sessionChecked || !authStore.isAuthenticated)) {
      await authStore.verifySession();
    }

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      return next(LOGIN_ROUTE);
    }

    if (to.name === "Login" && authStore.isAuthenticated) {
      navigationContext.isRedirecting = true;

      if (!locationStore.selectedCity) {
        return next(createHomeWithOpenCityTarget());
      }

      return next({ path: HOME_ROUTE, replace: true });
    }

    next();
  });
};
