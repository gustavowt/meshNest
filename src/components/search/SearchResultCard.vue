<template>
  <ion-card button class="result-card" @click="emit('select', result)">
    <div class="thumbnail">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="result.filename" />
      <ion-icon v-else :icon="cubeOutline" class="placeholder-icon" aria-hidden="true" />
      <span class="score" :title="`Cosine distance ${result.distance.toFixed(3)}`">
        {{ Math.round(result.score * 100) }}%
      </span>
    </div>

    <ion-card-header class="card-header">
      <ion-card-title class="card-title">{{ result.shortName ?? result.filename }}</ion-card-title>
      <ion-card-subtitle class="card-subtitle">{{ result.filename }}</ion-card-subtitle>
    </ion-card-header>

    <ion-card-content class="card-content">
      <div v-if="result.likelyCategory || visibleTags.length > 0" class="chips">
        <ion-chip v-if="result.likelyCategory" color="primary" outline class="chip">
          {{ result.likelyCategory }}
        </ion-chip>
        <ion-chip v-for="tag in visibleTags" :key="tag" outline class="chip">{{ tag }}</ion-chip>
      </div>
      <p v-if="result.description" class="description">{{ result.description }}</p>
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonIcon,
} from '@ionic/vue'
import { cubeOutline } from 'ionicons/icons'
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import { useRenderAssetUrl } from '@/composables/useRenderAssetUrl'
import type { SearchResult } from '@/types/search'

const MAX_VISIBLE_TAGS = 3

// DeepReadonly so results coming from the readonly store state bind directly.
const props = defineProps<{
  result: DeepReadonly<SearchResult>
}>()

const emit = defineEmits<{
  select: [result: DeepReadonly<SearchResult>]
}>()

const thumbnailUrl = useRenderAssetUrl(() => props.result.thumbnailPath)
const visibleTags = computed(() => props.result.tags.slice(0, MAX_VISIBLE_TAGS))
</script>

<style scoped>
.result-card {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.thumbnail {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f2f4;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  padding: 12px;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .thumbnail {
    background: #f1f2f4;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.result-card:hover .thumbnail img {
  transform: scale(1.06);
}

.placeholder-icon {
  font-size: 56px;
  color: var(--ion-color-medium);
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.result-card:hover .placeholder-icon {
  transform: scale(1.08) rotate(4deg);
}

.score {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}

.card-header {
  padding: 12px 12px 4px;
}

.card-title {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-subtitle {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-content {
  padding: 0 12px 12px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.chip {
  margin: 0;
  height: 22px;
  font-size: 11px;
}

.description {
  margin: 0;
  font-size: 13px;
  color: var(--ion-color-medium);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
