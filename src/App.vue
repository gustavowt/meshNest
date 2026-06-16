<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';

const settings = useSettingsStore();

onMounted(() => {
  settings.loadSettings();
});
</script>
