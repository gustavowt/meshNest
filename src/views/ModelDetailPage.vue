<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ detail?.description?.shortName ?? detail?.file.filename ?? $t('detail.model') }}</ion-title>
        <ion-buttons slot="end">
          <indexing-status-badge v-if="detail" :status="detail.file.status" class="header-badge" />
          <ion-button :disabled="reindexing || !detail" @click="openSlicer">
            <ion-icon slot="start" :icon="openOutline" />
            {{ $t('detail.openSlicer') }}
          </ion-button>
          <ion-spinner v-if="reindexing || aiRenaming" name="crescent" class="reindex-spinner header-spinner" />
          <ion-button
            :disabled="reindexing || aiRenaming || !detail"
            id="model-actions-trigger"
            :aria-label="$t('detail.actions')"
          >
            <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-popover v-if="detail" trigger="model-actions-trigger" dismiss-on-select="true">
        <ion-list>
          <ion-item button :detail="false" @click="revealInFolder">
            <ion-icon slot="start" :icon="folderOutline" />
            <ion-label>{{ $t('detail.reveal') }}</ion-label>
          </ion-item>
          <ion-item button :detail="false" :disabled="!aiRenameEnabled" @click="renameWithAi">
            <ion-icon slot="start" :icon="sparklesOutline" />
            <ion-label>{{ $t('detail.renameWithAi') }}</ion-label>
          </ion-item>
          <ion-item button :detail="false" :disabled="reindexing" @click="reindex">
            <ion-icon slot="start" :icon="refreshOutline" />
            <ion-label>{{ $t('detail.reindex') }}</ion-label>
          </ion-item>
          <ion-item button :detail="false" lines="none" @click="confirmDelete">
            <ion-icon slot="start" :icon="trashOutline" color="danger" />
            <ion-label color="danger">{{ $t('detail.delete') }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-popover>
      <!-- Loading state -->
      <div v-if="loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>{{ $t('detail.loadingModel') }}</p>
      </div>

      <!-- Error / not found state -->
      <div v-else-if="error || !detail" class="state-container">
        <ion-icon :icon="alertCircleOutline" class="state-icon" />
        <p>{{ error ?? $t('common.modelNotFound') }}</p>
        <ion-button fill="outline" router-link="/library">{{ $t('common.backToLibrary') }}</ion-button>
      </div>

      <div v-else class="detail-layout">
        <div class="preview-column">
          <model-preview3-d
            :file-path="detail.file.absolutePath"
            :extension="detail.file.extension"
            class="preview"
          />

          <section v-if="detail.renderAssets.length > 0" class="gallery-section">
            <h2>{{ $t('detail.renderViews') }}</h2>
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
  IonPopover,
  IonList,
  IonItem,
  IonLabel,
  alertController,
  toastController,
} from '@ionic/vue'
import {
  alertCircleOutline,
  folderOutline,
  refreshOutline,
  openOutline,
  ellipsisVerticalOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IndexingStatusBadge from '@/components/library/IndexingStatusBadge.vue'
import ModelMetadataPanel from '@/components/model/ModelMetadataPanel.vue'
import ModelPreview3D from '@/components/model/ModelPreview3D.vue'
import ModelRenderGallery from '@/components/model/ModelRenderGallery.vue'
import { indexModelFile } from '@/services/indexing/indexModelFile'
import { createDesktopIndexingDeps } from '@/services/indexing/desktopIndexingDeps'
import { useIndexingStore } from '@/stores/indexingStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { useSearchStore } from '@/stores/searchStore'
import type { ModelDetail } from '@/types/modelDetail'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const indexing = useIndexingStore()
const search = useSearchStore()

const detail = ref<ModelDetail | null>(null)
const providerSettings = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const reindexing = ref(false)
const aiRenaming = ref(false)

const AI_VISION_PROVIDERS = ['openai', 'gemini', 'ollama']

/** Rename with AI requires a real vision provider (not 'none' or 'mock'). */
const aiRenameEnabled = computed(() =>
  AI_VISION_PROVIDERS.includes(providerSettings.value?.vision?.provider),
)

async function loadDetail(modelFileId: string): Promise<void> {
  if (!window.meshNest) {
    error.value = t('common.desktopOnly')
    return
  }
  loading.value = true
  error.value = null
  try {
    detail.value = await window.meshNest.getModelDetail(modelFileId)
    providerSettings.value = await window.meshNest.getProviderSettings()
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    loading.value = false
  }
}

async function openSlicer(): Promise<void> {
  if (!detail.value || !window.meshNest) return
  try {
    await window.meshNest.openWithSlicer(detail.value.file.absolutePath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await showToast(msg)
  }
}

async function showToast(message: string): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 5000,
    color: 'danger',
    buttons: [
      {
        text: t('common.close'),
        role: 'cancel',
      },
    ],
  })
  await toast.present()
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

async function showSuccessToast(message: string): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color: 'success',
  })
  await toast.present()
}

function buildRenameContext(): string | undefined {
  const description = detail.value?.description
  const file = detail.value?.file
  const parts = [
    file ? `Current filename: ${file.filename}` : undefined,
    file ? `Format: ${file.extension.toUpperCase()}` : undefined,
    description?.shortName ? `Current AI short name: ${description.shortName}` : undefined,
    description?.likelyCategory ? `Likely category: ${description.likelyCategory}` : undefined,
    description?.description ? `Description: ${description.description}` : undefined,
    description?.printUse ? `Print use: ${description.printUse}` : undefined,
    description?.style ? `Style: ${description.style}` : undefined,
    description?.tags.length ? `Tags: ${description.tags.slice(0, 8).join(', ')}` : undefined,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' — ') : undefined
}

async function renameWithAi(): Promise<void> {
  if (!window.meshNest || !detail.value || !aiRenameEnabled.value || aiRenaming.value) return

  const file = detail.value.file
  let suggested: string
  aiRenaming.value = true
  try {
    suggested = await window.meshNest.normalizeName(file.filename, buildRenameContext())
  } catch (normalizeError) {
    await showToast(normalizeError instanceof Error ? normalizeError.message : String(normalizeError))
    return
  } finally {
    aiRenaming.value = false
  }

  const alert = await alertController.create({
    header: t('detail.renamePromptHeader'),
    message: t('detail.renamePromptMessage'),
    inputs: [
      {
        name: 'name',
        type: 'text',
        value: suggested,
        placeholder: t('detail.renamePlaceholder'),
      },
    ],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('detail.rename'), role: 'confirm' },
    ],
  })
  await alert.present()

  const result = await alert.onDidDismiss()
  if (result.role !== 'confirm') return
  const newName = (result.data?.values?.name ?? '').trim()
  if (!newName) return

  try {
    const previousAbsolutePath = file.absolutePath
    const updated = await window.meshNest.renameModel(file.id, newName)
    indexing.syncRenamedModel(previousAbsolutePath, updated)
    library.patchEntry(updated.id, {
      absolutePath: updated.absolutePath,
      relativePath: updated.relativePath,
      filename: updated.filename,
      shortName: updated.filename.replace(/\.[^.]+$/, ''),
    })
    search.patchResultPaths(updated.id, {
      absolutePath: updated.absolutePath,
      filename: updated.filename,
    })
    await loadDetail(file.id)
    await library.loadLibrary()
    await showSuccessToast(t('detail.renamed'))
  } catch (renameError) {
    await showToast(renameError instanceof Error ? renameError.message : String(renameError))
  }
}

async function confirmDelete(): Promise<void> {
  if (!window.meshNest || !detail.value) return

  const file = detail.value.file
  const name = detail.value.description?.shortName ?? file.filename

  const alert = await alertController.create({
    header: t('detail.deleteConfirmHeader'),
    message: t('detail.deleteConfirmMessage', { name }),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('detail.delete'), role: 'confirm' },
    ],
  })
  await alert.present()

  const result = await alert.onDidDismiss()
  if (result.role !== 'confirm') return

  try {
    await window.meshNest.deleteModel(file.id)
    await library.loadLibrary()
    await showSuccessToast(t('detail.deleted'))
    router.replace('/library')
  } catch (deleteError) {
    await showToast(deleteError instanceof Error ? deleteError.message : String(deleteError))
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

.header-spinner {
  align-self: center;
  margin-inline: 4px 0;
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
  border-radius: 20px;
  overflow: hidden;
  background: var(--card-glass-bg);
  border: var(--card-glass-border);
  box-shadow: var(--card-glass-shadow);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
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
