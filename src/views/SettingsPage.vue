<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>Settings</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="settings.state.saving || !settings.state.draft" @click="save">
            <ion-spinner v-if="settings.state.saving" name="crescent" class="save-spinner" />
            Save
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="settings.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>Loading settings…</p>
      </div>

      <div v-else-if="settings.state.error && !settings.state.draft" class="state-container">
        <p>{{ settings.state.error }}</p>
      </div>

      <div v-else-if="draft">
        <!-- Mobile Tabs (Visible only on screens <= 768px) -->
        <div class="mobile-tabs">
          <ion-segment v-model="activeSection" mode="ios">
            <ion-segment-button value="library">
              <ion-icon :icon="folderOutline" />
              <ion-label>Library</ion-label>
            </ion-segment-button>
            <ion-segment-button value="vision">
              <ion-icon :icon="imageOutline" />
              <ion-label>Vision AI</ion-label>
            </ion-segment-button>
            <ion-segment-button value="embedding">
              <ion-icon :icon="searchOutline" />
              <ion-label>Embeddings</ion-label>
            </ion-segment-button>
            <ion-segment-button value="appearance">
              <ion-icon :icon="colorPaletteOutline" />
              <ion-label>Appearance</ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>

        <div class="settings-layout">
          <!-- Desktop Sidebar (Visible only on screens > 768px) -->
          <aside class="settings-sidebar">
            <nav class="sidebar-nav">
              <button
                class="nav-item"
                :class="{ active: activeSection === 'library' }"
                @click="activeSection = 'library'"
              >
                <ion-icon :icon="folderOutline" />
                <span>Library</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'vision' }"
                @click="activeSection = 'vision'"
              >
                <ion-icon :icon="imageOutline" />
                <span>Vision AI</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'embedding' }"
                @click="activeSection = 'embedding'"
              >
                <ion-icon :icon="searchOutline" />
                <span>Embeddings</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'appearance' }"
                @click="activeSection = 'appearance'"
              >
                <ion-icon :icon="colorPaletteOutline" />
                <span>Appearance</span>
              </button>
            </nav>
          </aside>

          <!-- Content Area -->
          <main class="settings-content">
            <!-- Validation and status messages -->
            <div class="messages-container">
              <ion-text v-if="settings.state.problems.length > 0" color="danger">
                <ul class="problems">
                  <li v-for="problem in settings.state.problems" :key="problem">{{ problem }}</li>
                </ul>
              </ion-text>
              <ion-text v-if="settings.state.error" color="danger">
                <p class="save-error">{{ settings.state.error }}</p>
              </ion-text>
              <ion-text v-if="settings.state.saved" color="success">
                <p class="save-ok">Settings saved.</p>
              </ion-text>
            </div>

            <!-- Library Location Section -->
            <section v-if="activeSection === 'library'" class="content-section">
              <h2 class="section-title">Library Location</h2>
              <p class="section-description">
                Choose the local folder where your 3D models (STL, 3MF) are stored.
              </p>

              <ion-list inset>
                <ion-item>
                  <ion-input
                    label="Folder path"
                    label-placement="fixed"
                    readonly
                    :placeholder="draft.libraryFolder || 'No folder selected'"
                    :value="draft.libraryFolder"
                    @click="pickLibraryFolder"
                    style="cursor: pointer;"
                  />
                  <ion-button slot="end" fill="outline" size="small" @click="pickLibraryFolder">
                    Browse
                  </ion-button>
                </ion-item>
              </ion-list>
            </section>

            <!-- Vision AI Section -->
            <section v-if="activeSection === 'vision'" class="content-section">
              <h2 class="section-title">Visual Enrichment (Vision AI)</h2>
              <p class="section-description">
                Enriches your 3D models by generating descriptive tags and titles using vision AI models.
              </p>

              <ion-list inset>
                <ion-item>
                  <ion-select
                    label="Provider"
                    interface="popover"
                    :value="draft.vision.provider"
                    @ion-change="settings.switchVisionProvider($event.detail.value)"
                  >
                    <ion-select-option v-for="(info, id) in VISION_PROVIDERS" :key="id" :value="id">
                      {{ info.label }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>

                <ion-item v-if="draft.vision.provider === 'ollama'">
                  <ion-toggle
                    :checked="!!draft.vision.useCloud"
                    @ion-change="draft.vision.useCloud = $event.detail.checked; settings.markDirty()"
                  >
                    Use Cloud Models
                    <ion-note slot="end" style="font-size: 11px; margin-inline-start: 8px; color: var(--ion-color-medium);">
                      Requires paid Ollama account
                    </ion-note>
                  </ion-toggle>
                </ion-item>

                <!-- Dropdown model selection if Ollama and options are available -->
                <ion-item v-if="draft.vision.provider === 'ollama' && (draft.vision.useCloud ? true : settings.state.ollamaVisionModels.length > 0)">
                  <ion-select
                    label="Model Selection"
                    interface="popover"
                    :value="isVisionModelCustom ? 'custom' : draft.vision.model"
                    @ion-change="handleVisionModelSelect($event.detail.value)"
                  >
                    <ion-select-option v-for="m in visionModelOptions" :key="m" :value="m">
                      {{ m }}
                    </ion-select-option>
                    <ion-select-option value="custom">Custom model...</ion-select-option>
                  </ion-select>
                </ion-item>

                <!-- Input field for model name if provider is not Ollama, or custom is selected, or no options pulled yet -->
                <ion-item v-if="draft.vision.provider !== 'none' && (draft.vision.provider !== 'ollama' || isVisionModelCustom || (draft.vision.provider === 'ollama' && !draft.vision.useCloud && settings.state.ollamaVisionModels.length === 0))">
                  <ion-input
                    label="Model"
                    label-placement="fixed"
                    :value="draft.vision.model"
                    @ion-input="draft.vision.model = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="visionInfo.needsApiKey">
                  <ion-input
                    label="API key"
                    label-placement="fixed"
                    type="password"
                    placeholder="sk-…"
                    :value="draft.vision.apiKey"
                    @ion-input="draft.vision.apiKey = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="visionInfo.needsBaseUrl || draft.vision.provider === 'openai'">
                  <ion-input
                    label="Base URL"
                    label-placement="fixed"
                    :placeholder="visionInfo.defaultBaseUrl"
                    :value="draft.vision.baseUrl"
                    @ion-input="draft.vision.baseUrl = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>
              </ion-list>

              <div class="section-actions" v-if="draft.vision.provider !== 'none'">
                <ion-button
                  v-if="draft.vision.provider === 'ollama' && !draft.vision.useCloud"
                  size="small"
                  fill="outline"
                  :disabled="settings.state.fetchingOllamaVisionModels"
                  @click="settings.fetchOllamaVisionModels(draft.vision.baseUrl || 'http://localhost:11434')"
                >
                  <ion-spinner v-if="settings.state.fetchingOllamaVisionModels" name="crescent" class="test-spinner" />
                  Pull local models
                </ion-button>
                <ion-button size="small" fill="outline" :disabled="settings.state.testingVision" @click="settings.testVision()">
                  <ion-spinner v-if="settings.state.testingVision" name="crescent" class="test-spinner" />
                  Test connection
                </ion-button>
                <ion-text v-if="settings.state.ollamaVisionError" color="danger" style="display: block; font-size: 12px; margin-top: 8px;">
                  Failed to pull models: {{ settings.state.ollamaVisionError }}
                </ion-text>
              </div>
              <provider-test-banner v-if="draft.vision.provider !== 'none'" :result="settings.state.visionTest" />
            </section>

            <!-- Embedding Service Section -->
            <section v-if="activeSection === 'embedding'" class="content-section">
              <h2 class="section-title">Embedding Service</h2>
              <p class="section-description">
                Turns AI descriptions and your search queries into vectors. The built-in model
                runs locally and is downloaded once from Hugging Face.
              </p>

              <ion-list inset>
                <ion-item>
                  <ion-select
                    label="Provider"
                    interface="popover"
                    :value="draft.embedding.provider"
                    @ion-change="settings.switchEmbeddingProvider($event.detail.value)"
                  >
                    <ion-select-option v-for="(info, id) in EMBEDDING_PROVIDERS" :key="id" :value="id">
                      {{ info.label }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>

                <ion-item v-if="draft.embedding.provider === 'ollama'">
                  <ion-toggle
                    :checked="!!draft.embedding.useCloud"
                    @ion-change="draft.embedding.useCloud = $event.detail.checked; settings.markDirty()"
                  >
                    Use Cloud Models
                    <ion-note slot="end" style="font-size: 11px; margin-inline-start: 8px; color: var(--ion-color-medium);">
                      Requires paid Ollama account
                    </ion-note>
                  </ion-toggle>
                </ion-item>

                <!-- Dropdown model selection if Ollama and options are available -->
                <ion-item v-if="draft.embedding.provider === 'ollama' && (draft.embedding.useCloud ? true : settings.state.ollamaEmbeddingModels.length > 0)">
                  <ion-select
                    label="Model Selection"
                    interface="popover"
                    :value="isEmbeddingModelCustom ? 'custom' : draft.embedding.model"
                    @ion-change="handleEmbeddingModelSelect($event.detail.value)"
                  >
                    <ion-select-option v-for="m in embeddingModelOptions" :key="m" :value="m">
                      {{ m }}
                    </ion-select-option>
                    <ion-select-option value="custom">Custom model...</ion-select-option>
                  </ion-select>
                </ion-item>

                <!-- Input field for model name if provider is not Ollama, or custom is selected, or no options pulled yet -->
                <ion-item v-if="draft.embedding.provider !== 'none' && (draft.embedding.provider !== 'ollama' || isEmbeddingModelCustom || (draft.embedding.provider === 'ollama' && !draft.embedding.useCloud && settings.state.ollamaEmbeddingModels.length === 0))">
                  <ion-input
                    label="Model"
                    label-placement="fixed"
                    :value="draft.embedding.model"
                    @ion-input="draft.embedding.model = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="embeddingInfo.needsApiKey">
                  <ion-input
                    label="API key"
                    label-placement="fixed"
                    type="password"
                    :value="draft.embedding.apiKey"
                    @ion-input="draft.embedding.apiKey = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="embeddingInfo.needsBaseUrl || draft.embedding.provider === 'openai'">
                  <ion-input
                    label="Base URL"
                    label-placement="fixed"
                    :placeholder="embeddingInfo.defaultBaseUrl"
                    :value="draft.embedding.baseUrl"
                    @ion-input="draft.embedding.baseUrl = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="draft.embedding.provider !== 'none'">
                  <ion-input
                    label="Dimensions"
                    label-placement="fixed"
                    type="number"
                    :value="draft.embedding.dimensions"
                    @ion-input="draft.embedding.dimensions = Number($event.detail.value ?? 0); settings.markDirty()"
                  />
                </ion-item>
              </ion-list>

              <div class="section-actions" v-if="draft.embedding.provider !== 'none'">
                <ion-button
                  v-if="draft.embedding.provider === 'ollama' && !draft.embedding.useCloud"
                  size="small"
                  fill="outline"
                  :disabled="settings.state.fetchingOllamaEmbeddingModels"
                  @click="settings.fetchOllamaEmbeddingModels(draft.embedding.baseUrl || 'http://localhost:11434')"
                >
                  <ion-spinner v-if="settings.state.fetchingOllamaEmbeddingModels" name="crescent" class="test-spinner" />
                  Pull local models
                </ion-button>
                <ion-button size="small" fill="outline" :disabled="settings.state.testingEmbedding" @click="settings.testEmbedding()">
                  <ion-spinner v-if="settings.state.testingEmbedding" name="crescent" class="test-spinner" />
                  Test connection
                </ion-button>
                <ion-button
                  size="small"
                  :fill="settings.state.needsReembed ? 'solid' : 'outline'"
                  :color="settings.state.needsReembed ? 'warning' : undefined"
                  :disabled="settings.state.reembedding"
                  @click="settings.reembedLibrary()"
                >
                  <ion-spinner v-if="settings.state.reembedding" name="crescent" class="test-spinner" />
                  Re-embed library
                </ion-button>
                <ion-text v-if="settings.state.ollamaEmbeddingError" color="danger" style="display: block; font-size: 12px; margin-top: 8px;">
                  Failed to pull models: {{ settings.state.ollamaEmbeddingError }}
                </ion-text>
              </div>
              <provider-test-banner v-if="draft.embedding.provider !== 'none'" :result="settings.state.embeddingTest" />

              <ion-text v-if="draft.embedding.provider !== 'none' && settings.state.needsReembed && !settings.state.reembedding" color="warning">
                <p class="save-error">
                  The embedding configuration changed, so stored embeddings were cleared. Run
                  "Re-embed library" to make semantic search work again.
                </p>
              </ion-text>
              <ion-text
                v-if="draft.embedding.provider !== 'none' && settings.state.reembedResult"
                :color="settings.state.reembedResult.failed > 0 || settings.state.reembedResult.errorMessage ? 'danger' : 'success'"
              >
                <p class="save-error">
                  <template v-if="settings.state.reembedResult.errorMessage && settings.state.reembedResult.embedded === 0">
                    Re-embedding failed: {{ settings.state.reembedResult.errorMessage }}
                  </template>
                  <template v-else>
                    Re-embedded {{ settings.state.reembedResult.embedded }} model(s){{
                      settings.state.reembedResult.failed > 0
                        ? `, ${settings.state.reembedResult.failed} failed: ${settings.state.reembedResult.errorMessage}`
                        : '.'
                    }}
                  </template>
                </p>
              </ion-text>

              <ion-text color="medium">
                <p class="footnote">
                  Changing the embedding provider or model changes the vector space: existing
                  embeddings are cleared and the library needs to be re-embedded before search works.
                  The built-in model (~25 MB) is downloaded from Hugging Face on first use and then
                  works fully offline.
                </p>
              </ion-text>
            </section>

            <!-- Appearance Section -->
            <section v-if="activeSection === 'appearance'" class="content-section">
              <h2 class="section-title">Appearance</h2>
              <p class="section-description">
                Customize the look and feel of meshNest. Choose between a light interface, the Deep Nebula dark mode, or follow your operating system's theme.
              </p>

              <div class="theme-cards-grid">
                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.appearance || 'system') === 'clear' }"
                  @click="draft.appearance = 'clear'; settings.markDirty()"
                >
                  <div class="theme-preview clear-preview">
                    <div class="preview-header"></div>
                    <div class="preview-body">
                      <div class="preview-card"></div>
                    </div>
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">Clear (Light)</span>
                    <span class="theme-desc">Aurora Frost theme</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.appearance || 'system') === 'dark' }"
                  @click="draft.appearance = 'dark'; settings.markDirty()"
                >
                  <div class="theme-preview dark-preview">
                    <div class="preview-header"></div>
                    <div class="preview-body">
                      <div class="preview-card"></div>
                    </div>
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">Deep Nebula</span>
                    <span class="theme-desc">Cozy dark space theme</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.appearance || 'system') === 'system' }"
                  @click="draft.appearance = 'system'; settings.markDirty()"
                >
                  <div class="theme-preview system-preview">
                    <div class="preview-half clear-half"></div>
                    <div class="preview-half dark-half"></div>
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">System Default</span>
                    <span class="theme-desc">Matches your OS theme</span>
                  </div>
                </button>
              </div>
            </section>
          </main>
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
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue'
import { computed, onMounted, ref } from 'vue'
import { folderOutline, imageOutline, searchOutline, colorPaletteOutline } from 'ionicons/icons'
import ProviderTestBanner from '@/components/settings/ProviderTestBanner.vue'
import type { VisionProviderId, EmbeddingProviderId } from '@/types/providerSettings'
import {
  EMBEDDING_PROVIDERS,
  VISION_PROVIDERS,
  OLLAMA_CLOUD_MODELS,
  OLLAMA_CLOUD_EMBEDDING_MODELS,
} from '@/services/settings/providerSettings'
import { useSettingsStore } from '@/stores/settingsStore'
 
const settings = useSettingsStore()
const draft = computed(() => settings.state.draft)
 
const activeSection = ref<'library' | 'vision' | 'embedding' | 'appearance'>('library')

const visionInfo = computed(() => VISION_PROVIDERS[draft.value!.vision.provider as Exclude<VisionProviderId, 'mock'>])
const embeddingInfo = computed(() => EMBEDDING_PROVIDERS[draft.value!.embedding.provider as Exclude<EmbeddingProviderId, 'mock'>])

const visionModelOptions = computed(() => {
  if (!draft.value) return []
  return draft.value.vision.useCloud
    ? OLLAMA_CLOUD_MODELS
    : settings.state.ollamaVisionModels
})

const isVisionModelCustom = computed(() => {
  if (!draft.value) return false
  if (draft.value.vision.provider !== 'ollama') return false
  return draft.value.vision.model !== '' && !visionModelOptions.value.includes(draft.value.vision.model)
})

function handleVisionModelSelect(value: string) {
  if (!draft.value) return
  if (value === 'custom') {
    if (!visionModelOptions.value.includes(draft.value.vision.model)) {
      // already custom
    } else {
      draft.value.vision.model = ''
    }
  } else {
    draft.value.vision.model = value
  }
  settings.markDirty()
}

const embeddingModelOptions = computed(() => {
  if (!draft.value) return []
  return draft.value.embedding.useCloud
    ? OLLAMA_CLOUD_EMBEDDING_MODELS
    : settings.state.ollamaEmbeddingModels
})

const isEmbeddingModelCustom = computed(() => {
  if (!draft.value) return false
  if (draft.value.embedding.provider !== 'ollama') return false
  return draft.value.embedding.model !== '' && !embeddingModelOptions.value.includes(draft.value.embedding.model)
})

function handleEmbeddingModelSelect(value: string) {
  if (!draft.value) return
  if (value === 'custom') {
    if (!embeddingModelOptions.value.includes(draft.value.embedding.model)) {
      // already custom
    } else {
      draft.value.embedding.model = ''
    }
  } else {
    draft.value.embedding.model = value
  }
  settings.markDirty()
}

async function pickLibraryFolder(): Promise<void> {
  if (!window.meshNest || !draft.value) return
  const directory = await window.meshNest.pickDirectory()
  if (directory) {
    draft.value.libraryFolder = directory
    settings.markDirty()
  }
}

async function save(): Promise<void> {
  await settings.saveSettings()
}

onMounted(() => {
  if (!settings.state.draft) {
    settings.loadSettings()
  }
})
</script>

<style scoped>
.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 50vh;
  color: var(--ion-color-medium);
}

.messages-container {
  max-width: 680px;
  margin: 0 auto 16px;
  padding: 0;
}

.problems {
  margin: 0 0 12px;
  padding-left: 18px;
  font-size: 13px;
}

.save-error,
.save-ok {
  margin: 0 0 12px;
  font-size: 13px;
}

.section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.save-spinner,
.test-spinner {
  width: 14px;
  height: 14px;
  margin-inline-end: 6px;
}

.footnote {
  margin: 24px 0 0;
  font-size: 12px;
}

/* Mobile Tabs (Visible only on screens <= 768px) */
.mobile-tabs {
  display: none;
  padding: 16px 16px 0 16px;
}

.mobile-tabs ion-segment {
  --background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(79, 70, 229, 0.1);
  border-radius: 14px;
  padding: 4px;
}

.mobile-tabs ion-segment-button {
  --color: var(--ion-color-medium);
  --color-checked: var(--ion-color-primary);
  --indicator-color: transparent;
  --background-checked: rgba(79, 70, 229, 0.08);
  --border-radius: 10px;
  font-size: 0.85rem;
  min-height: 44px;
  margin: 0;
}

.mobile-tabs ion-segment-button::part(indicator-background) {
  background: rgba(79, 70, 229, 0.08);
  border: 1px solid rgba(79, 70, 229, 0.15);
  border-radius: 10px;
}

/* Settings Layout */
.settings-layout {
  display: flex;
  min-height: calc(100vh - 64px);
}

/* Sidebar */
.settings-sidebar {
  width: 240px;
  min-width: 240px;
  background: rgba(255, 255, 255, 0.2);
  border-right: 1px solid rgba(79, 70, 229, 0.12);
  padding: 24px 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px;
  position: sticky;
  top: 24px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--ion-color-medium);
  font-size: 0.95rem;
  font-family: var(--ion-font-family);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.nav-item ion-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.nav-item:hover {
  background: rgba(79, 70, 229, 0.04);
  color: var(--ion-color-primary);
}

.nav-item.active {
  background: rgba(79, 70, 229, 0.08);
  color: var(--ion-color-primary);
  font-weight: 600;
  border: 1px solid rgba(79, 70, 229, 0.15);
}

/* Content Area */
.settings-content {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
}

.content-section {
  animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 680px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--ion-color-primary);
  margin: 0 0 8px 0;
  font-family: var(--font-heading);
}

.section-description {
  color: var(--ion-color-medium);
  font-size: 0.95rem;
  margin: 0 0 24px 0;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .mobile-tabs {
    display: block;
  }

  .settings-sidebar {
    display: none;
  }

  .settings-layout {
    flex-direction: column;
    min-height: auto;
  }

  .settings-content {
    padding: 24px 16px;
  }

  .content-section {
    max-width: 100%;
  }
}

/* Theme Selection Cards styling */
.theme-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 16px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  background: var(--card-glass-bg);
  border: var(--card-glass-border);
  box-shadow: var(--card-glass-shadow);
  border-radius: 16px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
  font-family: var(--ion-font-family);
  position: relative;
  overflow: hidden;
  outline: none;
}

.theme-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.12);
  border-color: rgba(79, 70, 229, 0.3);
}

.theme-card.active {
  border-color: var(--ion-color-primary);
  box-shadow: 0 0 0 2px var(--ion-color-primary), 0 8px 24px rgba(79, 70, 229, 0.15);
  background: var(--card-glass-bg);
}

.theme-preview {
  width: 100%;
  height: 90px;
  border-radius: 10px;
  border: 1px solid rgba(79, 70, 229, 0.1);
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Clear Preview styling */
.clear-preview {
  background: linear-gradient(135deg, #F4F7FC 0%, #FAEBF4 100%);
}
.clear-preview .preview-header {
  height: 15px;
  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(79, 70, 229, 0.08);
}
.clear-preview .preview-body {
  flex: 1;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.clear-preview .preview-card {
  width: 80%;
  height: 35px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(79, 70, 229, 0.12);
  border-radius: 6px;
}

/* Dark Preview styling */
.dark-preview {
  background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%);
}
.dark-preview .preview-header {
  height: 15px;
  background: rgba(15, 23, 42, 0.8);
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
}
.dark-preview .preview-body {
  flex: 1;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dark-preview .preview-card {
  width: 80%;
  height: 35px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 6px;
}

/* System Preview styling */
.system-preview {
  display: flex;
  flex-direction: row;
}
.system-preview .preview-half {
  flex: 1;
  height: 100%;
}
.system-preview .clear-half {
  background: linear-gradient(135deg, #F4F7FC 0%, #FAEBF4 100%);
  border-right: 1px solid rgba(79, 70, 229, 0.1);
}
.system-preview .dark-half {
  background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%);
}

.theme-info {
  display: flex;
  flex-direction: column;
  padding: 0 4px;
}

.theme-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.theme-desc {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  margin-top: 2px;
}

@media (max-width: 576px) {
  .theme-cards-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
