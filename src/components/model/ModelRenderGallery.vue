<template>
  <div v-if="views.length > 0" class="render-gallery">
    <figure v-for="asset in views" :key="asset.id" class="render-item">
      <gallery-image :path="asset.absolutePath" :alt="`${asset.viewName} view`" />
      <figcaption>{{ asset.viewName }}</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ModelRenderAsset } from '@/types/modelRender'
import GalleryImage from './GalleryImage.vue'

const props = defineProps<{
  assets: ModelRenderAsset[]
}>()

/** The thumbnail is a small duplicate of the perspective view; skip it. */
const views = computed(() => props.assets.filter((asset) => asset.viewName !== 'thumbnail'))
</script>

<style scoped>
.render-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.render-item {
  margin: 0;
  text-align: center;
}

.render-item figcaption {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ion-color-medium);
  text-transform: capitalize;
}
</style>
