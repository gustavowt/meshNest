<template>
  <div class="metadata-panel">
    <!-- AI description -->
    <section v-if="detail.description" class="panel-section">
      <h2>AI description</h2>
      <p class="description">{{ detail.description.description }}</p>

      <div class="chips">
        <ion-chip color="primary" outline class="chip">{{ detail.description.likelyCategory }}</ion-chip>
        <ion-chip v-for="tag in detail.description.tags" :key="tag" outline class="chip">
          {{ tag }}
        </ion-chip>
      </div>

      <dl class="facts">
        <template v-if="detail.description.printUse">
          <dt>Print use</dt>
          <dd>{{ detail.description.printUse }}</dd>
        </template>
        <template v-if="detail.description.style">
          <dt>Style</dt>
          <dd>{{ detail.description.style }}</dd>
        </template>
        <dt>Confidence</dt>
        <dd>{{ Math.round(detail.description.confidence * 100) }}%</dd>
      </dl>

      <h3>Search phrases</h3>
      <ul class="search-phrases">
        <li v-for="phrase in detail.description.searchPhrases" :key="phrase">{{ phrase }}</li>
      </ul>
    </section>

    <!-- Indexing error -->
    <section v-if="detail.file.status === 'failed' && detail.file.errorMessage" class="panel-section">
      <h2>Indexing error</h2>
      <pre class="error-output">{{ detail.file.errorMessage }}</pre>
    </section>

    <!-- Geometry -->
    <section v-if="detail.geometry" class="panel-section">
      <h2>Geometry</h2>
      <dl class="facts">
        <template v-if="dimensions">
          <dt>Dimensions</dt>
          <dd>{{ dimensions }}</dd>
        </template>
        <template v-if="detail.geometry.triangleCount !== undefined">
          <dt>Triangles</dt>
          <dd>{{ detail.geometry.triangleCount.toLocaleString() }}</dd>
        </template>
        <template v-if="detail.geometry.vertexCount !== undefined">
          <dt>Vertices</dt>
          <dd>{{ detail.geometry.vertexCount.toLocaleString() }}</dd>
        </template>
        <template v-if="detail.geometry.meshCount !== undefined">
          <dt>Meshes</dt>
          <dd>{{ detail.geometry.meshCount }}</dd>
        </template>
        <template v-if="detail.geometry.objectCount !== undefined">
          <dt>Objects</dt>
          <dd>{{ detail.geometry.objectCount }}</dd>
        </template>
      </dl>
    </section>

    <!-- 3MF package metadata -->
    <section v-if="hasThreeMfContent" class="panel-section">
      <h2>3MF package</h2>
      <dl class="facts">
        <template v-if="detail.threeMf!.objectNames.length > 0">
          <dt>Objects</dt>
          <dd>{{ detail.threeMf!.objectNames.join(', ') }}</dd>
        </template>
        <template v-if="detail.threeMf!.materialNames.length > 0">
          <dt>Materials</dt>
          <dd>{{ detail.threeMf!.materialNames.join(', ') }}</dd>
        </template>
        <template v-if="detail.threeMf!.colorValues.length > 0">
          <dt>Colors</dt>
          <dd>{{ detail.threeMf!.colorValues.join(', ') }}</dd>
        </template>
        <dt>Embedded thumbnail</dt>
        <dd>{{ detail.threeMf!.hasThumbnail ? 'Yes' : 'No' }}</dd>
      </dl>
    </section>

    <!-- File info -->
    <section class="panel-section">
      <h2>File</h2>
      <dl class="facts">
        <dt>Filename</dt>
        <dd>{{ detail.file.filename }}</dd>
        <dt>Path</dt>
        <dd class="path">{{ detail.file.absolutePath }}</dd>
        <dt>Size</dt>
        <dd>{{ formatSize(detail.file.sizeBytes) }}</dd>
        <dt>Format</dt>
        <dd>{{ detail.file.extension.toUpperCase() }}</dd>
        <dt>Modified</dt>
        <dd>{{ formatDate(detail.file.modifiedAt) }}</dd>
        <template v-if="detail.file.indexedAt">
          <dt>Indexed</dt>
          <dd>{{ formatDate(detail.file.indexedAt) }}</dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import { IonChip } from '@ionic/vue'
import { computed } from 'vue'
import type { ModelDetail } from '@/types/modelDetail'

const props = defineProps<{
  detail: ModelDetail
}>()

const dimensions = computed(() => {
  const geometry = props.detail.geometry
  if (
    !geometry ||
    geometry.widthMm === undefined ||
    geometry.heightMm === undefined ||
    geometry.depthMm === undefined
  ) {
    return null
  }
  const format = (value: number) => value.toFixed(1)
  return `${format(geometry.widthMm)} × ${format(geometry.heightMm)} × ${format(geometry.depthMm)} mm`
})

const hasThreeMfContent = computed(() => {
  const threeMf = props.detail.threeMf
  return Boolean(
    threeMf &&
      (threeMf.objectNames.length > 0 ||
        threeMf.materialNames.length > 0 ||
        threeMf.colorValues.length > 0 ||
        threeMf.hasThumbnail),
  )
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString()
}
</script>

<style scoped>
.metadata-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section {
  background: var(--card-glass-bg);
  border: var(--card-glass-border);
  box-shadow: var(--card-glass-shadow);
  border-radius: 16px;
  padding: 18px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.panel-section h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--ion-color-primary);
}

.panel-section h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 4px;
  color: var(--ion-color-medium);
}

.description {
  margin: 0 0 8px;
  line-height: 1.5;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.chip {
  margin: 0;
  height: 24px;
  font-size: 12px;
}

.facts {
  display: grid;
  grid-template-columns: minmax(90px, max-content) 1fr;
  gap: 4px 16px;
  margin: 0;
  font-size: 14px;
}

.facts dt {
  color: var(--ion-color-medium);
}

.facts dd {
  margin: 0;
}

.path {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.search-phrases {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
}

.error-output {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--ion-color-danger-rgb), 0.08);
  color: var(--ion-color-danger);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
