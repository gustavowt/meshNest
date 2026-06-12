<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Library</ion-title>
        <ion-buttons slot="end">
          <ion-select
            v-if="library.state.entries.length > 0"
            :value="library.state.sortKey"
            interface="popover"
            aria-label="Sort models"
            class="sort-select"
            @ion-change="library.setSortKey($event.detail.value)"
          >
            <ion-select-option value="filename">Name</ion-select-option>
            <ion-select-option value="modifiedAt">Date modified</ion-select-option>
            <ion-select-option value="indexedAt">Date indexed</ion-select-option>
          </ion-select>
          <ion-button :disabled="indexing.state.running" @click="selectAndIndex">
            <ion-icon slot="start" :icon="folderOpenOutline" />
            Index folder
          </ion-button>
          <ion-button router-link="/search" aria-label="Search models">
            <ion-icon slot="icon-only" :icon="searchOutline" />
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
            <span v-else>Scanning {{ indexing.state.directory }}…</span>
            <ion-button size="small" fill="clear" color="medium" @click="indexing.cancelIndexing()">
              Cancel
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
          Retry {{ indexing.failedCount() }} failed
        </ion-button>
      </div>

      <ion-text v-if="indexing.state.error" color="danger">
        <p class="state-message">{{ indexing.state.error }}</p>
      </ion-text>

      <!-- Loading state -->
      <div v-if="library.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>Loading library…</p>
      </div>

      <!-- Error state -->
      <div v-else-if="library.state.error" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon error" />
        <p>{{ library.state.error }}</p>
        <ion-button fill="outline" @click="library.loadLibrary()">Try again</ion-button>
      </div>

      <!-- Empty state -->
      <div v-else-if="library.state.loaded && library.state.entries.length === 0" class="state-container">
        <ion-icon :icon="cubeOutline" class="state-icon" />
        <h2>Your library is empty</h2>
        <p>Select a folder with STL or 3MF files to scan and index your 3D models.</p>
        <ion-button :disabled="indexing.state.running" @click="selectAndIndex">
          <ion-icon slot="start" :icon="folderOpenOutline" />
          Index a folder
        </ion-button>
      </div>

      <!-- Library grid -->
      <model-grid v-else :entries="library.sortedEntries.value" @select="openDetail" />
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
import { alertCircleOutline, cubeOutline, folderOpenOutline, searchOutline } from 'ionicons/icons'
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import ModelGrid from '@/components/library/ModelGrid.vue'
import { useIndexingStore } from '@/stores/indexingStore'
import { useLibraryStore } from '@/stores/libraryStore'
import type { LibraryEntry } from '@/types/library'

const router = useRouter()
const library = useLibraryStore()
const indexing = useIndexingStore()

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
  const parts = [`${summary.indexed} indexed`]
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`)
  if (summary.failed > 0) parts.push(`${summary.failed} failed`)
  if (summary.pending > 0) parts.push(`${summary.pending} not processed`)
  return `${summary.cancelled ? 'Indexing cancelled: ' : 'Indexing finished: '}${parts.join(', ')}`
})

async function selectAndIndex(): Promise<void> {
  if (!window.meshNest) {
    return
  }
  const directory = await window.meshNest.pickDirectory()
  if (!directory) {
    return
  }
  await indexing.runIndexing(directory)
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

onMounted(() => {
  if (!library.state.loaded) {
    library.loadLibrary()
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
</style>
