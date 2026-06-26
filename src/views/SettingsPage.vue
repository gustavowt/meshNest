<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/library" />
        </ion-buttons>
        <ion-title>{{ $t('common.settings') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="settings.state.saving || !settings.state.draft" @click="save">
            <ion-spinner v-if="settings.state.saving" name="crescent" class="save-spinner" />
            {{ $t('common.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="settings.state.loading" class="state-container">
        <ion-spinner name="crescent" />
        <p>{{ $t('common.loading') }}</p>
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
              <ion-label>{{ $t('settings.tabs.library') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="vision">
              <ion-icon :icon="imageOutline" />
              <ion-label>{{ $t('settings.tabs.vision') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="embedding">
              <ion-icon :icon="searchOutline" />
              <ion-label>{{ $t('settings.tabs.embedding') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="appearance">
              <ion-icon :icon="colorPaletteOutline" />
              <ion-label>{{ $t('settings.tabs.appearance') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="language">
              <ion-icon :icon="languageOutline" />
              <ion-label>{{ $t('settings.tabs.language') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="worldSearch">
              <ion-icon :icon="globeOutline" />
              <ion-label>{{ $t('settings.tabs.worldSearch') }}</ion-label>
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
                <span>{{ $t('settings.tabs.library') }}</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'vision' }"
                @click="activeSection = 'vision'"
              >
                <ion-icon :icon="imageOutline" />
                <span>{{ $t('settings.tabs.vision') }}</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'embedding' }"
                @click="activeSection = 'embedding'"
              >
                <ion-icon :icon="searchOutline" />
                <span>{{ $t('settings.tabs.embedding') }}</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'appearance' }"
                @click="activeSection = 'appearance'"
              >
                <ion-icon :icon="colorPaletteOutline" />
                <span>{{ $t('settings.tabs.appearance') }}</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'language' }"
                @click="activeSection = 'language'"
              >
                <ion-icon :icon="languageOutline" />
                <span>{{ $t('settings.tabs.language') }}</span>
              </button>
              <button
                class="nav-item"
                :class="{ active: activeSection === 'worldSearch' }"
                @click="activeSection = 'worldSearch'"
              >
                <ion-icon :icon="globeOutline" />
                <span>{{ $t('settings.tabs.worldSearch') }}</span>
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
              <ion-text v-if="settings.state.dirty" color="warning">
                <p class="save-error">{{ $t('settings.unsavedChanges') }}</p>
              </ion-text>
            </div>

            <!-- Library Location Section -->
            <section v-if="activeSection === 'library'" class="content-section">
              <h2 class="section-title">{{ $t('settings.librarySection.title') }}</h2>
              <p class="section-description">
                {{ $t('settings.librarySection.desc') }}
              </p>

              <ion-list inset>
                <ion-item>
                  <ion-input
                    :label="$t('settings.librarySection.folderPath')"
                    label-placement="fixed"
                    readonly
                    :placeholder="draft.libraryFolder || $t('settings.librarySection.noFolder')"
                    :value="draft.libraryFolder"
                    @click="pickLibraryFolder"
                    style="cursor: pointer;"
                  />
                  <ion-button slot="end" fill="outline" size="small" @click="pickLibraryFolder">
                    {{ $t('settings.librarySection.browse') }}
                  </ion-button>
                </ion-item>
              </ion-list>
            </section>

            <!-- Vision AI Section -->
            <section v-if="activeSection === 'vision'" class="content-section">
              <h2 class="section-title">{{ $t('settings.visionSection.title') }}</h2>
              <p class="section-description">
                {{ $t('settings.visionSection.desc') }}
              </p>

              <div class="provider-explainer">
                <div class="provider-explainer-copy">
                  <p class="explainer-kicker">{{ $t('settings.visionSection.explainerKicker') }}</p>
                  <div class="benefit-row">
                    <span class="benefit-dot enabled" />
                    <div>
                      <h3>{{ $t('settings.visionSection.enabledTitle') }}</h3>
                      <p>{{ $t('settings.visionSection.enabledDesc') }}</p>
                    </div>
                  </div>
                  <div class="benefit-row">
                    <span class="benefit-dot disabled" />
                    <div>
                      <h3>{{ $t('settings.visionSection.disabledTitle') }}</h3>
                      <p>{{ $t('settings.visionSection.disabledDesc') }}</p>
                    </div>
                  </div>
                </div>
                <div class="provider-visual vision-visual" aria-hidden="true">
                  <div class="visual-card model-card-visual">
                    <ion-icon :icon="imageOutline" />
                    <span class="visual-line wide" />
                    <span class="visual-line" />
                  </div>
                  <div class="visual-chip chip-one" />
                  <div class="visual-chip chip-two" />
                  <div class="visual-chip chip-three" />
                </div>
              </div>

              <ion-list inset>
                <ion-item>
                  <ion-select
                    :label="$t('settings.visionSection.provider')"
                    interface="popover"
                    :value="draft.vision.provider"
                    @ion-change="settings.switchVisionProvider($event.detail.value)"
                  >
                    <ion-select-option v-for="(info, id) in VISION_PROVIDERS" :key="id" :value="id">
                      {{ info.label }}
                    </ion-select-option>
                  </ion-select>
                </ion-item>

                <ion-item v-if="draft.vision.provider !== 'none'">
                  <ion-input
                    :label="$t('settings.visionSection.model')"
                    label-placement="fixed"
                    :value="draft.vision.model"
                    @ion-input="draft.vision.model = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="visionInfo.needsApiKey">
                  <ion-input
                    :label="$t('settings.visionSection.apiKey')"
                    label-placement="fixed"
                    type="password"
                    :placeholder="$t('settings.visionSection.apiKeyPlaceholder')"
                    :value="draft.vision.apiKey"
                    @ion-input="draft.vision.apiKey = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="visionInfo.needsBaseUrl || draft.vision.provider === 'openai'">
                  <ion-input
                    :label="$t('settings.visionSection.baseUrl')"
                    label-placement="fixed"
                    :placeholder="visionInfo.defaultBaseUrl"
                    :value="draft.vision.baseUrl"
                    @ion-input="draft.vision.baseUrl = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>
              </ion-list>

              <div class="section-actions" v-if="draft.vision.provider !== 'none'">
                <ion-button size="small" fill="outline" :disabled="settings.state.testingVision" @click="settings.testVision()">
                  <ion-spinner v-if="settings.state.testingVision" name="crescent" class="test-spinner" />
                  {{ $t('settings.visionSection.testConnection') }}
                </ion-button>
              </div>
              <provider-test-banner v-if="draft.vision.provider !== 'none'" :result="settings.state.visionTest" />
            </section>

            <!-- Embedding Service Section -->
            <section v-if="activeSection === 'embedding'" class="content-section">
              <h2 class="section-title">{{ $t('settings.embeddingSection.title') }}</h2>
              <p class="section-description">
                {{ $t('settings.embeddingSection.desc') }}
              </p>

              <div class="provider-explainer">
                <div class="provider-explainer-copy">
                  <p class="explainer-kicker">{{ $t('settings.embeddingSection.explainerKicker') }}</p>
                  <div class="benefit-row">
                    <span class="benefit-dot enabled" />
                    <div>
                      <h3>{{ $t('settings.embeddingSection.enabledTitle') }}</h3>
                      <p>{{ $t('settings.embeddingSection.enabledDesc') }}</p>
                    </div>
                  </div>
                  <div class="benefit-row">
                    <span class="benefit-dot dimensions" />
                    <div>
                      <h3>{{ $t('settings.embeddingSection.dimensionsTitle') }}</h3>
                      <p>{{ $t('settings.embeddingSection.dimensionsDesc') }}</p>
                    </div>
                  </div>
                  <div class="benefit-row">
                    <span class="benefit-dot disabled" />
                    <div>
                      <h3>{{ $t('settings.embeddingSection.disabledTitle') }}</h3>
                      <p>{{ $t('settings.embeddingSection.disabledDesc') }}</p>
                    </div>
                  </div>
                </div>
                <div class="provider-visual embedding-visual" aria-hidden="true">
                  <div class="search-orb">
                    <ion-icon :icon="searchOutline" />
                  </div>
                  <span class="connection-line line-one" />
                  <span class="connection-line line-two" />
                  <div class="match-card match-one" />
                  <div class="match-card match-two" />
                  <div class="match-card match-three" />
                </div>
              </div>

              <ion-list inset>
                <ion-item>
                  <ion-select
                    :label="$t('settings.embeddingSection.provider')"
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
                    {{ $t('settings.embeddingSection.useCloud') }}
                    <ion-note slot="end" style="font-size: 11px; margin-inline-start: 8px; color: var(--ion-color-medium);">
                      {{ $t('settings.embeddingSection.useCloudNote') }}
                    </ion-note>
                  </ion-toggle>
                </ion-item>

                <!-- Dropdown model selection if Ollama and options are available -->
                <ion-item v-if="draft.embedding.provider === 'ollama' && (draft.embedding.useCloud ? true : settings.state.ollamaEmbeddingModels.length > 0)">
                  <ion-select
                    :label="$t('settings.embeddingSection.modelSelection')"
                    interface="popover"
                    :value="isEmbeddingModelCustom ? 'custom' : draft.embedding.model"
                    @ion-change="handleEmbeddingModelSelect($event.detail.value)"
                  >
                    <ion-select-option v-for="m in embeddingModelOptions" :key="m" :value="m">
                      {{ m }}
                    </ion-select-option>
                    <ion-select-option value="custom">{{ $t('settings.embeddingSection.customModelOption') }}</ion-select-option>
                  </ion-select>
                </ion-item>

                <!-- Input field for model name if provider is not Ollama, or custom is selected, or no options pulled yet -->
                <ion-item v-if="draft.embedding.provider !== 'none' && (draft.embedding.provider !== 'ollama' || isEmbeddingModelCustom || (draft.embedding.provider === 'ollama' && !draft.embedding.useCloud && settings.state.ollamaEmbeddingModels.length === 0))">
                  <ion-input
                    :label="$t('settings.embeddingSection.model')"
                    label-placement="fixed"
                    :value="draft.embedding.model"
                    @ion-input="draft.embedding.model = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="embeddingInfo.needsApiKey">
                  <ion-input
                    :label="$t('settings.embeddingSection.apiKey')"
                    label-placement="fixed"
                    type="password"
                    :value="draft.embedding.apiKey"
                    @ion-input="draft.embedding.apiKey = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="embeddingInfo.needsBaseUrl || draft.embedding.provider === 'openai'">
                  <ion-input
                    :label="$t('settings.embeddingSection.baseUrl')"
                    label-placement="fixed"
                    :placeholder="embeddingInfo.defaultBaseUrl"
                    :value="draft.embedding.baseUrl"
                    @ion-input="draft.embedding.baseUrl = $event.detail.value ?? ''; settings.markDirty()"
                  />
                </ion-item>

                <ion-item v-if="draft.embedding.provider !== 'none'">
                  <ion-input
                    :label="$t('settings.embeddingSection.dimensions')"
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
                  {{ $t('settings.embeddingSection.pullLocal') }}
                </ion-button>
                <ion-button size="small" fill="outline" :disabled="settings.state.testingEmbedding" @click="settings.testEmbedding()">
                  <ion-spinner v-if="settings.state.testingEmbedding" name="crescent" class="test-spinner" />
                  {{ $t('settings.embeddingSection.testConnection') }}
                </ion-button>
                <ion-button
                  size="small"
                  :fill="settings.state.needsReembed ? 'solid' : 'outline'"
                  :color="settings.state.needsReembed ? 'warning' : undefined"
                  :disabled="settings.state.reembedding"
                  @click="settings.reembedLibrary()"
                >
                  <ion-spinner v-if="settings.state.reembedding" name="crescent" class="test-spinner" />
                  {{ $t('settings.embeddingSection.reembedLibrary') }}
                </ion-button>
                <ion-text v-if="settings.state.ollamaEmbeddingError" color="danger" style="display: block; font-size: 12px; margin-top: 8px;">
                  {{ $t('settings.embeddingSection.pullFailed', { error: settings.state.ollamaEmbeddingError }) }}
                </ion-text>
              </div>
              <provider-test-banner v-if="draft.embedding.provider !== 'none'" :result="settings.state.embeddingTest" />

              <ion-text v-if="draft.embedding.provider !== 'none' && settings.state.needsReembed && !settings.state.reembedding" color="warning">
                <p class="save-error">
                  {{ $t('settings.embeddingSection.reembedConfigChanged') }}
                </p>
              </ion-text>
              <ion-text
                v-if="draft.embedding.provider !== 'none' && settings.state.reembedResult"
                :color="settings.state.reembedResult.failed > 0 || settings.state.reembedResult.errorMessage ? 'danger' : 'success'"
              >
                <p class="save-error">
                  <template v-if="settings.state.reembedResult.errorMessage && settings.state.reembedResult.embedded === 0">
                    {{ $t('settings.embeddingSection.reembedFailed', { error: settings.state.reembedResult.errorMessage }) }}
                  </template>
                  <template v-else>
                    {{
                      $t('settings.embeddingSection.reembedSuccess', {
                        embedded: settings.state.reembedResult.embedded,
                        failed: settings.state.reembedResult.failed > 0
                          ? $t('settings.embeddingSection.reembedFailedCount', { count: settings.state.reembedResult.failed, error: settings.state.reembedResult.errorMessage })
                          : '.'
                      })
                    }}
                  </template>
                </p>
              </ion-text>

              <ion-text color="medium">
                <p class="footnote">
                  {{ $t('settings.embeddingSection.footnote') }}
                </p>
              </ion-text>
            </section>

            <!-- Appearance Section -->
            <section v-if="activeSection === 'appearance'" class="content-section">
              <h2 class="section-title">{{ $t('settings.appearanceSection.title') }}</h2>
              <p class="section-description">
                {{ $t('settings.appearanceSection.desc') }}
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
                    <span class="theme-name">{{ $t('settings.appearanceSection.clearTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.appearanceSection.clearDesc') }}</span>
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
                    <span class="theme-name">{{ $t('settings.appearanceSection.darkTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.appearanceSection.darkDesc') }}</span>
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
                    <span class="theme-name">{{ $t('settings.appearanceSection.systemTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.appearanceSection.systemDesc') }}</span>
                  </div>
                </button>
              </div>
            </section>

            <!-- Language Section -->
            <section v-if="activeSection === 'language'" class="content-section">
              <h2 class="section-title">{{ $t('settings.languageSection.title') }}</h2>
              <p class="section-description">
                {{ $t('settings.languageSection.desc') }}
              </p>

              <div class="theme-cards-grid">
                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.language || 'en') === 'en' }"
                  @click="draft.language = 'en'; settings.markDirty()"
                >
                  <div class="theme-preview flag-preview">
                    <img src="/flags/us.svg" alt="" class="flag-img" />
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">{{ $t('settings.languageSection.enTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.languageSection.enDesc') }}</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.language || 'en') === 'pt' }"
                  @click="draft.language = 'pt'; settings.markDirty()"
                >
                  <div class="theme-preview flag-preview">
                    <img src="/flags/br.svg" alt="" class="flag-img" />
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">{{ $t('settings.languageSection.ptTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.languageSection.ptDesc') }}</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="theme-card"
                  :class="{ active: (draft.language || 'en') === 'es' }"
                  @click="draft.language = 'es'; settings.markDirty()"
                >
                  <div class="theme-preview flag-preview">
                    <img src="/flags/es.svg" alt="" class="flag-img" />
                  </div>
                  <div class="theme-info">
                    <span class="theme-name">{{ $t('settings.languageSection.esTitle') }}</span>
                    <span class="theme-desc">{{ $t('settings.languageSection.esDesc') }}</span>
                  </div>
                </button>
              </div>
            </section>

            <world-search-settings-section
              v-if="activeSection === 'worldSearch' && draft?.worldSearch"
              v-model="draft.worldSearch"
              @dirty="settings.markDirty()"
            />
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
  toastController,
} from '@ionic/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { folderOutline, globeOutline, imageOutline, searchOutline, colorPaletteOutline, languageOutline } from 'ionicons/icons'
import ProviderTestBanner from '@/components/settings/ProviderTestBanner.vue'
import WorldSearchSettingsSection from '@/components/settings/WorldSearchSettingsSection.vue'
import type { VisionProviderId, EmbeddingProviderId } from '@/types/providerSettings'
import {
  EMBEDDING_PROVIDERS,
  VISION_PROVIDERS,
  OLLAMA_CLOUD_EMBEDDING_MODELS,
} from '@/services/settings/providerSettings'
import { useSettingsStore } from '@/stores/settingsStore'
 
const { t } = useI18n()
const settings = useSettingsStore()
const draft = computed(() => settings.state.draft)
 
const activeSection = ref<'library' | 'vision' | 'embedding' | 'appearance' | 'language' | 'worldSearch'>('library')

const visionInfo = computed(() => VISION_PROVIDERS[draft.value!.vision.provider as Exclude<VisionProviderId, 'mock'>])
const embeddingInfo = computed(() => EMBEDDING_PROVIDERS[draft.value!.embedding.provider as Exclude<EmbeddingProviderId, 'mock'>])

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
  const ok = await settings.saveSettings()
  if (ok) {
    const toast = await toastController.create({
      message: t('settings.saved'),
      duration: 2500,
      color: 'success',
      position: 'bottom',
    })
    await toast.present()
  }
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

.save-error {
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

.provider-explainer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 20px;
  align-items: stretch;
  margin: 0 0 24px;
  padding: 18px;
  border: var(--card-glass-border);
  border-radius: 18px;
  background: var(--card-glass-bg);
  box-shadow: var(--card-glass-shadow);
  overflow: hidden;
}

.provider-explainer-copy {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.explainer-kicker {
  margin: 0;
  color: var(--ion-color-primary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.benefit-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.benefit-row h3 {
  margin: -3px 0 4px;
  color: var(--ion-text-color);
  font-size: 0.95rem;
  font-weight: 700;
}

.benefit-row p {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 0.85rem;
  line-height: 1.45;
}

.benefit-dot {
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 999px;
}

.benefit-dot.enabled {
  background: var(--ion-color-success);
  box-shadow: 0 0 0 4px rgba(45, 211, 111, 0.14);
}

.benefit-dot.dimensions {
  background: var(--ion-color-primary);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.14);
}

.benefit-dot.disabled {
  background: var(--ion-color-medium);
  box-shadow: 0 0 0 4px rgba(107, 114, 128, 0.12);
}

.provider-visual {
  position: relative;
  min-height: 180px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 25% 20%, rgba(79, 70, 229, 0.22), transparent 35%),
    linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(236, 72, 153, 0.08));
  border: 1px solid rgba(79, 70, 229, 0.12);
  overflow: hidden;
}

.visual-card {
  position: absolute;
  left: 28px;
  top: 34px;
  width: 104px;
  height: 116px;
  padding: 18px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
}

.visual-card ion-icon {
  color: var(--ion-color-primary);
  font-size: 30px;
}

.visual-line {
  display: block;
  width: 54px;
  height: 8px;
  margin-top: 12px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.16);
}

.visual-line.wide {
  width: 76px;
}

.visual-chip {
  position: absolute;
  height: 20px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.18);
}

.chip-one {
  right: 20px;
  top: 42px;
  width: 58px;
}

.chip-two {
  right: 34px;
  top: 74px;
  width: 78px;
  background: rgba(236, 72, 153, 0.18);
}

.chip-three {
  right: 16px;
  top: 106px;
  width: 48px;
  background: rgba(14, 165, 233, 0.18);
}

.search-orb {
  position: absolute;
  left: 54px;
  top: 56px;
  display: grid;
  place-items: center;
  width: 70px;
  height: 70px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
}

.search-orb ion-icon {
  color: var(--ion-color-primary);
  font-size: 32px;
}

.connection-line {
  position: absolute;
  left: 104px;
  width: 58px;
  height: 2px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.22);
  transform-origin: left center;
}

.line-one {
  top: 76px;
  transform: rotate(-18deg);
}

.line-two {
  top: 112px;
  transform: rotate(18deg);
}

.match-card {
  position: absolute;
  right: 18px;
  width: 54px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
}

.match-one {
  top: 36px;
}

.match-two {
  top: 82px;
  right: 32px;
}

.match-three {
  top: 128px;
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

  .provider-explainer {
    grid-template-columns: 1fr;
  }

  .provider-visual {
    min-height: 130px;
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

/* Flag Preview styling */
.flag-preview {
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.04);
  padding: 12px;
}
.flag-preview .flag-img {
  width: 96px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
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
