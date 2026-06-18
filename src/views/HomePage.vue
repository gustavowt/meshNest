<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>{{ $t('common.meshNest') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="scan-container">
        <ion-button :disabled="scanning" @click="selectAndScan">
          {{ $t('home.selectDir') }}
        </ion-button>
        <ion-button v-if="scanning" fill="outline" color="medium" @click="cancelScan">
          {{ $t('common.cancel') }}
        </ion-button>

        <ion-text v-if="error" color="danger">
          <p>{{ error }}</p>
        </ion-text>

        <ion-text v-if="selectedDirectory">
          <p class="directory">{{ selectedDirectory }}</p>
        </ion-text>

        <ion-text v-if="scanning">
          <p>{{ $t('home.scanning', { count: progressCount }) }}</p>
          <p class="current-path">{{ progressPath }}</p>
        </ion-text>

        <template v-if="!scanning && files.length > 0">
          <ion-text>
            <p>{{ $t('home.filesFound', { count: files.length }) }}</p>
          </ion-text>
          <ion-list>
            <ion-item v-for="file in files" :key="file.absolutePath" button @click="previewFile = file">
              <ion-label>
                <h3>{{ file.filename }}</h3>
                <p>{{ file.relativePath }} · {{ formatSize(file.sizeBytes) }} · {{ file.extension }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <ion-text v-if="!scanning && scanned && files.length === 0">
          <p>{{ $t('home.noFiles') }}</p>
        </ion-text>
      </div>

      <ion-modal :is-open="previewFile !== null" @did-dismiss="previewFile = null">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ previewFile?.filename }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="previewFile = null">{{ $t('common.close') }}</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <model-preview3-d
            v-if="previewFile"
            :file-path="previewFile.absolutePath"
            :extension="previewFile.extension"
            class="preview-modal-body"
          />
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ModelPreview3D from '@/components/model/ModelPreview3D.vue'
import type { ScannedFile } from '@/types/modelFile'

const { t } = useI18n()

const selectedDirectory = ref<string | null>(null)
const scanning = ref(false)
const scanned = ref(false)
const files = ref<ScannedFile[]>([])
const error = ref<string | null>(null)
const progressCount = ref(0)
const progressPath = ref('')
const previewFile = ref<ScannedFile | null>(null)

let currentScanId: string | null = null
let unsubscribeProgress: (() => void) | null = null

async function selectAndScan(): Promise<void> {
  error.value = null

  if (!window.meshNest) {
    error.value = t('common.desktopOnly')
    return
  }

  const directory = await window.meshNest.pickDirectory()
  if (!directory) {
    return
  }

  selectedDirectory.value = directory
  scanning.value = true
  scanned.value = false
  files.value = []
  progressCount.value = 0
  progressPath.value = ''
  currentScanId = `scan-${Date.now()}`

  unsubscribeProgress = window.meshNest.onScanProgress((event) => {
    if (event.scanId !== currentScanId) {
      return
    }
    progressCount.value = event.scannedCount
    progressPath.value = event.currentPath
  })

  try {
    files.value = await window.meshNest.scanDirectory(directory, currentScanId)
    scanned.value = true
  } catch (scanError) {
    error.value = scanError instanceof Error ? scanError.message : String(scanError)
  } finally {
    scanning.value = false
    unsubscribeProgress?.()
    unsubscribeProgress = null
    currentScanId = null
  }
}

async function cancelScan(): Promise<void> {
  if (window.meshNest && currentScanId) {
    await window.meshNest.cancelScan(currentScanId)
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onUnmounted(() => {
  unsubscribeProgress?.()
})
</script>

<style scoped>
.scan-container {
  padding: 16px;
}

.directory {
  font-family: monospace;
  word-break: break-all;
}

.current-path {
  font-size: 12px;
  color: var(--ion-color-medium);
  word-break: break-all;
}

.preview-modal-body {
  height: 100%;
}
</style>
