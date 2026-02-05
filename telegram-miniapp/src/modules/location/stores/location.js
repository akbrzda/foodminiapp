import { defineStore } from "pinia";
export const useLocationStore = defineStore("location", {
  state: () => ({
    selectedCity: JSON.parse(localStorage.getItem("selectedCity") || "null"),
    selectedBranch: JSON.parse(localStorage.getItem("selectedBranch") || "null"),
    selectedBranchByCity: JSON.parse(localStorage.getItem("selectedBranchByCity") || "{}"),
    cities: [],
    branches: [],
    userLocation: null,
    deliveryType: localStorage.getItem("deliveryType") || "delivery",
    deliveryAddressByCity: JSON.parse(localStorage.getItem("deliveryAddressByCity") || "{}"),
    deliveryAddress: (() => {
      const storedCity = JSON.parse(localStorage.getItem("selectedCity") || "null");
      const addressByCity = JSON.parse(localStorage.getItem("deliveryAddressByCity") || "{}");
      if (storedCity?.id && addressByCity[storedCity.id]) {
        return addressByCity[storedCity.id];
      }
      return localStorage.getItem("deliveryAddress") || "";
    })(),
    deliveryCoordsByCity: JSON.parse(localStorage.getItem("deliveryCoordsByCity") || "{}"),
    deliveryCoords: (() => {
      const storedCity = JSON.parse(localStorage.getItem("selectedCity") || "null");
      const coordsByCity = JSON.parse(localStorage.getItem("deliveryCoordsByCity") || "{}");
      if (storedCity?.id && coordsByCity[storedCity.id]) {
        return coordsByCity[storedCity.id];
      }
      const raw = localStorage.getItem("deliveryCoords");
      return raw ? JSON.parse(raw) : null;
    })(),
    deliveryDetailsByCity: JSON.parse(localStorage.getItem("deliveryDetailsByCity") || "{}"),
    deliveryDetails: (() => {
      const storedCity = JSON.parse(localStorage.getItem("selectedCity") || "null");
      const detailsByCity = JSON.parse(localStorage.getItem("deliveryDetailsByCity") || "{}");
      if (storedCity?.id && detailsByCity[storedCity.id]) {
        return detailsByCity[storedCity.id];
      }
      const raw = localStorage.getItem("deliveryDetails");
      return raw ? JSON.parse(raw) : null;
    })(),
    deliveryZoneByCity: JSON.parse(localStorage.getItem("deliveryZoneByCity") || "{}"),
    deliveryZone: (() => {
      const storedCity = JSON.parse(localStorage.getItem("selectedCity") || "null");
      const zoneByCity = JSON.parse(localStorage.getItem("deliveryZoneByCity") || "{}");
      if (storedCity?.id && zoneByCity[storedCity.id]) {
        return zoneByCity[storedCity.id];
      }
      const raw = localStorage.getItem("deliveryZone");
      return raw ? JSON.parse(raw) : null;
    })(),
  }),
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
        localStorage.setItem("deliveryAddressByCity", JSON.stringify(this.deliveryAddressByCity));
        this.deliveryCoordsByCity[previousCityId] = this.deliveryCoords || null;
        localStorage.setItem("deliveryCoordsByCity", JSON.stringify(this.deliveryCoordsByCity));
        this.deliveryDetailsByCity[previousCityId] = this.deliveryDetails || null;
        localStorage.setItem("deliveryDetailsByCity", JSON.stringify(this.deliveryDetailsByCity));
        this.deliveryZoneByCity[previousCityId] = this.deliveryZone || null;
        localStorage.setItem("deliveryZoneByCity", JSON.stringify(this.deliveryZoneByCity));
        this.selectedBranchByCity[previousCityId] = this.selectedBranch || null;
        localStorage.setItem("selectedBranchByCity", JSON.stringify(this.selectedBranchByCity));
      }
      this.selectedCity = city;
      if (city) {
        localStorage.setItem("selectedCity", JSON.stringify(city));
        this.deliveryAddress = this.deliveryAddressByCity[city.id] || "";
        localStorage.setItem("deliveryAddress", this.deliveryAddress);
        this.deliveryCoords = this.deliveryCoordsByCity[city.id] || null;
        localStorage.setItem("deliveryCoords", JSON.stringify(this.deliveryCoords || null));
        this.deliveryDetails = this.deliveryDetailsByCity[city.id] || null;
        localStorage.setItem("deliveryDetails", JSON.stringify(this.deliveryDetails || null));
        this.selectedBranch = this.selectedBranchByCity[city.id] || null;
        this.deliveryZone = this.deliveryZoneByCity[city.id] || null;
        localStorage.setItem("deliveryZone", JSON.stringify(this.deliveryZone || null));
        if (this.selectedBranch) {
          localStorage.setItem("selectedBranch", JSON.stringify(this.selectedBranch));
        } else {
          localStorage.removeItem("selectedBranch");
        }
      } else {
        localStorage.removeItem("selectedCity");
        this.deliveryAddress = "";
        localStorage.removeItem("deliveryAddress");
        this.deliveryCoords = null;
        localStorage.removeItem("deliveryCoords");
        this.deliveryDetails = null;
        localStorage.removeItem("deliveryDetails");
        this.deliveryZone = null;
        localStorage.removeItem("deliveryZone");
        this.selectedBranch = null;
        localStorage.removeItem("selectedBranch");
      }
    },
    setBranch(branch) {
      this.selectedBranch = branch;
      if (branch) {
        localStorage.setItem("selectedBranch", JSON.stringify(branch));
      } else {
        localStorage.removeItem("selectedBranch");
      }
      if (this.selectedCity?.id) {
        this.selectedBranchByCity[this.selectedCity.id] = branch || null;
        localStorage.setItem("selectedBranchByCity", JSON.stringify(this.selectedBranchByCity));
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
      localStorage.setItem("deliveryType", type);
    },
    setDeliveryAddress(address) {
      const normalized = address || "";
      const isChanged = normalized !== (this.deliveryAddress || "");
      this.deliveryAddress = normalized;
      localStorage.setItem("deliveryAddress", normalized);
      if (this.selectedCity?.id) {
        this.deliveryAddressByCity[this.selectedCity.id] = normalized;
        localStorage.setItem("deliveryAddressByCity", JSON.stringify(this.deliveryAddressByCity));
        if (isChanged) {
          this.deliveryDetails = null;
          this.deliveryDetailsByCity[this.selectedCity.id] = null;
          localStorage.setItem("deliveryDetails", JSON.stringify(this.deliveryDetails));
          localStorage.setItem("deliveryDetailsByCity", JSON.stringify(this.deliveryDetailsByCity));
        }
      }
    },
    setDeliveryCoords(coords) {
      this.deliveryCoords = coords;
      localStorage.setItem("deliveryCoords", JSON.stringify(coords || null));
      if (this.selectedCity?.id) {
        this.deliveryCoordsByCity[this.selectedCity.id] = coords || null;
        localStorage.setItem("deliveryCoordsByCity", JSON.stringify(this.deliveryCoordsByCity));
      }
    },
    setDeliveryDetails(details) {
      this.deliveryDetails = details;
      localStorage.setItem("deliveryDetails", JSON.stringify(details || null));
      if (this.selectedCity?.id) {
        this.deliveryDetailsByCity[this.selectedCity.id] = details || null;
        localStorage.setItem("deliveryDetailsByCity", JSON.stringify(this.deliveryDetailsByCity));
      }
    },
    setDeliveryZone(zone) {
      if (zone && !Array.isArray(zone.tariffs)) {
        zone = { ...zone, tariffs: [] };
      }
      this.deliveryZone = zone;
      localStorage.setItem("deliveryZone", JSON.stringify(zone || null));
      if (this.selectedCity?.id) {
        this.deliveryZoneByCity[this.selectedCity.id] = zone || null;
        localStorage.setItem("deliveryZoneByCity", JSON.stringify(this.deliveryZoneByCity));
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
            console.error("Ошибка геолокации:", error);
            reject(error);
          },
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
          Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };
      let nearestCity = null;
      let minDistance = Infinity;
      cities.forEach((city) => {
        const distance = calculateDistance(this.userLocation.lat, this.userLocation.lon, city.latitude, city.longitude);
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
