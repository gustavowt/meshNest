<template>
  <ion-badge :color="color" class="status-badge">{{ t('status.' + status) }}</ion-badge>
</template>

<script setup lang="ts">
import { IonBadge } from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModelFileStatus } from '@/types/modelFile'

const props = defineProps<{
  status: ModelFileStatus
}>()

const { t } = useI18n()

const STATUS_COLORS: Record<ModelFileStatus, string> = {
  pending: 'medium',
  indexed: 'success',
  failed: 'danger',
  skipped: 'medium',
}

const color = computed(() => STATUS_COLORS[props.status])
</script>

<style scoped>
.status-badge {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
</style>
