<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ $t('common.search') }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <model-search-bar v-model="query" @search="submit" />
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- Loading -->
      <div v-if="search.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>{{ $t('search.searching') }}</p>
      </div>

      <!-- Nothing indexed yet -->
      <div v-else-if="search.state.embeddingCount === 0" class="state-container">
        <ion-icon :icon="cubeOutline" class="state-icon" />
        <h2>{{ $t('search.nothingIndexedTitle') }}</h2>
        <p>{{ $t('search.nothingIndexedDesc') }}</p>
        <ion-button fill="outline" router-link="/library">{{ $t('search.goToLibrary') }}</ion-button>
      </div>

      <!-- Search error -->
      <div v-else-if="search.state.error" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon error" />
        <p>{{ search.state.error }}</p>
      </div>

      <!-- No results -->
      <div v-else-if="search.state.searched && search.state.results.length === 0" class="state-container">
        <ion-icon :icon="searchOutline" class="state-icon" />
        <h2>{{ $t('search.noMatchesTitle') }}</h2>
        <p>{{ $t('search.noMatchesDesc', { query: search.state.query }) }}</p>
      </div>

      <!-- Results -->
      <div v-else-if="search.state.results.length > 0" class="results-grid">
        <search-result-card
          v-for="result in search.state.results"
          :key="result.modelFileId"
          :result="result"
          @select="openDetail"
        />
      </div>

      <!-- Empty / initial state with example queries -->
      <div v-else class="state-container">
        <ion-icon :icon="searchOutline" class="state-icon" />
        <h2>{{ $t('search.searchModelsTitle') }}</h2>
        <p>{{ $t('search.searchModelsDesc') }}</p>
        <div class="examples">
          <ion-chip v-for="example in EXAMPLE_QUERIES" :key="example" outline @click="useExample(example)">
            {{ example }}
          </ion-chip>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, cubeOutline, searchOutline } from 'ionicons/icons'
import { onMounted, ref } from 'vue'
import type { DeepReadonly } from 'vue'
import { useRouter } from 'vue-router'
import ModelSearchBar from '@/components/search/ModelSearchBar.vue'
import SearchResultCard from '@/components/search/SearchResultCard.vue'
import { useSearchStore } from '@/stores/searchStore'
import type { SearchResult } from '@/types/search'

const EXAMPLE_QUERIES = [
  'dragon phone stand',
  'storage box with lid',
  'cute animal figurine',
  'wall mount hook',
]

const router = useRouter()
const search = useSearchStore()
const query = ref(search.state.query)

function submit(value: string): void {
  search.runSearch(value)
}

function useExample(example: string): void {
  query.value = example
  search.runSearch(example)
}

function openDetail(result: DeepReadonly<SearchResult>): void {
  router.push({ name: 'ModelDetail', params: { id: result.modelFileId } })
}

onMounted(() => {
  search.refreshIndexStatus()
})
</script>

<style scoped>
.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 50vh;
  padding: 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.state-icon {
  font-size: 64px;
}

.state-icon.error {
  color: var(--ion-color-danger);
}

.state-container h2 {
  margin: 0;
  color: var(--ion-text-color);
}

.state-container p {
  max-width: 400px;
  margin: 0;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.examples ion-chip {
  cursor: pointer;
}
</style>
