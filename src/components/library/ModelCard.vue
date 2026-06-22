<template>
  <ion-card button class="model-card" :class="{ failed: entry.status === 'failed' }" @click="emit('select', entry)">
    <div class="thumbnail">
      <img v-if="thumbnailUrl" :src="thumbnailUrl" :alt="entry.filename" />
      <ion-icon v-else :icon="cubeOutline" class="placeholder-icon" aria-hidden="true" />
      <span v-if="entry.score !== undefined" class="score-badge">
        {{ Math.round(entry.score * 100) }}%
      </span>
      <indexing-status-badge v-else :status="entry.status" class="card-status" />
    </div>

    <ion-card-header class="card-header">
      <ion-card-title class="card-title">{{ entry.shortName ?? entry.filename }}</ion-card-title>
      <ion-card-subtitle class="card-subtitle">{{ entry.filename }}</ion-card-subtitle>
    </ion-card-header>

    <ion-card-content class="card-content">
      <div v-if="entry.likelyCategory || visibleTags.length > 0" class="chips">
        <ion-chip v-if="entry.likelyCategory" color="primary" class="chip" outline>
          {{ entry.likelyCategory }}
        </ion-chip>
        <ion-chip v-for="tag in visibleTags" :key="tag" class="chip" outline>
          {{ tag }}
        </ion-chip>
        <span v-if="hiddenTagCount > 0" class="more-tags">+{{ hiddenTagCount }}</span>
      </div>

      <p v-if="entry.status === 'failed' && entry.errorMessage" class="error-message">
        {{ entry.errorMessage }}
      </p>

      <p class="file-meta">{{ formatSize(entry.sizeBytes) }} · {{ entry.extension.toUpperCase() }}</p>
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
import { useRenderAssetUrl } from '@/composables/useRenderAssetUrl'
import type { LibraryEntry } from '@/types/library'
import IndexingStatusBadge from './IndexingStatusBadge.vue'

const MAX_VISIBLE_TAGS = 3

const props = defineProps<{
  entry: LibraryEntry
}>()

const emit = defineEmits<{
  select: [entry: LibraryEntry]
}>()

const thumbnailUrl = useRenderAssetUrl(() => props.entry.thumbnailPath)

const visibleTags = computed(() => props.entry.tags.slice(0, MAX_VISIBLE_TAGS))
const hiddenTagCount = computed(() => Math.max(0, props.entry.tags.length - MAX_VISIBLE_TAGS))

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.model-card {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.model-card.failed {
  --background: rgba(var(--ion-color-danger-rgb), 0.04);
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

.model-card:hover .thumbnail img {
  transform: scale(1.06);
}

.placeholder-icon {
  font-size: 56px;
  color: var(--ion-color-medium);
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.model-card:hover .placeholder-icon {
  transform: scale(1.08) rotate(4deg);
}

.card-status,
.score-badge {
  position: absolute;
  top: 8px;
  right: 8px;
}

.score-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  z-index: 10;
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
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.chip {
  margin: 0;
  height: 22px;
  font-size: 11px;
}

.more-tags {
  font-size: 11px;
  color: var(--ion-color-medium);
}

.error-message {
  font-size: 12px;
  color: var(--ion-color-danger);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.file-meta {
  font-size: 12px;
  color: var(--ion-color-medium);
  margin: 0;
}
</style>
