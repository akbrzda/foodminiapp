<template>
  <div class="address-details">
    <PageHeader title="Адрес доставки" />

    <div class="content">
      <label class="label">улица, дом</label>
      <input v-model="address" class="input" placeholder="улица, дом" />

      <div class="grid">
        <input v-model="details.entrance" class="input" placeholder="Подъезд" />
        <input v-model="details.doorCode" class="input" placeholder="Код на двери" />
        <input v-model="details.floor" class="input" placeholder="Этаж" />
        <input v-model="details.apartment" class="input" placeholder="Квартира" />
      </div>

      <textarea v-model="details.comment" class="textarea" placeholder="Комментарий к адресу"></textarea>

      <button class="primary-btn" @click="save">Сохранить</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from "vue";
import PageHeader from "../components/PageHeader.vue";
import { useRouter } from "vue-router";
import { useLocationStore } from "../stores/location";
import { hapticFeedback } from "../services/telegram";

const router = useRouter();
const locationStore = useLocationStore();

const address = ref(locationStore.deliveryAddress || "");
const lastAddress = ref(address.value);
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

function save() {
  if (!address.value.trim()) {
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
  }
});
</script>

<style scoped>
.address-details {
  min-height: 100vh;
  background: var(--color-background-secondary);
}

.content {
  padding: 20px 16px;
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
