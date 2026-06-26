<template>
  <ion-card button class="result-card" @click="emit('open', result)">
    <div class="thumbnail">
      <img v-if="result.thumbnailUrl" :src="result.thumbnailUrl" :alt="result.title" />
      <ion-icon v-else :icon="cubeOutline" class="placeholder-icon" aria-hidden="true" />
      <span class="provider-badge">{{ providerLabel }}</span>
    </div>

    <ion-card-header class="card-header">
      <ion-card-title class="card-title">{{ result.title }}</ion-card-title>
      <ion-card-subtitle v-if="result.creatorName" class="card-subtitle">{{ result.creatorName }}</ion-card-subtitle>
    </ion-card-header>

    <ion-card-content class="card-content">
      <div class="meta-row">
        <ion-chip v-if="primaryFormat" outline class="chip">{{ primaryFormat }}</ion-chip>
        <ion-chip v-if="result.priceLabel" color="tertiary" outline class="chip">{{ result.priceLabel }}</ion-chip>
        <ion-chip v-if="result.license" outline class="chip">{{ result.license }}</ion-chip>
      </div>
      <p v-if="result.description" class="description">{{ result.description }}</p>
      <p class="open-hint">{{ $t('worldSearch.openOnSource') }}</p>
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
import { WORLD_SEARCH_PROVIDERS } from '@/services/world-search/providerMetadata'
import type { WorldSearchResult } from '@/types/worldSearch'

const props = defineProps<{
  result: DeepReadonly<WorldSearchResult>
}>()

const emit = defineEmits<{
  open: [result: DeepReadonly<WorldSearchResult>]
}>()

const providerLabel = computed(() => WORLD_SEARCH_PROVIDERS[props.result.providerId].label)
const primaryFormat = computed(() => props.result.formats?.[0]?.toUpperCase())
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

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
}

.placeholder-icon {
  font-size: 56px;
  color: var(--ion-color-medium);
}

.provider-badge {
  position: absolute;
  top: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
}

.provider-badge {
  left: 8px;
}

.card-header {
  padding-bottom: 0;
}

.card-title {
  font-size: 1rem;
}

.card-subtitle {
  font-size: 0.82rem;
}

.card-content {
  padding-top: 8px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.chip {
  margin: 0;
  height: 24px;
  font-size: 11px;
}

.description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.open-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ion-color-primary);
}
</style>
