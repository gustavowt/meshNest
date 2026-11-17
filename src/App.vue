<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { onMounted } from 'vue';
import { useIndexingStore } from '@/stores/indexingStore';
import { useSettingsStore } from '@/stores/settingsStore';

const indexing = useIndexingStore();
const settings = useSettingsStore();

onMounted(async () => {
  await settings.loadSettings();
  void indexing.indexNewFilesOnBoot(settings.state.draft?.libraryFolder);
});
</script>
