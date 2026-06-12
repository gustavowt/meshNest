<template>
  <ion-searchbar
    :value="modelValue"
    placeholder="Describe what you're looking for…"
    inputmode="search"
    :debounce="0"
    show-clear-button="focus"
    @ion-input="emit('update:modelValue', $event.detail.value ?? '')"
    @keyup.enter="emit('search', modelValue)"
    @ion-clear="emit('update:modelValue', '')"
  />
</template>

<script setup lang="ts">
import { IonSearchbar } from '@ionic/vue'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [query: string]
}>()
</script>
