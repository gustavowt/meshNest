<template>
  <section class="content-section">
    <h2 class="section-title">{{ $t('settings.worldSearchSection.title') }}</h2>
    <p class="section-description">{{ $t('settings.worldSearchSection.desc') }}</p>

    <ion-list inset>
      <ion-item>
        <ion-input
          :label="$t('settings.worldSearchSection.limitPerProvider')"
          label-placement="fixed"
          type="number"
          :value="String(worldSearch.limitPerProvider)"
          @ion-input="updateLimit($event.detail.value)"
        />
      </ion-item>
    </ion-list>

    <h3 class="subsection-title">{{ $t('settings.worldSearchSection.imageResearchTitle') }}</h3>
    <p class="section-description">{{ $t('settings.worldSearchSection.imageResearchDesc') }}</p>
    <ion-list inset class="provider-list">
      <ion-item class="provider-header">
        <ion-toggle
          :checked="worldSearch.imageResearch.enabled"
          @ion-change="setImageResearchEnabled($event.detail.checked === true)"
        >
          {{ $t('settings.worldSearchSection.googleVisionWebDetection') }}
        </ion-toggle>
      </ion-item>
      <ion-item v-if="worldSearch.imageResearch.enabled">
        <ion-input
          :label="$t('settings.worldSearchSection.googleVisionApiKey')"
          label-placement="fixed"
          type="password"
          :value="worldSearch.imageResearch.credentials.apiKey ?? ''"
          @ion-input="setImageResearchApiKey($event.detail.value ?? '')"
        />
      </ion-item>
      <ion-item v-if="worldSearch.imageResearch.enabled" lines="none" class="setup-item">
        <div class="provider-guide image-research-guide">
          <div class="guide-header">
            <div>
              <p class="guide-kicker">{{ $t('settings.worldSearchSection.imageResearchKicker') }}</p>
              <h4>{{ $t('settings.worldSearchSection.googleVisionWebDetection') }}</h4>
            </div>
            <ion-badge color="primary" class="auth-badge">
              {{ $t('settings.worldSearchSection.apiKeyRequired') }}
            </ion-badge>
          </div>
          <p class="provider-description">{{ $t('settings.worldSearchSection.googleVisionDesc') }}</p>
          <p class="provider-link">
            <a
              href="https://console.cloud.google.com/apis/library/vision.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              {{ $t('settings.worldSearchSection.googleVisionApiLink') }}
            </a>
          </p>
          <p class="setup-title">{{ $t('settings.worldSearchSection.setupSteps') }}</p>
          <ol class="setup-steps">
            <li>{{ $t('settings.worldSearchSection.googleVisionStep1') }}</li>
            <li>{{ $t('settings.worldSearchSection.googleVisionStep2') }}</li>
            <li>{{ $t('settings.worldSearchSection.googleVisionStep3') }}</li>
            <li>{{ $t('settings.worldSearchSection.googleVisionStep4') }}</li>
          </ol>
        </div>
      </ion-item>
    </ion-list>

    <h3 class="subsection-title">{{ $t('settings.worldSearchSection.modelProviders') }}</h3>
    <p class="section-description">{{ $t('settings.worldSearchSection.modelProvidersDesc') }}</p>
    <ion-list inset class="provider-list">
      <ion-item
        v-for="providerId in mainProviderIds"
        :key="providerId"
        class="provider-header"
      >
        <ion-toggle
          :checked="worldSearch.providers[providerId].enabled"
          @ion-change="setEnabled(providerId, $event.detail.checked === true)"
        >
          {{ WORLD_SEARCH_PROVIDERS[providerId].label }}
        </ion-toggle>
      </ion-item>
    </ion-list>

  </section>
</template>

<script setup lang="ts">
import { IonBadge, IonInput, IonItem, IonList, IonToggle } from '@ionic/vue'
import { computed } from 'vue'
import {
  MAIN_WORLD_SEARCH_PROVIDER_IDS,
  WORLD_SEARCH_PROVIDERS,
} from '@/services/world-search/providerMetadata'
import { DEFAULT_WORLD_SEARCH_SETTINGS } from '@/services/settings/worldSearchSettings'
import type { WorldSearchSettings } from '@/types/worldSearch'
import type { WorldSearchProviderId } from '@/types/worldSearch'

const props = defineProps<{
  modelValue: WorldSearchSettings
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WorldSearchSettings]
  dirty: []
}>()

const worldSearch = computed(() => props.modelValue)
const mainProviderIds = MAIN_WORLD_SEARCH_PROVIDER_IDS

function clone(): WorldSearchSettings {
  return JSON.parse(JSON.stringify(props.modelValue ?? DEFAULT_WORLD_SEARCH_SETTINGS))
}

function emitUpdate(next: WorldSearchSettings): void {
  emit('update:modelValue', next)
  emit('dirty')
}

function setEnabled(providerId: WorldSearchProviderId, enabled: boolean): void {
  const next = clone()
  next.providers[providerId].enabled = enabled
  emitUpdate(next)
}

function updateLimit(value: string | null | undefined): void {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return
  }
  const next = clone()
  next.limitPerProvider = Math.min(parsed, 24)
  emitUpdate(next)
}

function setImageResearchEnabled(enabled: boolean): void {
  const next = clone()
  next.imageResearch.enabled = enabled
  emitUpdate(next)
}

function setImageResearchApiKey(value: string): void {
  const next = clone()
  next.imageResearch.credentials = {
    ...next.imageResearch.credentials,
    apiKey: value,
  }
  emitUpdate(next)
}

</script>

<style scoped>
.subsection-title {
  margin: 24px 16px 8px;
  font-size: 1rem;
  color: var(--ion-text-color);
}

.provider-list {
  background: transparent;
}

.provider-header {
  --min-height: 56px;
}

.provider-header ion-toggle {
  font-size: 1rem;
  font-weight: 650;
}

.setup-item {
  --padding-top: 0;
  --padding-bottom: 14px;
}

.provider-guide {
  width: 100%;
  margin: 6px 0 12px;
  padding: 18px;
  border: 1px solid rgba(56, 128, 255, 0.18);
  border-radius: 18px;
  background:
    radial-gradient(circle at 24px 20px, rgba(56, 128, 255, 0.12), transparent 120px),
    rgba(var(--ion-color-light-rgb), 0.7);
}

.image-research-guide {
  border-color: rgba(var(--ion-color-primary-rgb), 0.28);
}

.guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.guide-kicker {
  margin: 0 0 4px;
  color: var(--ion-color-medium);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.guide-header h4 {
  margin: 0;
  color: var(--ion-text-color);
  font-size: 1.18rem;
  line-height: 1.25;
}

.auth-badge {
  flex: 0 0 auto;
  margin-top: 2px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
}

.provider-description {
  margin: 0;
  color: var(--ion-text-color);
  font-size: 0.98rem;
  line-height: 1.5;
}

.provider-link {
  margin: 12px 0 0;
  font-size: 0.95rem;
  font-weight: 700;
}

.provider-link a {
  color: var(--ion-color-primary);
  text-decoration: none;
}

.provider-link a:hover {
  text-decoration: underline;
}

.setup-title {
  margin: 16px 0 8px;
  color: var(--ion-color-medium);
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.setup-steps {
  margin: 8px 0 0;
  padding-left: 22px;
  color: var(--ion-text-color);
  font-size: 0.96rem;
  line-height: 1.55;
}

.setup-steps li + li {
  margin-top: 8px;
}

@media (max-width: 640px) {
  .guide-header {
    flex-direction: column;
  }

  .auth-badge {
    align-self: flex-start;
  }
}
</style>
