<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ $t('common.library') }}</ion-title>
        <ion-buttons slot="end">
          <ion-select
            v-if="library.state.entries.length > 0"
            :value="library.state.sortKey"
            interface="popover"
            :aria-label="$t('library.sort')"
            class="sort-select"
            @ion-change="library.setSortKey($event.detail.value)"
          >
            <ion-select-option value="filename">{{ $t('library.sortOptions.name') }}</ion-select-option>
            <ion-select-option value="modifiedAt">{{ $t('library.sortOptions.modified') }}</ion-select-option>
            <ion-select-option value="indexedAt">{{ $t('library.sortOptions.indexed') }}</ion-select-option>
          </ion-select>
          <ion-button router-link="/settings" :aria-label="$t('common.settings')">
            <ion-icon slot="icon-only" :icon="settingsOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar v-if="indexing.state.running">
        <div class="indexing-bar">
          <ion-progress-bar
            :type="indexing.state.progress ? 'determinate' : 'indeterminate'"
            :value="progressFraction"
          />
          <div class="indexing-info">
            <span v-if="indexing.state.progress">
              {{ indexing.state.progress.processed }} / {{ indexing.state.progress.total }}
              <span v-if="indexing.state.progress.currentFile" class="current-file">
                · {{ indexing.state.progress.currentFile }}
              </span>
            </span>
            <span v-else>{{ $t('library.indexing', { dir: indexing.state.directory }) }}</span>
            <ion-button size="small" fill="clear" color="medium" @click="indexing.cancelIndexing()">
              {{ $t('library.indexingCancel') }}
            </ion-button>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- Run summary -->
      <div v-if="runMessage" class="run-summary">
        <ion-text :color="indexing.state.summary?.failed ? 'warning' : 'success'">
          <p>{{ runMessage }}</p>
        </ion-text>
        <ion-button
          v-if="indexing.failedCount() > 0 && !indexing.state.running"
          size="small"
          fill="outline"
          color="warning"
          @click="retryFailed"
        >
          {{ $t('library.retryFailed', { count: indexing.failedCount() }) }}
        </ion-button>
      </div>

      <ion-text v-if="indexing.state.error" color="danger">
        <p class="state-message">{{ indexing.state.error }}</p>
      </ion-text>

      <!-- Loading state -->
      <div v-if="library.state.loading || settings.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>{{ $t('library.loadingLibrary') }}</p>
      </div>

      <!-- Error state -->
      <div v-else-if="library.state.error" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon error" />
        <p>{{ library.state.error }}</p>
        <ion-button fill="outline" @click="library.loadLibrary()">{{ $t('common.tryAgain') }}</ion-button>
      </div>

      <!-- State A: No library folder selected yet -->
      <div v-else-if="!settings.state.draft?.libraryFolder" class="state-container">
        <ion-icon :icon="folderOutline" class="state-icon" />
        <h2>{{ $t('library.noFolderTitle') }}</h2>
        <p>{{ $t('library.noFolderDesc') }}</p>
        <ion-button :disabled="indexing.state.running" @click="selectAndIndex" fill="solid">
          <ion-icon slot="start" :icon="folderOutline" />
          {{ $t('library.selectFolderBtn') }}
        </ion-button>
      </div>

      <!-- State B: Folder selected, but library is empty -->
      <div v-else-if="library.state.loaded && library.state.entries.length === 0" class="state-container">
        <ion-icon :icon="cubeOutline" class="state-icon" />
        <h2>{{ $t('library.noModelsTitle') }}</h2>
        <p>{{ $t('library.noModelsDesc', { folder: settings.state.draft.libraryFolder }) }}</p>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <ion-button :disabled="indexing.state.running" fill="outline" @click="rescanCurrentFolder">
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ $t('library.rescan') }}
          </ion-button>
          <ion-button router-link="/settings" fill="clear">
            {{ $t('library.changeFolder') }}
          </ion-button>
        </div>
      </div>

      <!-- Main Library View with Hero Section -->
      <div v-else>
        <div class="hero-section">
          <div class="hero-content">
            <h1 class="hero-title">{{ $t('common.meshNest') }}</h1>
            <p class="hero-subtitle">{{ $t('library.heroSubtitle') }}</p>
            <div class="hero-search-container">
              <model-search-bar v-model="searchQuery" @search="handleSearch" class="hero-search-bar" />
            </div>
          </div>
        </div>

        <!-- Search results states (when searchQuery is active) -->
        <div v-if="searchQuery.trim().length > 0">
          <!-- Search Loading progress bar (non-blocking, keeps items on screen) -->
          <ion-progress-bar
            v-if="search.state.loading"
            type="indeterminate"
            style="margin-bottom: 8px;"
          />

          <!-- Search Error -->
          <div v-if="search.state.error" class="state-container">
            <ion-icon :icon="alertCircleOutline" class="state-icon error" />
            <p>{{ search.state.error }}</p>
          </div>

          <!-- No search results -->
          <div v-else-if="displayedEntries.length === 0 && !search.state.loading" class="state-container">
            <ion-icon :icon="searchOutline" class="state-icon" />
            <h2>{{ $t('library.noMatchesTitle') }}</h2>
            <p>{{ $t('library.noMatchesDesc', { query: searchQuery }) }}</p>
          </div>

          <!-- Render search results grid -->
          <model-grid v-else :entries="displayedEntries" @select="openDetail" />
        </div>

        <!-- Normal library grid -->
        <model-grid v-else :entries="library.sortedEntries.value" @select="openDetail" />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import {
  alertCircleOutline,
  cubeOutline,
  folderOutline,
  refreshOutline,
  searchOutline,
  settingsOutline,
} from 'ionicons/icons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ModelGrid from '@/components/library/ModelGrid.vue'
import ModelSearchBar from '@/components/search/ModelSearchBar.vue'
import { useIndexingStore } from '@/stores/indexingStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { useSearchStore } from '@/stores/searchStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { LibraryEntry } from '@/types/library'

const { t } = useI18n()
const router = useRouter()
const library = useLibraryStore()
const indexing = useIndexingStore()
const search = useSearchStore()
const settings = useSettingsStore()

const searchQuery = ref(search.state.query)

const searchEntries = computed<LibraryEntry[]>(() => {
  return search.state.results
    .filter((r) => r.score > 0.55)
    .map((r) => {
      const original = library.state.entries.find((e) => e.id === r.modelFileId)
      return {
        id: r.modelFileId,
        filename: r.filename,
        relativePath: original?.relativePath ?? '',
        absolutePath: r.absolutePath,
        extension: r.extension,
        sizeBytes: original?.sizeBytes ?? 0,
        modifiedAt: original?.modifiedAt ?? new Date().toISOString(),
        indexedAt: original?.indexedAt,
        status: original?.status ?? 'indexed',
        errorMessage: original?.errorMessage,
        shortName: r.shortName,
        likelyCategory: r.likelyCategory,
        tags: [...r.tags],
        thumbnailPath: r.thumbnailPath,
        score: r.score,
      }
    })
})

const displayedEntries = computed<LibraryEntry[]>(() => {
  const query = searchQuery.value.trim()
  if (!query) {
    return library.sortedEntries.value
  }
  return searchEntries.value
})

function handleSearch(val: string): void {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
  search.runSearch(val)
}

function openDetail(entry: LibraryEntry): void {
  router.push({ name: 'ModelDetail', params: { id: entry.id } })
}

const progressFraction = computed(() => {
  const progress = indexing.state.progress
  return progress && progress.total > 0 ? progress.processed / progress.total : 0
})

const runMessage = computed(() => {
  const summary = indexing.state.summary
  if (!summary || indexing.state.running) {
    return null
  }
  const parts = [t('library.parts.indexed', { count: summary.indexed })]
  if (summary.skipped > 0) {
    parts.push(t('library.parts.skipped', { count: summary.skipped }))
  }
  if (summary.failed > 0) {
    parts.push(t('library.parts.failed', { count: summary.failed }))
  }
  if (summary.pending > 0) {
    parts.push(t('library.parts.pending', { count: summary.pending }))
  }
  const key = summary.cancelled ? 'library.runCancelled' : 'library.runFinished'
  return t(key, { parts: parts.join(', ') })
})

async function selectAndIndex(): Promise<void> {
  if (!window.meshNest) {
    return
  }
  const directory = await window.meshNest.pickDirectory()
  if (!directory) {
    return
  }
  if (!settings.state.draft) {
    await settings.loadSettings()
  }
  if (settings.state.draft) {
    settings.state.draft.libraryFolder = directory
    await settings.saveSettings()
  }
  await indexing.runIndexing(directory)
}

async function rescanCurrentFolder(): Promise<void> {
  const directory = settings.state.draft?.libraryFolder
  if (directory) {
    await indexing.runIndexing(directory)
  }
}

async function retryFailed(): Promise<void> {
  await indexing.retryFailed()
}

// Refresh the library whenever an indexing run finishes.
watch(
  () => indexing.state.running,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      library.loadLibrary()
    }
  },
)

let searchTimeout: NodeJS.Timeout | null = null

watch(searchQuery, (newVal) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }
  const query = newVal.trim()
  if (query === '') {
    search.runSearch('')
  } else {
    searchTimeout = setTimeout(() => {
      search.runSearch(newVal)
    }, 300)
  }
})

onBeforeUnmount(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
})

onMounted(async () => {
  if (!library.state.loaded) {
    library.loadLibrary()
  }
  search.refreshIndexStatus()
  if (!settings.state.draft) {
    await settings.loadSettings()
  }
})
</script>

<style scoped>
.sort-select {
  margin-inline-end: 8px;
  font-size: 14px;
}

.indexing-bar {
  padding: 0 16px 8px;
}

.indexing-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--ion-color-medium);
  margin-top: 4px;
}

.current-file {
  word-break: break-all;
}

.run-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px 0;
}

.run-summary p {
  margin: 0;
  font-size: 14px;
}

.state-message {
  padding: 8px 16px 0;
  margin: 0;
  font-size: 14px;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 60vh;
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
  max-width: 360px;
  margin: 0;
}

.select-folder-header-btn {
  text-transform: none;
  font-weight: 500;
  --color: var(--ion-color-primary);
  font-size: 14px;
  white-space: nowrap;
}

.select-folder-btn {
  text-transform: none;
  font-weight: 500;
  margin-top: 8px;
}

.hero-section {
  padding: 56px 24px;
  background: radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 8px;
}

@media (prefers-color-scheme: light) {
  .hero-section {
    background: radial-gradient(circle at top, #4f46e5 0%, #312e81 100%);
  }
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 600px;
  width: 100%;
}

.hero-title {
  font-size: 38px;
  font-weight: 800;
  background: linear-gradient(135deg, #ffffff 10%, #c7d2fe 60%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0 0 10px;
  letter-spacing: -0.8px;
  font-family: 'Outfit', sans-serif;
}

.hero-subtitle {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 28px;
  font-weight: 400;
  letter-spacing: -0.1px;
}

.hero-search-container {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.hero-search-bar {
  --background: rgba(255, 255, 255, 0.09);
  --color: #ffffff;
  --placeholder-color: rgba(255, 255, 255, 0.55);
  --border-radius: 28px;
  --box-shadow: none;
  background: transparent;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 28px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.hero-search-bar:focus-within {
  border-color: rgba(129, 140, 248, 0.7);
  box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.25), 0 12px 40px 0 rgba(0, 0, 0, 0.3);
}
</style>
