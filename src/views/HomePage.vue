<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>meshNest</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="scan-container">
        <ion-button :disabled="scanning" @click="selectAndScan">
          Select directory to scan
        </ion-button>
        <ion-button v-if="scanning" fill="outline" color="medium" @click="cancelScan">
          Cancel
        </ion-button>

        <ion-text v-if="error" color="danger">
          <p>{{ error }}</p>
        </ion-text>

        <ion-text v-if="selectedDirectory">
          <p class="directory">{{ selectedDirectory }}</p>
        </ion-text>

        <ion-text v-if="scanning">
          <p>Scanning... {{ progressCount }} model file(s) found</p>
          <p class="current-path">{{ progressPath }}</p>
        </ion-text>

        <template v-if="!scanning && files.length > 0">
          <ion-text>
            <p>{{ files.length }} model file(s) found</p>
          </ion-text>
          <ion-list>
            <ion-item v-for="file in files" :key="file.absolutePath">
              <ion-label>
                <h3>{{ file.filename }}</h3>
                <p>{{ file.relativePath }} · {{ formatSize(file.sizeBytes) }} · {{ file.extension }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </template>

        <ion-text v-if="!scanning && scanned && files.length === 0">
          <p>No STL or 3MF files found in this directory.</p>
        </ion-text>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { onUnmounted, ref } from 'vue'
import type { ScannedFile } from '@/types/modelFile'

const selectedDirectory = ref<string | null>(null)
const scanning = ref(false)
const scanned = ref(false)
const files = ref<ScannedFile[]>([])
const error = ref<string | null>(null)
const progressCount = ref(0)
const progressPath = ref('')

let currentScanId: string | null = null
let unsubscribeProgress: (() => void) | null = null

async function selectAndScan(): Promise<void> {
  error.value = null

  if (!window.meshNest) {
    error.value = 'Desktop features are only available in the Electron app.'
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
</style>
