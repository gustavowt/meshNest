<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ $t('worldSearch.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="world-search-shell">
        <section class="search-workbench">
          <div class="workbench-copy">
            <p class="workbench-kicker">{{ $t('worldSearch.heroKicker') }}</p>
            <h1>{{ $t('worldSearch.heroTitle') }}</h1>
            <p>{{ $t('worldSearch.heroDesc') }}</p>
          </div>

          <div class="search-panel">
            <div class="searchbar-frame">
              <model-search-bar v-model="query" class="hero-search-bar" @search="submit" />
              <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden-input"
                @change="onImageSelected"
              />
              <div class="inline-image-action">
                <ion-button
                  class="image-search-button"
                  fill="clear"
                  size="small"
                  :disabled="worldSearch.state.analyzingImage || !imageSearchAvailable"
                  :title="imageSearchAvailable ? $t('worldSearch.searchByImage') : $t('worldSearch.imageSearchRequiresVision')"
                  @click="pickImage"
                >
                  <ion-spinner v-if="worldSearch.state.analyzingImage" name="crescent" class="btn-spinner" />
                  <ion-icon v-else :icon="imageOutline" />
                </ion-button>
              </div>
            </div>

            <p v-if="!imageSearchAvailable" class="image-provider-note">
              {{ $t('worldSearch.imageSearchRequiresVision') }}
              <router-link to="/settings">{{ $t('worldSearch.configureVisionProvider') }}</router-link>
            </p>

            <div v-if="worldSearch.state.imagePreviewUrl" class="image-context-chip">
              <img :src="worldSearch.state.imagePreviewUrl" alt="" class="image-preview" />
              <div class="derived-query">
                <p>{{ $t('worldSearch.derivedQuery') }}</p>
                <strong>{{ worldSearch.state.imageDerivedQuery?.query ?? query }}</strong>
              </div>
              <div
                v-if="worldSearch.state.imageDerivedQuery?.tags.length"
                class="derived-tags"
              >
                <ion-chip
                  v-for="tag in worldSearch.state.imageDerivedQuery.tags.slice(0, 3)"
                  :key="tag"
                  outline
                >
                  {{ tag }}
                </ion-chip>
              </div>
              <ion-button
                class="clear-image-button"
                fill="clear"
                size="small"
                color="medium"
                :title="$t('worldSearch.clearImage')"
                @click="clearImage"
              >
                <ion-icon :icon="closeCircleOutline" />
              </ion-button>
            </div>
          </div>
        </section>

      <div v-if="worldSearch.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>{{ $t('worldSearch.searching') }}</p>
      </div>

      <div v-else-if="worldSearch.state.error" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon error" />
        <p>{{ worldSearch.state.error }}</p>
      </div>

      <div v-else-if="worldSearch.state.searched && worldSearch.state.results.length === 0" class="state-container">
        <ion-icon :icon="globeOutline" class="state-icon" />
        <h2>{{ $t('worldSearch.noMatchesTitle') }}</h2>
        <p>{{ $t('worldSearch.noMatchesDesc', { query: worldSearch.state.query }) }}</p>
        <div v-if="worldSearch.state.providerErrors.length > 0" class="provider-error-panel">
          <strong>{{ $t('worldSearch.providerErrorsTitle') }}</strong>
          <ul>
            <li v-for="error in worldSearch.state.providerErrors" :key="error.providerId">
              <span>{{ providerLabel(error.providerId) }}:</span> {{ error.message }}
            </li>
          </ul>
        </div>
      </div>

      <div v-else-if="worldSearch.state.results.length > 0" class="results-section">
        <div v-if="worldSearch.state.providerErrors.length > 0" class="provider-errors">
          <strong>{{ $t('worldSearch.partialErrors', { count: worldSearch.state.providerErrors.length }) }}</strong>
          <ul>
            <li v-for="error in worldSearch.state.providerErrors" :key="error.providerId">
              <span>{{ providerLabel(error.providerId) }}:</span> {{ error.message }}
            </li>
          </ul>
        </div>
        <div class="results-grid">
          <world-search-result-card
            v-for="result in worldSearch.state.results"
            :key="result.id"
            :result="result"
            @open="openResult"
          />
        </div>
      </div>

      <div v-else class="state-container">
        <ion-icon :icon="globeOutline" class="state-icon" />
        <h2>{{ $t('worldSearch.initialTitle') }}</h2>
        <p>{{ $t('worldSearch.initialDesc') }}</p>
        <div class="examples">
          <ion-chip v-for="example in EXAMPLE_QUERIES" :key="example" outline @click="useExample(example)">
            {{ example }}
          </ion-chip>
        </div>
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
  onIonViewWillEnter,
} from '@ionic/vue'
import { alertCircleOutline, closeCircleOutline, globeOutline, imageOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import type { DeepReadonly } from 'vue'
import ModelSearchBar from '@/components/search/ModelSearchBar.vue'
import WorldSearchResultCard from '@/components/world-search/WorldSearchResultCard.vue'
import { DEFAULT_PROVIDER_SETTINGS, isRealVisionProviderId } from '@/services/settings/providerSettings'
import { loadCachedProviderSettings } from '@/services/settings/providerSettingsCache'
import { WORLD_SEARCH_PROVIDERS } from '@/services/world-search/providerMetadata'
import { useWorldSearchStore } from '@/stores/worldSearchStore'
import type { VisionProviderId } from '@/types/providerSettings'
import type { WorldSearchProviderId } from '@/types/worldSearch'
import type { WorldSearchResult } from '@/types/worldSearch'

const EXAMPLE_QUERIES = [
  'articulated dragon',
  'gridfinity bin',
  'phone stand',
  'benchy boat',
]

const worldSearch = useWorldSearchStore()
const query = ref(worldSearch.state.query)
const fileInputRef = ref<HTMLInputElement | null>(null)
const activeVisionProvider = ref<VisionProviderId>(DEFAULT_PROVIDER_SETTINGS.vision.provider)
const imageSearchAvailable = computed(() => isRealVisionProviderId(activeVisionProvider.value))

function refreshVisionProvider(): void {
  activeVisionProvider.value =
    loadCachedProviderSettings()?.vision.provider ?? DEFAULT_PROVIDER_SETTINGS.vision.provider
}

function submit(value: string): void {
  worldSearch.runSearch(value)
}

function useExample(example: string): void {
  query.value = example
  worldSearch.runSearch(example)
}

function pickImage(): void {
  if (!imageSearchAvailable.value) {
    return
  }
  fileInputRef.value?.click()
}

async function onImageSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  await worldSearch.searchFromImage(file)
  if (worldSearch.state.imageDerivedQuery) {
    query.value = worldSearch.state.imageDerivedQuery.query
  }
}

function clearImage(): void {
  worldSearch.clearImageSearch()
}

async function openResult(result: DeepReadonly<WorldSearchResult>): Promise<void> {
  await worldSearch.openResult(result)
}

function providerLabel(providerId: WorldSearchProviderId): string {
  return WORLD_SEARCH_PROVIDERS[providerId].label
}

onIonViewWillEnter(() => {
  refreshVisionProvider()
})
</script>

<style scoped>
.world-search-shell {
  min-height: 100%;
  padding: 18px;
  background: linear-gradient(180deg, rgba(79, 70, 229, 0.08), transparent 260px);
}

.search-workbench {
  width: min(1120px, 100%);
  margin: 0 auto 14px;
}

.workbench-copy {
  padding: 8px 4px 14px;
}

.workbench-kicker {
  margin: 0 0 6px;
  color: var(--ion-color-primary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workbench-copy h1 {
  margin: 0;
  color: var(--ion-text-color);
  font-size: clamp(1.65rem, 2.6vw, 2.45rem);
  font-weight: 800;
  letter-spacing: -0.04em;
}

.workbench-copy p:not(.workbench-kicker) {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--ion-color-medium);
  font-size: 1rem;
  line-height: 1.55;
}

.search-panel {
  padding: 16px;
  border: 1px solid rgba(127, 140, 159, 0.22);
  border-radius: 28px;
  background: rgba(var(--ion-background-color-rgb), 0.92);
  box-shadow: 0 16px 34px rgba(12, 22, 48, 0.12);
}

.searchbar-frame {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  padding: 4px 8px 4px 0;
  border-radius: 20px;
  background: rgba(127, 140, 159, 0.12);
}

.hero-search-bar {
  --background: transparent;
  --border-radius: 18px;
  --box-shadow: none;
  --color: var(--ion-text-color);
  --placeholder-color: var(--ion-color-medium);
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
}

.inline-image-action {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.image-search-button {
  --background: rgba(var(--ion-color-primary-rgb), 0.1);
  --background-hover: rgba(var(--ion-color-primary-rgb), 0.16);
  --color: var(--ion-color-primary);
  --border-radius: 999px;
  --box-shadow: none;
  width: 40px;
  height: 40px;
  margin: 0;
}

.image-search-button ion-icon {
  font-size: 20px;
}

.image-provider-note {
  margin: 0;
  padding: 10px 2px 0;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  line-height: 1.45;
}

.image-provider-note a {
  margin-left: 4px;
  color: var(--ion-color-primary);
  font-weight: 700;
  text-decoration: none;
}

.image-provider-note a:hover {
  text-decoration: underline;
}

.hidden-input {
  display: none;
}

.btn-spinner {
  width: 18px;
  height: 18px;
}

.image-context-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  margin-top: 10px;
  padding: 8px 8px 8px 10px;
  border: 1px solid rgba(127, 140, 159, 0.18);
  border-radius: 999px;
  background: rgba(127, 140, 159, 0.08);
}

.image-preview {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  object-fit: cover;
  border: 1px solid rgba(127, 140, 159, 0.24);
  border-radius: 999px;
}

.derived-query {
  min-width: 0;
}

.derived-query p {
  margin: 0 0 2px;
  color: var(--ion-color-medium);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.derived-query strong {
  display: block;
  color: var(--ion-text-color);
  max-width: 260px;
  overflow: hidden;
  font-size: 0.9rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.derived-tags {
  display: flex;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
}

.derived-tags ion-chip {
  --background: rgba(56, 128, 255, 0.12);
  height: 24px;
  margin: 0;
  font-size: 0.72rem;
}

.clear-image-button {
  --padding-start: 4px;
  --padding-end: 4px;
  width: 28px;
  height: 28px;
  min-height: 28px;
  margin: 0;
}

.results-section {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 2px 0 20px;
}

.provider-errors,
.provider-error-panel {
  width: min(100%, 720px);
  margin: 0 0 12px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.32);
  border-radius: 14px;
  background: rgba(var(--ion-color-warning-rgb), 0.08);
  color: var(--ion-color-warning-shade);
  font-size: 0.9rem;
}

.provider-errors ul,
.provider-error-panel ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.provider-errors li + li,
.provider-error-panel li + li {
  margin-top: 4px;
}

.provider-errors span,
.provider-error-panel span {
  font-weight: 700;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: min(780px, 100%);
  min-height: 28vh;
  margin: 0 auto;
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

.examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.examples ion-chip {
  cursor: pointer;
}

@media (max-width: 700px) {
  .world-search-shell {
    padding: 12px;
  }

  .search-panel {
    border-radius: 22px;
    padding: 12px;
  }

  .searchbar-frame {
    padding-right: 6px;
  }

  .image-context-chip {
    border-radius: 18px;
  }

  .derived-tags {
    display: none;
  }
}
</style>
