<template>
  <ion-text v-if="result" :color="result.ok ? 'success' : 'danger'">
    <p class="test-result">
      <ion-icon :icon="result.ok ? checkmarkCircleOutline : closeCircleOutline" />
      {{ result.message }}
    </p>
  </ion-text>
</template>

<script setup lang="ts">
import { IonIcon, IonText } from '@ionic/vue'
import { checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons'
import type { ProviderTestResult } from '@/types/providerSettings'

defineProps<{
  result: ProviderTestResult | null
}>()
</script>

<style scoped>
.test-result {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 16px 0;
  font-size: 13px;
}
</style>
