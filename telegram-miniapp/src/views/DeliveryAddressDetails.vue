<template>
  <div class="address-details">
    <div class="content">
      <label class="label">улица, дом</label>
      <input v-model="address" class="input" placeholder="улица, дом" @focus="onInputFocus" />
      <div class="grid">
        <input v-model="details.entrance" class="input" placeholder="Подъезд" @focus="onInputFocus" />
        <input v-model="details.doorCode" class="input" placeholder="Код на двери" @focus="onInputFocus" />
        <input v-model="details.floor" class="input" placeholder="Этаж" @focus="onInputFocus" />
        <input v-model="details.apartment" class="input" placeholder="Квартира" @focus="onInputFocus" />
      </div>
      <div v-if="deliveryZoneError" class="error-message">
        {{ deliveryZoneError }}
      </div>
      <textarea v-model="details.comment" class="textarea" placeholder="Комментарий к адресу" @focus="onInputFocus"></textarea>
      <button class="primary-btn" @click="save">Сохранить</button>
    </div>
  </div>
</template>
<script setup>
import { reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { addressesAPI, geocodeAPI } from "../api/endpoints";
import { hapticFeedback } from "../services/telegram";
const router = useRouter();
const locationStore = useLocationStore();
const address = ref(locationStore.deliveryAddress || "");
const lastAddress = ref(address.value);
const deliveryZoneError = ref("");
const details = reactive({
  entrance: locationStore.deliveryDetails?.entrance || "",
  doorCode: locationStore.deliveryDetails?.doorCode || "",
  floor: locationStore.deliveryDetails?.floor || "",
  apartment: locationStore.deliveryDetails?.apartment || "",
  comment: locationStore.deliveryDetails?.comment || "",
});
function goBack() {
  router.back();
}
function onInputFocus(event) {
  setTimeout(() => {
    event.target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 300);
}
async function save() {
  deliveryZoneError.value = "";
  if (!address.value.trim()) {
    hapticFeedback("error");
    return;
  }
  if (!locationStore.selectedCity?.id) {
    deliveryZoneError.value = "Сначала выберите город";
    hapticFeedback("error");
    return;
  }
  let coords = locationStore.deliveryCoords;
  if (!coords) {
    try {
      const geo = await geocodeAPI.geocode(address.value.trim());
      coords = { lat: geo.data.lat, lng: geo.data.lng };
      locationStore.setDeliveryCoords(coords);
    } catch (error) {
      console.error("Failed to geocode address:", error);
      deliveryZoneError.value = "Не удалось определить адрес";
      hapticFeedback("error");
      return;
    }
  }
  try {
    const response = await addressesAPI.checkDeliveryZone(coords.lat, coords.lng, locationStore.selectedCity.id);
    if (!response?.data?.available || !response?.data?.polygon) {
      deliveryZoneError.value = "Адрес не входит в зону доставки";
      locationStore.setDeliveryZone(null);
      hapticFeedback("error");
      return;
    }
    locationStore.setDeliveryZone(response.data.polygon);
  } catch (error) {
    console.error("Failed to update delivery zone:", error);
    deliveryZoneError.value = "Не удалось проверить зону доставки";
    hapticFeedback("error");
    return;
  }
  locationStore.setDeliveryAddress(address.value.trim());
  locationStore.setDeliveryDetails({ ...details });
  hapticFeedback("success");
  router.push("/");
}
watch(address, (value) => {
  if (value !== lastAddress.value) {
    details.entrance = "";
    details.doorCode = "";
    details.floor = "";
    details.apartment = "";
    details.comment = "";
    lastAddress.value = value;
    deliveryZoneError.value = "";
  }
});
</script>
<style scoped>
.address-details {
  min-height: 100vh;
  background: var(--color-background);
}
.content {
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.label {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-regular);
}
.input {
  width: 100%;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-background);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  transition: border-color var(--transition-duration) var(--transition-easing);
}
.input:focus {
  outline: none;
  border-color: var(--color-primary);
}
.input::placeholder {
  color: var(--color-text-muted);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.error-message {
  padding: 10px 12px;
  border-radius: var(--border-radius-md);
  background: #ffebee;
  color: #c62828;
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-semibold);
}
.textarea {
  width: 100%;
  min-height: 120px;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-background);
  font-size: var(--font-size-body);
  resize: none;
  color: var(--color-text-primary);
  font-family: inherit;
  transition: border-color var(--transition-duration) var(--transition-easing);
}
.textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}
.textarea::placeholder {
  color: var(--color-text-muted);
}
.primary-btn {
  width: 100%;
  padding: 16px;
  border-radius: var(--border-radius-md);
  border: none;
  background: var(--color-primary);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-top: 8px;
  transition: background-color var(--transition-duration) var(--transition-easing);
}
.primary-btn:hover {
  background: var(--color-primary-hover);
}
.primary-btn:active {
  transform: scale(0.98);
}
</style>
