<template>
  <div class="address-details">
    <div class="header">
      <button class="back-btn" @click="goBack">‹</button>
      <div class="title">Адрес доставки</div>
    </div>

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
  background: #f7f4f2;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #ffffff;
}

.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  border: none;
  background: #f2efed;
  font-size: 20px;
  cursor: pointer;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: #222222;
}

.content {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.label {
  font-size: 12px;
  color: #9a9a9a;
}

.input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #dedad7;
  background: #ffffff;
  font-size: 14px;
  color: #1f1f1f;
}

.input::placeholder {
  color: #8b8b8b;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #dedad7;
  background: #ffffff;
  font-size: 14px;
  resize: none;
  color: #1f1f1f;
}

.textarea::placeholder {
  color: #8b8b8b;
}

.primary-btn {
  width: 100%;
  padding: 14px;
  border-radius: 20px;
  border: none;
  background: #f7d000;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 8px;
}
</style>
