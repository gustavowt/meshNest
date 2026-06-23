<template>
  <ion-icon
    :icon="icon"
    class="status-icon"
    :class="status"
    :title="tooltip"
    :aria-label="ariaLabel"
  />
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  ellipseOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModelFileStatus } from '@/types/modelFile'

const props = defineProps<{
  status: ModelFileStatus
  errorMessage?: string
}>()

const { t } = useI18n()

const STATUS_ICONS: Record<ModelFileStatus, string> = {
  pending: timeOutline,
  indexed: checkmarkCircleOutline,
  failed: closeCircleOutline,
  skipped: ellipseOutline,
}

const icon = computed(() => STATUS_ICONS[props.status])
const statusLabel = computed(() => t('status.' + props.status))
const failedReason = computed(() =>
  props.status === 'failed' ? props.errorMessage?.trim() ?? '' : '',
)
const tooltip = computed(() => failedReason.value || statusLabel.value)
const ariaLabel = computed(() =>
  failedReason.value ? `${statusLabel.value}: ${failedReason.value}` : statusLabel.value,
)
</script>

<style scoped>
.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 3px;
  border-radius: 999px;
  color: var(--ion-color-medium);
  background: rgba(var(--ion-color-medium-rgb), 0.14);
  font-size: 18px;
}

.status-icon.indexed {
  color: var(--ion-color-success);
  background: rgba(var(--ion-color-success-rgb), 0.12);
}

.status-icon.failed {
  color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
}

.status-icon.pending,
.status-icon.skipped {
  opacity: 0.82;
}
</style>
