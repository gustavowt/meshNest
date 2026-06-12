<template>
  <ion-badge :color="config.color" class="status-badge">{{ config.label }}</ion-badge>
</template>

<script setup lang="ts">
import { IonBadge } from '@ionic/vue'
import { computed } from 'vue'
import type { ModelFileStatus } from '@/types/modelFile'

const props = defineProps<{
  status: ModelFileStatus
}>()

const STATUS_CONFIG: Record<ModelFileStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'medium' },
  indexed: { label: 'Indexed', color: 'success' },
  failed: { label: 'Failed', color: 'danger' },
  skipped: { label: 'Skipped', color: 'medium' },
}

const config = computed(() => STATUS_CONFIG[props.status])
</script>

<style scoped>
.status-badge {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
</style>
