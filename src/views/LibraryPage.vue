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
          <ion-button
            id="library-actions-trigger"
            :disabled="bulkRenaming"
            :aria-label="$t('library.actions')"
          >
            <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
          </ion-button>
        </ion-buttons>
        <ion-progress-bar
          v-if="indexing.state.running"
          class="header-progress-bar"
          :type="indexing.state.progress ? 'determinate' : 'indeterminate'"
          :value="progressFraction"
        />
      </ion-toolbar>

      <div v-if="indexing.state.running" class="indexing-floating-badge">
        <div class="indexing-info">
          <div class="indexing-copy">
            <span v-if="indexing.state.progress" class="indexing-title">
              {{ indexing.state.progress.processed }} / {{ indexing.state.progress.total }}
            </span>
            <span v-else class="indexing-title">
              {{ $t('library.indexing', { dir: indexing.state.directory }) }}
            </span>
            <span v-if="currentFileName" class="current-file">{{ currentFileName }}</span>
          </div>
          <div v-if="indexing.state.progress" class="indexing-stats" aria-live="polite">
            <span class="indexing-stat success">
              {{ $t('library.indexingSuccessful', { count: indexingSuccessfulCount }) }}
            </span>
            <span v-if="indexingErrorCount > 0" class="indexing-stat error">
              {{ $t('library.indexingErrors', { count: indexingErrorCount }) }}
            </span>
          </div>
          <ion-button
            class="indexing-cancel-btn"
            size="small"
            fill="clear"
            color="medium"
            @click="indexing.cancelIndexing()"
          >
            {{ $t('library.indexingCancel') }}
          </ion-button>
        </div>
      </div>

      <ion-toolbar v-if="bulkRenameProgress.phase !== 'idle'" class="indexing-toolbar">
        <div class="indexing-bar">
          <div class="indexing-panel">
            <div class="indexing-info">
              <div class="indexing-copy">
                <span v-if="bulkRenameProgress.phase === 'applying'" class="indexing-title">
                  {{ bulkRenameProgress.processed }} / {{ bulkRenameProgress.total }}
                </span>
                <span v-else class="indexing-title">
                  {{ $t('library.bulkRenameSuggesting')
                  }}<template v-if="bulkRenameProgress.total > 0">
                    {{ bulkRenameProgress.processed }} / {{ bulkRenameProgress.total }}</template>
                </span>
                <span v-if="currentBulkRenameFileName" class="current-file">{{ currentBulkRenameFileName }}</span>
              </div>
              <ion-button
                v-if="bulkRenameCanCancel"
                class="indexing-cancel-btn"
                size="small"
                fill="clear"
                color="medium"
                @click="cancelBulkRename"
              >
                {{ $t('library.indexingCancel') }}
              </ion-button>
            </div>
            <ion-progress-bar
              class="indexing-progress"
              :type="bulkRenameProgress.total > 0 ? 'determinate' : 'indeterminate'"
              :value="bulkRenameProgressFraction"
            />
            <div v-if="bulkRenameProgress.phase === 'applying'" class="indexing-stats" aria-live="polite">
              <span class="indexing-stat success">
                {{ $t('library.bulkRenameRenamed', { count: bulkRenameProgress.renamed }) }}
              </span>
              <span class="indexing-stat error">
                {{ $t('library.bulkRenameFailed', { count: bulkRenameProgress.failed }) }}
              </span>
            </div>
          </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-popover trigger="library-actions-trigger" dismiss-on-select="true">
        <ion-list>
          <ion-item
            button
            :detail="false"
            :disabled="!bulkRenameEnabled"
            :title="bulkRenameActionTitle"
            @click="startBulkRename"
          >
            <ion-icon slot="start" :icon="sparklesOutline" />
            <ion-label>{{ $t('library.massRename') }}</ion-label>
          </ion-item>
          <ion-item
            button
            :detail="false"
            :disabled="!forceReindexEnabled"
            :title="forceReindexActionTitle"
            @click="forceReindexLibrary"
          >
            <ion-icon slot="start" :icon="refreshOutline" />
            <ion-label>{{ $t('library.forceReindex') }}</ion-label>
          </ion-item>
          <ion-item button :detail="false" router-link="/world-search" lines="none">
            <ion-icon slot="start" :icon="globeOutline" />
            <ion-label>{{ $t('worldSearch.title') }}</ion-label>
          </ion-item>
          <ion-item button :detail="false" router-link="/settings" lines="none">
            <ion-icon slot="start" :icon="settingsOutline" />
            <ion-label>{{ $t('common.settings') }}</ion-label>
          </ion-item>
        </ion-list>
      </ion-popover>

      <ion-modal
        :is-open="bulkRenameModeModalOpen"
        css-class="bulk-rename-mode-modal"
        @didDismiss="resolveBulkRenameModeModal"
      >
        <div class="bulk-rename-mode-card">
          <h2>{{ $t('library.bulkRenameChooseHeader') }}</h2>
          <p>{{ $t('library.bulkRenameChooseMessage', { count: bulkRenameCandidates.length }) }}</p>
          <div class="bulk-rename-mode-actions">
            <ion-button
              expand="block"
              fill="solid"
              class="bulk-rename-mode-primary"
              @click="selectBulkRenameMode('review')"
            >
              {{ $t('library.bulkRenameReview') }}
            </ion-button>
            <ion-button
              expand="block"
              fill="outline"
              class="bulk-rename-mode-secondary"
              @click="selectBulkRenameMode('apply')"
            >
              {{ $t('library.bulkRenameApplyDirectly') }}
            </ion-button>
            <ion-button
              expand="block"
              fill="clear"
              class="bulk-rename-mode-cancel"
              @click="selectBulkRenameMode(null)"
            >
              {{ $t('common.cancel') }}
            </ion-button>
          </div>
        </div>
      </ion-modal>

      <!-- Run summary -->
      <div
        v-if="runMessage && runSummaryVisible"
        class="inline-alert run-summary"
        :class="indexing.state.summary?.failed ? 'run-summary-warning' : 'run-summary-success'"
        role="alert"
      >
        <ion-icon
          :icon="indexing.state.summary?.failed ? alertCircleOutline : checkmarkCircleOutline"
          class="inline-alert-icon"
          aria-hidden="true"
        />
        <p>{{ runMessage }}</p>
      </div>

      <div v-if="indexing.state.error" class="inline-alert indexing-error" role="alert">
        <ion-icon :icon="alertCircleOutline" class="inline-alert-icon" aria-hidden="true" />
        <p>{{ indexing.state.error }}</p>
      </div>

      <!-- Loading state -->
      <div v-if="(library.state.loading || settings.state.loading) && !library.state.loaded" class="state-container">
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
      <div v-else-if="!settings.state.draft?.libraryFolder && library.state.entries.length === 0" class="state-container">
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
        <p>{{ $t('library.noModelsDesc', { folder: settings.state.draft?.libraryFolder }) }}</p>
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
          <ion-button
            v-if="failedLibraryCount > 0 && !indexing.state.running"
            class="hero-rescan-failed-btn"
            size="small"
            fill="clear"
            @click="retryFailedModels"
          >
            <ion-icon slot="start" :icon="refreshOutline" />
            {{ $t('library.rescanFailed', { count: failedLibraryCount }) }}
          </ion-button>
          <div class="hero-content">
            <img class="hero-logo" src="/meshNest_logo_name.png" :alt="$t('common.meshNest')" />
            <p class="hero-subtitle">{{ $t('library.heroSubtitle') }}</p>
            <div class="hero-search-container">
              <div class="hero-search-frame">
                <model-search-bar v-model="searchQuery" @search="handleSearch" class="hero-search-bar" />
                <ion-button
                  router-link="/world-search"
                  fill="clear"
                  size="small"
                  class="hero-world-search-button"
                  :aria-label="$t('worldSearch.title')"
                  :title="$t('worldSearch.title')"
                >
                  <ion-icon slot="icon-only" :icon="globeOutline" />
                </ion-button>
              </div>
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
          <model-grid v-else :entries="displayedEntries" @select="openDetail" @open-default="openDefaultProgram" />
        </div>

        <!-- Normal library grid -->
        <model-grid v-else :entries="library.sortedEntries.value" @select="openDetail" @open-default="openDefaultProgram" />
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
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonPopover,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  alertController,
  toastController,
} from '@ionic/vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  cubeOutline,
  ellipsisVerticalOutline,
  folderOutline,
  globeOutline,
  refreshOutline,
  searchOutline,
  settingsOutline,
  sparklesOutline,
} from 'ionicons/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ModelGrid from '@/components/library/ModelGrid.vue'
import ModelSearchBar from '@/components/search/ModelSearchBar.vue'
import { useIndexingStore } from '@/stores/indexingStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { useSearchStore } from '@/stores/searchStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { LibraryEntry } from '@/types/library'
import type { NameNormalizationInput } from '@/services/llm/visionProvider'
import { BULK_RENAME_BATCH_SIZE } from '@/services/llm/httpVisionProvider'

const { t } = useI18n()
const router = useRouter()
const library = useLibraryStore()
const indexing = useIndexingStore()
const search = useSearchStore()
const settings = useSettingsStore()
let activeDirectoryWatchId: string | null = null
let unsubscribeDirectoryWatchEvents: (() => void) | null = null
const RUN_SUMMARY_DISMISS_MS = 5000
const unsubscribeFileProcessed = indexing.onFileProcessed(() => {
  // Batch indexing silently reloads when indexing.state.running becomes false.
})
const unsubscribeWatchedFileIndexed = indexing.onWatchedFileIndexed((result) => {
  if (result.modelFileId) {
    library.pinEntryFirst(result.modelFileId)
  }
})

const searchQuery = ref(search.state.query)
const bulkRenaming = ref(false)
const bulkRenameModeModalOpen = ref(false)
const bulkRenameSelectedMode = ref<BulkRenameMode | null>(null)
const runSummaryVisible = ref(false)
let runSummaryDismissTimeout: ReturnType<typeof setTimeout> | null = null

type BulkRenameMode = 'review' | 'apply'
type BulkRenamePhase = 'idle' | 'suggesting' | 'applying'
type BulkRenameSuggestion = {
  entry: LibraryEntry
  normalizedName: string
}

const bulkRenameProgress = reactive({
  phase: 'idle' as BulkRenamePhase,
  total: 0,
  processed: 0,
  renamed: 0,
  failed: 0,
  currentFile: '',
})
const bulkRenameCancelRequested = ref(false)
let bulkRenameModeResolver: ((mode: BulkRenameMode | null) => void) | null = null

const AI_VISION_PROVIDERS = ['openai', 'gemini', 'ollama']

const searchEntries = computed<LibraryEntry[]>(() => {
  return search.state.results
    .filter((r) => r.score > 0.50)
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

const bulkRenameCandidates = computed<LibraryEntry[]>(() => library.sortedEntries.value)

const activeVisionProvider = computed(() => settings.state.draft?.vision?.provider ?? 'none')

const bulkRenameHasAiProvider = computed(() =>
  AI_VISION_PROVIDERS.includes(activeVisionProvider.value),
)

const bulkRenameEnabled = computed(() =>
  Boolean(
    window.meshNest &&
      bulkRenameCandidates.value.length > 0 &&
      !indexing.state.running &&
      !bulkRenaming.value &&
      !bulkRenameModeModalOpen.value &&
      bulkRenameHasAiProvider.value,
  ),
)

const bulkRenameActionTitle = computed(() => {
  if (!bulkRenameHasAiProvider.value) {
    return t('library.bulkRenameRequiresProvider')
  }
  if (bulkRenameCandidates.value.length === 0) {
    return t('library.bulkRenameRequiresModels')
  }
  if (indexing.state.running || bulkRenaming.value || bulkRenameModeModalOpen.value) {
    return t('library.bulkRenameBusy')
  }
  return t('library.massRename')
})

const bulkRenameProgressFraction = computed(() =>
  bulkRenameProgress.total > 0 ? bulkRenameProgress.processed / bulkRenameProgress.total : 0,
)

const bulkRenameCanCancel = computed(
  () => bulkRenameProgress.phase === 'applying' || bulkRenameProgress.phase === 'suggesting',
)

const currentBulkRenameFileName = computed(() => {
  const currentFile = bulkRenameProgress.currentFile
  if (!currentFile) {
    return ''
  }
  return currentFile.split(/[\\/]/).pop() ?? currentFile
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

async function openDefaultProgram(entry: LibraryEntry): Promise<void> {
  if (!window.meshNest) {
    await showErrorToast(t('common.desktopOnly'))
    return
  }
  try {
    await window.meshNest.openWithSlicer(entry.absolutePath)
  } catch (error) {
    await showErrorToast(error instanceof Error ? error.message : String(error))
  }
}

async function showErrorToast(message: string): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 6000,
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

async function showSuccessToast(message: string): Promise<void> {
  const toast = await toastController.create({
    message,
    duration: 3000,
    color: 'success',
  })
  await toast.present()
}

function resetBulkRenameProgress(): void {
  bulkRenaming.value = false
  bulkRenameProgress.phase = 'idle'
  bulkRenameProgress.total = 0
  bulkRenameProgress.processed = 0
  bulkRenameProgress.renamed = 0
  bulkRenameProgress.failed = 0
  bulkRenameProgress.currentFile = ''
  bulkRenameCancelRequested.value = false
}

function startBulkRenameSuggesting(total: number): void {
  bulkRenaming.value = true
  bulkRenameCancelRequested.value = false
  bulkRenameProgress.phase = 'suggesting'
  bulkRenameProgress.total = total
  bulkRenameProgress.processed = 0
  bulkRenameProgress.renamed = 0
  bulkRenameProgress.failed = 0
  bulkRenameProgress.currentFile = ''
}

function startBulkRenameApplying(total: number): void {
  bulkRenaming.value = true
  bulkRenameCancelRequested.value = false
  bulkRenameProgress.phase = 'applying'
  bulkRenameProgress.total = total
  bulkRenameProgress.processed = 0
  bulkRenameProgress.renamed = 0
  bulkRenameProgress.failed = 0
  bulkRenameProgress.currentFile = ''
}

function cancelBulkRename(): void {
  bulkRenameCancelRequested.value = true
}

async function yieldForProgressPaint(): Promise<void> {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function chooseBulkRenameMode(count: number): Promise<BulkRenameMode | null> {
  if (count === 0) {
    return null
  }
  bulkRenameSelectedMode.value = null
  bulkRenameModeModalOpen.value = true
  return new Promise((resolve) => {
    bulkRenameModeResolver = resolve
  })
}

function selectBulkRenameMode(mode: BulkRenameMode | null): void {
  bulkRenameSelectedMode.value = mode
  bulkRenameModeModalOpen.value = false
}

function resolveBulkRenameModeModal(): void {
  if (!bulkRenameModeResolver) {
    return
  }
  const resolve = bulkRenameModeResolver
  bulkRenameModeResolver = null
  const selectedMode = bulkRenameSelectedMode.value
  bulkRenameSelectedMode.value = null
  resolve(selectedMode)
}

function formatContextSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'unknown'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function buildBulkRenameContext(entry: LibraryEntry): string {
  const parts = [
    `Relative path: ${entry.relativePath}`,
    `Format: ${entry.extension.toUpperCase()}`,
    `Status: ${entry.status}`,
    `Size: ${formatContextSize(entry.sizeBytes)}`,
  ]
  if (entry.shortName?.trim()) {
    parts.push(`Current AI short name: ${entry.shortName.trim()}`)
  }
  if (entry.likelyCategory?.trim()) {
    parts.push(`Likely category: ${entry.likelyCategory.trim()}`)
  }
  if (entry.tags.length > 0) {
    parts.push(`Tags: ${entry.tags.slice(0, 8).join(', ')}`)
  }
  return parts.join('\n')
}

async function startBulkRename(): Promise<void> {
  if (!window.meshNest || !bulkRenameEnabled.value) {
    return
  }
  const candidates = bulkRenameCandidates.value
  const mode = await chooseBulkRenameMode(candidates.length)
  if (!mode) {
    return
  }

  const request: NameNormalizationInput[] = candidates.map((entry) => ({
    id: entry.id,
    rawName: entry.filename,
    context: buildBulkRenameContext(entry),
  }))

  startBulkRenameSuggesting(request.length)
  await yieldForProgressPaint()
  const suggestions: BulkRenameSuggestion[] = []
  try {
    const visionSettings = settings.state.draft?.vision
      ? JSON.parse(JSON.stringify(settings.state.draft.vision))
      : undefined
    const entriesById = new Map(candidates.map((entry) => [entry.id, entry]))
    // Send the names in small batches so local models stay reliable and the
    // header progress bar advances as each batch is suggested.
    for (let start = 0; start < request.length; start += BULK_RENAME_BATCH_SIZE) {
      if (bulkRenameCancelRequested.value) {
        break
      }
      const batch = request.slice(start, start + BULK_RENAME_BATCH_SIZE)
      bulkRenameProgress.currentFile = entriesById.get(batch[0]?.id ?? '')?.filename ?? ''
      const results = await window.meshNest.normalizeNames(batch, visionSettings)
      for (const result of results) {
        const entry = entriesById.get(result.id)
        if (entry) {
          suggestions.push({ entry, normalizedName: result.normalizedName })
        }
      }
      bulkRenameProgress.processed = Math.min(start + batch.length, request.length)
      await yieldForProgressPaint()
    }
  } catch (renameError) {
    await showErrorToast(renameError instanceof Error ? renameError.message : String(renameError))
    resetBulkRenameProgress()
    return
  } finally {
    if (bulkRenameProgress.phase === 'suggesting') {
      bulkRenaming.value = false
      bulkRenameProgress.phase = 'idle'
    }
  }

  if (bulkRenameCancelRequested.value) {
    resetBulkRenameProgress()
    return
  }

  if (suggestions.length === 0) {
    await showErrorToast(t('library.bulkRenameNoSuggestions'))
    resetBulkRenameProgress()
    return
  }

  if (mode === 'review') {
    await reviewBulkRenameSuggestions(suggestions)
    return
  }
  await applyBulkRenameSuggestions(suggestions)
}

async function reviewBulkRenameSuggestions(suggestions: BulkRenameSuggestion[]): Promise<void> {
  const alert = await alertController.create({
    header: t('library.bulkRenameReviewHeader'),
    message: t('library.bulkRenameReviewMessage', { count: suggestions.length }),
    inputs: suggestions.map((suggestion, index) => ({
      name: `name${index}`,
      type: 'text',
      value: suggestion.normalizedName,
      placeholder: suggestion.entry.filename,
    })),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('library.bulkRenameApplyReviewed'), role: 'confirm' },
    ],
  })
  await alert.present()
  const result = await alert.onDidDismiss()
  if (result.role !== 'confirm') {
    return
  }
  const values = result.data?.values ?? {}
  await applyBulkRenameSuggestions(
    suggestions.map((suggestion, index) => ({
      entry: suggestion.entry,
      normalizedName: String(values[`name${index}`] ?? '').trim(),
    })),
  )
}

async function applyBulkRenameSuggestions(suggestions: BulkRenameSuggestion[]): Promise<void> {
  if (!window.meshNest || suggestions.length === 0) {
    return
  }

  startBulkRenameApplying(suggestions.length)
  await yieldForProgressPaint()
  let renamed = 0
  const failures: string[] = []
  try {
    for (const suggestion of suggestions) {
      if (bulkRenameCancelRequested.value) {
        break
      }
      bulkRenameProgress.currentFile = suggestion.entry.filename
      const newName = suggestion.normalizedName.trim()
      if (!newName) {
        bulkRenameProgress.processed += 1
        continue
      }
      try {
        const previousAbsolutePath = suggestion.entry.absolutePath
        const updated = await window.meshNest.renameModel(suggestion.entry.id, newName)
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
        renamed += 1
        bulkRenameProgress.renamed = renamed
      } catch (renameError) {
        const reason = renameError instanceof Error ? renameError.message : String(renameError)
        failures.push(`${suggestion.entry.filename}: ${reason}`)
        bulkRenameProgress.failed = failures.length
      } finally {
        bulkRenameProgress.processed += 1
      }
    }
    await library.loadLibrary()
    const cancelled = bulkRenameCancelRequested.value
    if (failures.length > 0) {
      await showErrorToast(
        t('library.bulkRenamePartial', {
          renamed,
          failed: failures.length,
          error: failures[0],
        }),
      )
      return
    }
    if (cancelled) {
      await showSuccessToast(t('library.bulkRenameCancelled', { count: renamed }))
      return
    }
    await showSuccessToast(t('library.bulkRenameComplete', { count: renamed }))
  } finally {
    resetBulkRenameProgress()
  }
}

const failedLibraryCount = computed(
  () => library.state.entries.filter((entry) => entry.status === 'failed').length,
)

const progressFraction = computed(() => {
  const progress = indexing.state.progress
  return progress && progress.total > 0 ? progress.processed / progress.total : 0
})

const indexingSuccessfulCount = computed(() => {
  const progress = indexing.state.progress
  return progress ? progress.indexed + progress.skipped : 0
})

const indexingErrorCount = computed(() => indexing.state.progress?.failed ?? 0)

const currentFileName = computed(() => {
  const currentFile = indexing.state.progress?.currentFile
  if (!currentFile) {
    return ''
  }
  return currentFile.split(/[\\/]/).pop() ?? currentFile
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

function clearRunSummaryDismissTimeout(): void {
  if (runSummaryDismissTimeout) {
    clearTimeout(runSummaryDismissTimeout)
    runSummaryDismissTimeout = null
  }
}

watch(runMessage, (message) => {
  clearRunSummaryDismissTimeout()
  runSummaryVisible.value = Boolean(message)
  if (message) {
    runSummaryDismissTimeout = setTimeout(() => {
      runSummaryVisible.value = false
      runSummaryDismissTimeout = null
    }, RUN_SUMMARY_DISMISS_MS)
  }
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

async function retryFailedModels(): Promise<void> {
  const failed = library.state.entries.filter((entry) => entry.status === 'failed')
  if (failed.length > 0) {
    await indexing.retryFailedLibrary(failed, settings.state.draft?.libraryFolder)
    await library.loadLibrary()
    return
  }
  await indexing.retryFailed()
}

async function rescanCurrentFolder(): Promise<void> {
  const directory = settings.state.draft?.libraryFolder
  if (directory) {
    await indexing.runIndexing(directory)
  }
}

async function stopLibraryWatcher(): Promise<void> {
  unsubscribeDirectoryWatchEvents?.()
  unsubscribeDirectoryWatchEvents = null
  const watchId = activeDirectoryWatchId
  activeDirectoryWatchId = null
  if (watchId && window.meshNest) {
    try {
      await window.meshNest.stopDirectoryWatch(watchId)
    } catch {
      // The window may already be closing; the main process cleans up by WebContents.
    }
  }
}

async function restartLibraryWatcher(directory?: string | null): Promise<void> {
  await stopLibraryWatcher()
  if (!directory || !window.meshNest) {
    return
  }

  const watchId = crypto.randomUUID()
  activeDirectoryWatchId = watchId
  unsubscribeDirectoryWatchEvents = window.meshNest.onDirectoryWatchEvent((event) => {
    if (event.watchId === activeDirectoryWatchId) {
      indexing.queueWatchedFile(event)
    }
  })

  try {
    await window.meshNest.startDirectoryWatch(directory, watchId)
    if (activeDirectoryWatchId !== watchId) {
      await window.meshNest.stopDirectoryWatch(watchId)
    }
  } catch (error) {
    if (activeDirectoryWatchId === watchId) {
      unsubscribeDirectoryWatchEvents?.()
      unsubscribeDirectoryWatchEvents = null
      activeDirectoryWatchId = null
    }
    await showErrorToast(error instanceof Error ? error.message : String(error))
  }
}

const forceReindexEnabled = computed(() =>
  Boolean(
    window.meshNest &&
      settings.state.draft?.libraryFolder &&
      library.state.entries.length > 0 &&
      !indexing.state.running &&
      !bulkRenaming.value,
  ),
)

const forceReindexActionTitle = computed(() => {
  if (!settings.state.draft?.libraryFolder) {
    return t('library.forceReindexRequiresFolder')
  }
  if (library.state.entries.length === 0) {
    return t('library.forceReindexRequiresModels')
  }
  if (indexing.state.running || bulkRenaming.value) {
    return t('library.forceReindexBusy')
  }
  return t('library.forceReindex')
})

async function forceReindexLibrary(): Promise<void> {
  const directory = settings.state.draft?.libraryFolder
  if (!directory || indexing.state.running || bulkRenaming.value) {
    return
  }
  const alert = await alertController.create({
    header: t('library.forceReindexConfirmHeader'),
    message: t('library.forceReindexConfirmMessage', { count: library.state.entries.length }),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('library.forceReindexConfirm'), role: 'confirm' },
    ],
  })
  await alert.present()
  const result = await alert.onDidDismiss()
  if (result.role !== 'confirm') {
    return
  }
  await indexing.runIndexing(directory, { force: true })
}

// Refresh the library whenever an indexing run finishes.
watch(
  () => indexing.state.running,
  (running, wasRunning) => {
    if (wasRunning && !running) {
      void library.loadLibrary({ silent: true })
    }
  },
)

watch(
  () => settings.state.draft?.libraryFolder,
  (directory) => {
    void restartLibraryWatcher(directory)
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
  clearRunSummaryDismissTimeout()
  unsubscribeFileProcessed()
  unsubscribeWatchedFileIndexed()
  void stopLibraryWatcher()
})

onMounted(async () => {
  void library.loadLibrary({ silent: library.state.loaded })
  search.refreshIndexStatus()
  if (!settings.state.draft) {
    await settings.loadSettings()
  }
  await restartLibraryWatcher(settings.state.draft?.libraryFolder)
})
</script>

<style scoped>
.sort-select {
  margin-inline-end: 8px;
  font-size: 14px;
}

:global(.bulk-rename-mode-modal) {
  --width: min(440px, calc(100vw - 32px));
  --height: auto;
  --border-radius: 18px;
}

.bulk-rename-mode-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  color: var(--ion-text-color);
  background: var(--ion-background-color);
}

.bulk-rename-mode-card h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.25;
}

.bulk-rename-mode-card p {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 14px;
  line-height: 1.4;
}

.bulk-rename-mode-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bulk-rename-mode-primary,
.bulk-rename-mode-secondary,
.bulk-rename-mode-cancel {
  margin: 0;
  text-transform: none;
  font-weight: 600;
}

.bulk-rename-mode-secondary {
  --border-color: rgba(var(--ion-color-primary-rgb), 0.45);
  --color: var(--ion-color-primary);
}

.bulk-rename-mode-cancel {
  --color: var(--ion-color-medium);
}

@media (prefers-color-scheme: dark) {
  :global(.bulk-rename-mode-modal) {
    --background: #0f172a;
    --box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
  }

  .bulk-rename-mode-card {
    color: rgba(255, 255, 255, 0.92);
    background: #0f172a;
  }

  .bulk-rename-mode-card p {
    color: rgba(255, 255, 255, 0.72);
  }

  .bulk-rename-mode-secondary {
    --border-color: rgba(129, 140, 248, 0.5);
    --color: rgba(255, 255, 255, 0.9);
  }

  .bulk-rename-mode-cancel {
    --color: rgba(255, 255, 255, 0.68);
  }
}

.header-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 10;
}

.indexing-floating-badge {
  position: absolute;
  top: 100%;
  right: 16px;
  margin-top: 8px;
  z-index: 1000;
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--ion-toolbar-background, var(--ion-background-color));
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.18);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: auto;
  max-width: min(500px, calc(100vw - 32px));
}

.indexing-toolbar {
  --min-height: auto;
  --padding-top: 0;
  --padding-bottom: 0;
  --background: var(--ion-toolbar-background, var(--ion-background-color));
  border-top: 1px solid rgba(var(--ion-color-primary-rgb), 0.1);
}

.indexing-bar {
  padding: 8px 14px 12px;
}

.indexing-panel {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.14);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(var(--ion-color-primary-rgb), 0.08),
    rgba(var(--ion-color-primary-rgb), 0.03)
  );
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.indexing-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.indexing-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.indexing-title {
  color: var(--ion-text-color);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}

.current-file {
  overflow: hidden;
  color: var(--ion-color-medium);
  font-size: 12px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indexing-cancel-btn {
  flex: 0 0 auto;
  margin: -4px -4px -4px 8px;
  font-weight: 600;
  text-transform: none;
  --padding-start: 10px;
  --padding-end: 10px;
}

.indexing-progress {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  --background: rgba(var(--ion-color-primary-rgb), 0.16);
  --progress-background: var(--ion-color-primary);
}

.indexing-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.indexing-stat {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.indexing-stat.success {
  color: var(--ion-color-success-shade);
  background: rgba(var(--ion-color-success-rgb), 0.11);
}

.indexing-stat.error {
  color: var(--ion-color-danger-shade);
  background: rgba(var(--ion-color-danger-rgb), 0.1);
}

.inline-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 16px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.35;
}

.indexing-error {
  color: var(--ion-color-danger-shade);
  border: 1px solid rgba(var(--ion-color-danger-rgb), 0.18);
  background: rgba(var(--ion-color-danger-rgb), 0.08);
}

.run-summary-success {
  color: var(--ion-color-success-shade);
  border: 1px solid rgba(var(--ion-color-success-rgb), 0.18);
  background: rgba(var(--ion-color-success-rgb), 0.1);
}

.run-summary-warning {
  color: var(--ion-color-warning-shade);
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.22);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.inline-alert-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 18px;
}

.inline-alert p {
  min-width: 0;
  margin: 0;
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

.hero-logo {
  display: block;
  width: auto;
  height: 96px;
  max-width: 100%;
  margin: 0 auto 20px;
  object-fit: contain;
}

@media (max-width: 600px) {
  .hero-logo {
    height: 64px;
  }

  .hero-search-container {
    max-width: 100%;
  }

  .hero-search-frame {
    min-height: 54px;
    border-radius: 24px;
    padding-right: 7px;
  }

  .hero-world-search-button {
    width: 38px;
    height: 38px;
    min-height: 38px;
  }
}

.hero-subtitle {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 28px;
  font-weight: 400;
  letter-spacing: -0.1px;
}

.hero-rescan-failed-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  margin: 0;
  --color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  --padding-start: 6px;
  --padding-end: 8px;
  --padding-top: 2px;
  --padding-bottom: 2px;
}

.hero-rescan-failed-btn:hover,
.hero-rescan-failed-btn:focus {
  --color: rgba(255, 255, 255, 0.82);
}

.hero-rescan-failed-btn ion-icon {
  font-size: 13px;
  margin-inline-end: 4px;
  opacity: 0.8;
}

@media (max-width: 480px) {
  .hero-rescan-failed-btn {
    top: 8px;
    right: 6px;
    font-size: 11px;
  }
}

.hero-search-container {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.hero-search-frame {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 58px;
  padding: 4px 8px 4px 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.13);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.hero-search-frame:focus-within {
  border-color: rgba(199, 210, 254, 0.72);
  background: rgba(255, 255, 255, 0.17);
  box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.24), 0 20px 48px rgba(15, 23, 42, 0.28);
}

.hero-search-bar {
  --background: transparent !important;
  --box-shadow: none !important;
  --color: #ffffff !important;
  --placeholder-color: rgba(255, 255, 255, 0.62) !important;
  --placeholder-opacity: 1 !important;
  --icon-color: rgba(255, 255, 255, 0.68) !important;
  --clear-button-color: rgba(255, 255, 255, 0.68) !important;
  --border-radius: 24px !important;
  background: transparent !important;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
}

.hero-search-bar::part(container),
.hero-search-bar::part(input) {
  border: 0 !important;
  border-radius: 24px !important;
  box-shadow: none !important;
  background: transparent !important;
  background-color: transparent !important;
}

.hero-world-search-button {
  --background: rgba(255, 255, 255, 0.14);
  --background-hover: rgba(255, 255, 255, 0.22);
  --background-focused: rgba(255, 255, 255, 0.22);
  --color: #ffffff;
  --border-radius: 999px;
  --box-shadow: none;
  width: 40px;
  height: 40px;
  min-height: 40px;
  flex: 0 0 auto;
  margin: 0;
}

.hero-world-search-button ion-icon {
  font-size: 20px;
}
</style>
