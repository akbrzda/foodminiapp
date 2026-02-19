<template>
  <section class="relative h-full min-h-[320px] flex-1 bg-background">
    <div ref="mapContainerRef" class="absolute inset-0 z-0"></div>
    <div class="pointer-events-auto absolute right-2 top-2 z-20 flex flex-col gap-2 sm:right-4 sm:top-4">
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
