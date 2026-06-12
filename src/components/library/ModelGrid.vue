<template>
  <div class="model-grid">
    <model-card
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      @select="emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { LibraryEntry } from '@/types/library'
import ModelCard from './ModelCard.vue'

defineProps<{
  entries: LibraryEntry[]
}>()

const emit = defineEmits<{
  select: [entry: LibraryEntry]
}>()
</script>

<style scoped>
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px;
}
</style>
