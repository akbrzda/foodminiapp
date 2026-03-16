import { defineStore } from "pinia";
import { LOCAL_STORAGE_KEYS } from "@/shared/constants/storage-keys.js";
import {
  readLocalJson,
  readLocalString,
  removeLocalItem,
  writeLocalJson,
  writeLocalString,
} from "@/shared/services/storage/web-storage.js";
import { devError } from "@/shared/utils/logger.js";

const readPersistedState = () => {
  const selectedCity = readLocalJson(LOCAL_STORAGE_KEYS.SELECTED_CITY, null);
  const selectedBranchByCity = readLocalJson(LOCAL_STORAGE_KEYS.SELECTED_BRANCH_BY_CITY, {});
  const deliveryAddressByCity = readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS_BY_CITY, {});
  const deliveryCoordsByCity = readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS_BY_CITY, {});
  const deliveryDetailsByCity = readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS_BY_CITY, {});
  const deliveryZoneByCity = readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE_BY_CITY, {});

  const cityId = selectedCity?.id;

  return {
    selectedCity,
    selectedBranch: readLocalJson(LOCAL_STORAGE_KEYS.SELECTED_BRANCH, null),
    selectedBranchByCity,
    deliveryType: readLocalString(LOCAL_STORAGE_KEYS.DELIVERY_TYPE, "delivery"),
    deliveryAddressByCity,
    deliveryAddress:
      cityId && deliveryAddressByCity[cityId] !== undefined
        ? deliveryAddressByCity[cityId]
        : readLocalString(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS, ""),
    deliveryCoordsByCity,
    deliveryCoords:
      cityId && deliveryCoordsByCity[cityId] !== undefined
        ? deliveryCoordsByCity[cityId]
        : readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS, null),
    deliveryDetailsByCity,
    deliveryDetails:
      cityId && deliveryDetailsByCity[cityId] !== undefined
        ? deliveryDetailsByCity[cityId]
        : readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS, null),
    deliveryZoneByCity,
    deliveryZone:
      cityId && deliveryZoneByCity[cityId] !== undefined
        ? deliveryZoneByCity[cityId]
        : readLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE, null),
  };
};

const persistBranch = (branch) => {
  if (branch) {
    writeLocalJson(LOCAL_STORAGE_KEYS.SELECTED_BRANCH, branch);
    return;
  }

  removeLocalItem(LOCAL_STORAGE_KEYS.SELECTED_BRANCH);
};

export const useLocationStore = defineStore("location", {
  state: () => {
    const persisted = readPersistedState();

    return {
      selectedCity: persisted.selectedCity,
      selectedBranch: persisted.selectedBranch,
      selectedBranchByCity: persisted.selectedBranchByCity,
      cities: [],
      branches: [],
      userLocation: null,
      deliveryType: persisted.deliveryType,
      deliveryAddressByCity: persisted.deliveryAddressByCity,
      deliveryAddress: persisted.deliveryAddress,
      deliveryCoordsByCity: persisted.deliveryCoordsByCity,
      deliveryCoords: persisted.deliveryCoords,
      deliveryDetailsByCity: persisted.deliveryDetailsByCity,
      deliveryDetails: persisted.deliveryDetails,
      deliveryZoneByCity: persisted.deliveryZoneByCity,
      deliveryZone: persisted.deliveryZone,
    };
  },
  getters: {
    hasCitySelected: (state) => !!state.selectedCity,
    hasBranchSelected: (state) => !!state.selectedBranch,
    isDelivery: (state) => state.deliveryType === "delivery",
    isPickup: (state) => state.deliveryType === "pickup",
  },
  actions: {
    setCity(city) {
      const previousCityId = this.selectedCity?.id;

      if (previousCityId) {
        this.deliveryAddressByCity[previousCityId] = this.deliveryAddress || "";
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS_BY_CITY, this.deliveryAddressByCity);

        this.deliveryCoordsByCity[previousCityId] = this.deliveryCoords || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS_BY_CITY, this.deliveryCoordsByCity);

        this.deliveryDetailsByCity[previousCityId] = this.deliveryDetails || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS_BY_CITY, this.deliveryDetailsByCity);

        this.deliveryZoneByCity[previousCityId] = this.deliveryZone || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE_BY_CITY, this.deliveryZoneByCity);

        this.selectedBranchByCity[previousCityId] = this.selectedBranch || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.SELECTED_BRANCH_BY_CITY, this.selectedBranchByCity);
      }

      this.selectedCity = city;

      if (city) {
        writeLocalJson(LOCAL_STORAGE_KEYS.SELECTED_CITY, city);

        this.deliveryAddress = this.deliveryAddressByCity[city.id] || "";
        writeLocalString(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS, this.deliveryAddress);

        this.deliveryCoords = this.deliveryCoordsByCity[city.id] || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS, this.deliveryCoords || null);

        this.deliveryDetails = this.deliveryDetailsByCity[city.id] || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS, this.deliveryDetails || null);

        this.selectedBranch = this.selectedBranchByCity[city.id] || null;
        this.deliveryZone = this.deliveryZoneByCity[city.id] || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE, this.deliveryZone || null);
        persistBranch(this.selectedBranch);
        return;
      }

      removeLocalItem(LOCAL_STORAGE_KEYS.SELECTED_CITY);
      this.deliveryAddress = "";
      removeLocalItem(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS);
      this.deliveryCoords = null;
      removeLocalItem(LOCAL_STORAGE_KEYS.DELIVERY_COORDS);
      this.deliveryDetails = null;
      removeLocalItem(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS);
      this.deliveryZone = null;
      removeLocalItem(LOCAL_STORAGE_KEYS.DELIVERY_ZONE);
      this.selectedBranch = null;
      persistBranch(null);
    },
    setBranch(branch) {
      this.selectedBranch = branch;
      persistBranch(branch);

      if (this.selectedCity?.id) {
        this.selectedBranchByCity[this.selectedCity.id] = branch || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.SELECTED_BRANCH_BY_CITY, this.selectedBranchByCity);
      }
    },
    setCities(cities) {
      this.cities = cities;
    },
    setBranches(branches) {
      this.branches = branches;
    },
    setUserLocation(location) {
      this.userLocation = location;
    },
    setDeliveryType(type) {
      this.deliveryType = type;
      writeLocalString(LOCAL_STORAGE_KEYS.DELIVERY_TYPE, type);
    },
    setDeliveryAddress(address) {
      const normalized = address || "";
      const isChanged = normalized !== (this.deliveryAddress || "");
      this.deliveryAddress = normalized;
      writeLocalString(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS, normalized);

      if (this.selectedCity?.id) {
        this.deliveryAddressByCity[this.selectedCity.id] = normalized;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ADDRESS_BY_CITY, this.deliveryAddressByCity);

        if (isChanged) {
          this.deliveryDetails = null;
          this.deliveryDetailsByCity[this.selectedCity.id] = null;
          writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS, this.deliveryDetails);
          writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS_BY_CITY, this.deliveryDetailsByCity);
        }
      }
    },
    setDeliveryCoords(coords) {
      this.deliveryCoords = coords;
      writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS, coords || null);

      if (this.selectedCity?.id) {
        this.deliveryCoordsByCity[this.selectedCity.id] = coords || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_COORDS_BY_CITY, this.deliveryCoordsByCity);
      }
    },
    setDeliveryDetails(details) {
      this.deliveryDetails = details;
      writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS, details || null);

      if (this.selectedCity?.id) {
        this.deliveryDetailsByCity[this.selectedCity.id] = details || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_DETAILS_BY_CITY, this.deliveryDetailsByCity);
      }
    },
    setDeliveryZone(zone) {
      const normalizedZone = zone && !Array.isArray(zone.tariffs) ? { ...zone, tariffs: [] } : zone;
      this.deliveryZone = normalizedZone;
      writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE, normalizedZone || null);

      if (this.selectedCity?.id) {
        this.deliveryZoneByCity[this.selectedCity.id] = normalizedZone || null;
        writeLocalJson(LOCAL_STORAGE_KEYS.DELIVERY_ZONE_BY_CITY, this.deliveryZoneByCity);
      }
    },
    async detectUserLocation() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Геолокация не поддерживается"));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            };
            this.setUserLocation(location);
            resolve(location);
          },
          (error) => {
            devError("Ошибка геолокации:", error);
            reject(error);
          }
        );
      });
    },
    findNearestCity(cities) {
      if (!this.userLocation || !cities || cities.length === 0) {
        return null;
      }

      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        if (!lat2 || !lon2) return Infinity;
        const R = 6371;
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(this.deg2rad(lat1)) *
            Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      let nearestCity = null;
      let minDistance = Infinity;

      cities.forEach((city) => {
        const distance = calculateDistance(
          this.userLocation.lat,
          this.userLocation.lon,
          city.latitude,
          city.longitude
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestCity = { ...city, distance };
        }
      });

      return nearestCity;
    },
    deg2rad(deg) {
      return deg * (Math.PI / 180);
    },
  },
});
