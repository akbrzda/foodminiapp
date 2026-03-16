import { useAuthStore } from "@/modules/auth/stores/auth.js";
import { useLocationStore } from "@/modules/location/stores/location.js";
import { ROUTE_QUERY_KEYS } from "@/shared/constants/storage-keys.js";

const ALLOWED_WITHOUT_LOCATION = new Set(["DeliveryMap", "PickupMap"]);

const isOpenCityQuery = (route) => route?.query?.[ROUTE_QUERY_KEYS.OPEN_CITY] === "1";

export const registerLocationGuard = (router, navigationContext) => {
  router.beforeEach((to, from, next) => {
    const authStore = useAuthStore();
    const locationStore = useLocationStore();

    if (navigationContext.isRedirecting) {
      navigationContext.isRedirecting = false;
      return next();
    }

    if (!to.meta.requiresLocation || !authStore.isAuthenticated) {
      return next();
    }

    if (to.name === "Home" && isOpenCityQuery(to)) {
      return next();
    }

    if (locationStore.selectedCity || ALLOWED_WITHOUT_LOCATION.has(to.name)) {
      return next();
    }

    if (from.name === "Home" && isOpenCityQuery(from)) {
      return next();
    }

    if (to.name === "Home" && isOpenCityQuery(to)) {
      return next();
    }

    navigationContext.isRedirecting = true;
    return next({
      path: "/",
      query: { [ROUTE_QUERY_KEYS.OPEN_CITY]: "1" },
      replace: true,
    });
  });
};
