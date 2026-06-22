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
  background: #f1f2f4;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--card-glass-shadow);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: transform 0.3s ease, border-color 0.3s ease;
}

.gallery-image:hover {
  transform: translateY(-2px);
  border-color: rgba(94, 114, 228, 0.3);
}

@media (prefers-color-scheme: dark) {
  .gallery-image {
    background: #f1f2f4;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  .gallery-image:hover {
    border-color: rgba(121, 141, 246, 0.3);
  }
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
