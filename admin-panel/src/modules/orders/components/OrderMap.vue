<template>
  <section class="relative flex-1 bg-background">
    <div ref="mapContainerRef" class="absolute inset-0 z-0"></div>
    <div class="absolute right-4 top-4 z-20 flex flex-col gap-2 pointer-events-auto">
      <Button size="icon" variant="outline" @click="$emit('togglePolygons')">
        <Eye v-if="polygonsVisible" :size="16" />
        <EyeOff v-else :size="16" />
      </Button>
      <Button size="icon" variant="outline" @click="$emit('centerOnBranch')">
        <LocateFixed :size="16" />
      </Button>
    </div>
  </section>
</template>

<script setup>
import { ref } from "vue";
import { Eye, EyeOff, LocateFixed } from "lucide-vue-next";
import Button from "@/shared/components/ui/button/Button.vue";

defineProps({
  polygonsVisible: { type: Boolean, required: true },
});

defineEmits(["togglePolygons", "centerOnBranch"]);

const mapContainerRef = ref(null);

defineExpose({ mapContainerRef });
</script>
