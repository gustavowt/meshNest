<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ detail?.description?.shortName ?? detail?.file.filename ?? 'Model' }}</ion-title>
        <ion-buttons slot="end">
          <indexing-status-badge v-if="detail" :status="detail.file.status" class="header-badge" />
          <ion-button :disabled="reindexing || !detail" @click="revealInFolder">
            <ion-icon slot="start" :icon="folderOutline" />
            Reveal
          </ion-button>
          <ion-button :disabled="reindexing || !detail" @click="reindex">
            <ion-spinner v-if="reindexing" slot="start" name="crescent" class="reindex-spinner" />
            <ion-icon v-else slot="start" :icon="refreshOutline" />
            Reindex
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- Loading state -->
      <div v-if="loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>Loading model…</p>
      </div>

      <!-- Error / not found state -->
      <div v-else-if="error || !detail" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon" />
        <p>{{ error ?? 'Model not found.' }}</p>
        <ion-button fill="outline" router-link="/library">Back to library</ion-button>
      </div>

      <div v-else class="detail-layout">
        <div class="preview-column">
          <model-preview3-d
            :file-path="detail.file.absolutePath"
            :extension="detail.file.extension"
            class="preview"
          />

          <section v-if="detail.renderAssets.length > 0" class="gallery-section">
            <h2>Render views</h2>
            <model-render-gallery :assets="detail.renderAssets" />
          </section>
        </div>

        <model-metadata-panel :detail="detail" class="metadata-column" />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { alertCircleOutline, folderOutline, refreshOutline } from 'ionicons/icons'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import IndexingStatusBadge from '@/components/library/IndexingStatusBadge.vue'
import ModelMetadataPanel from '@/components/model/ModelMetadataPanel.vue'
import ModelPreview3D from '@/components/model/ModelPreview3D.vue'
import ModelRenderGallery from '@/components/model/ModelRenderGallery.vue'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import { createDesktopIndexingDeps } from '@/services/indexing/desktopIndexingDeps'
import { useLibraryStore } from '@/stores/libraryStore'
import type { ModelDetail } from '@/types/modelDetail'

const route = useRoute()
const library = useLibraryStore()

const detail = ref<ModelDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const reindexing = ref(false)

async function loadDetail(modelFileId: string): Promise<void> {
  if (!window.meshNest) {
    error.value = 'Model details are only available in the desktop app.'
    return
  }
  loading.value = true
  error.value = null
  try {
    detail.value = await window.meshNest.getModelDetail(modelFileId)
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    loading.value = false
  }
}

async function reindex(): Promise<void> {
  if (!window.meshNest || !detail.value || reindexing.value) {
    return
  }
  reindexing.value = true
  error.value = null
  try {
    const file = detail.value.file
    // Force reprocessing even when the file content is unchanged.
    await window.meshNest.resetToPending(file.id)
    const scanned = await window.meshNest.scanFile(file.absolutePath)
    await indexModelFile(scanned, file.projectId, await createDesktopIndexingDeps())
    await loadDetail(file.id)
    // Keep library cards (status, thumbnail, AI name) in sync.
    await library.loadLibrary()
  } catch (reindexError) {
    error.value = reindexError instanceof Error ? reindexError.message : String(reindexError)
  } finally {
    reindexing.value = false
  }
}

async function revealInFolder(): Promise<void> {
  if (window.meshNest && detail.value) {
    await window.meshNest.revealInFolder(detail.value.file.absolutePath)
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && route.name === 'ModelDetail') {
      loadDetail(id)
    }
  },
)

onMounted(() => {
  const id = route.params.id
  if (typeof id === 'string') {
    loadDetail(id)
  }
})
</script>

<style scoped>
.header-badge {
  margin-inline-end: 8px;
}

.reindex-spinner {
  width: 16px;
  height: 16px;
  margin-inline-end: 6px;
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
  color: var(--ion-color-danger);
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
  gap: 24px;
  padding: 16px;
}

@media (max-width: 860px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}

.preview-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.preview {
  height: 420px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--ion-color-light);
}

.gallery-section h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}

.metadata-column {
  min-width: 0;
}
</style>
