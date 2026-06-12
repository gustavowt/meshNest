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

      <div v-else-if="draft" class="settings-form">
        <!-- Validation problems -->
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

        <!-- Vision provider -->
        <ion-list inset>
          <ion-list-header>
            <ion-label>
              <h2>Visual enrichment (vision AI)</h2>
              <p>Describes each model from its rendered views during indexing.</p>
            </ion-label>
          </ion-list-header>

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

          <ion-item>
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
        <div class="section-actions">
          <ion-button size="small" fill="outline" :disabled="settings.state.testingVision" @click="settings.testVision()">
            <ion-spinner v-if="settings.state.testingVision" name="crescent" class="test-spinner" />
            Test connection
          </ion-button>
        </div>
        <provider-test-banner :result="settings.state.visionTest" />

        <!-- Embedding provider -->
        <ion-list inset>
          <ion-list-header>
            <ion-label>
              <h2>Embedding service (semantic search)</h2>
              <p>
                Turns AI descriptions and your search queries into vectors. The built-in model
                runs locally and is downloaded once from Hugging Face.
              </p>
            </ion-label>
          </ion-list-header>

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

          <ion-item>
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

          <ion-item>
            <ion-input
              label="Dimensions"
              label-placement="fixed"
              type="number"
              :value="draft.embedding.dimensions"
              @ion-input="draft.embedding.dimensions = Number($event.detail.value ?? 0); settings.markDirty()"
            />
          </ion-item>
        </ion-list>
        <div class="section-actions">
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
        </div>
        <provider-test-banner :result="settings.state.embeddingTest" />

        <ion-text v-if="settings.state.needsReembed && !settings.state.reembedding" color="warning">
          <p class="save-error">
            The embedding configuration changed, so stored embeddings were cleared. Run
            "Re-embed library" to make semantic search work again.
          </p>
        </ion-text>
        <ion-text
          v-if="settings.state.reembedResult"
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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { computed, onMounted } from 'vue'
import ProviderTestBanner from '@/components/settings/ProviderTestBanner.vue'
import {
  EMBEDDING_PROVIDERS,
  VISION_PROVIDERS,
} from '@/services/settings/providerSettings'
import { useSettingsStore } from '@/stores/settingsStore'

const settings = useSettingsStore()
const draft = computed(() => settings.state.draft)

const visionInfo = computed(() => VISION_PROVIDERS[draft.value!.vision.provider])
const embeddingInfo = computed(() => EMBEDDING_PROVIDERS[draft.value!.embedding.provider])

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
.settings-form {
  max-width: 720px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 50vh;
  color: var(--ion-color-medium);
}

.problems {
  margin: 12px 16px 0;
  padding-left: 18px;
  font-size: 13px;
}

.save-error,
.save-ok {
  margin: 12px 16px 0;
  font-size: 13px;
}

.section-actions {
  padding: 0 16px;
}

.save-spinner,
.test-spinner {
  width: 14px;
  height: 14px;
  margin-inline-end: 6px;
}

.footnote {
  margin: 24px 16px 0;
  font-size: 12px;
}
</style>
