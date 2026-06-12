<template>
  <div class="gallery-image">
    <img v-if="url" :src="url" :alt="alt" />
    <ion-icon v-else :icon="imageOutline" class="placeholder" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { imageOutline } from 'ionicons/icons'
import { useRenderAssetUrl } from '@/composables/useRenderAssetUrl'

const props = defineProps<{
  path: string
  alt: string
}>()

const url = useRenderAssetUrl(() => props.path)
</script>

<style scoped>
.gallery-image {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.gallery-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  font-size: 32px;
  color: var(--ion-color-medium);
}
</style>
