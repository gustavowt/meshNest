import { createApp } from 'vue'
import App from './App.vue'
import router from './router';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
import '@ionic/vue/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

const app = createApp(App)
  .use(IonicVue)
  .use(router);

router.isReady().then(() => {
  app.mount('#app');
});

// Diagnostics hook for the desktop shell: lets integration checks (and
// support tooling) exercise the indexing/rendering pipeline without UI wiring.
if (window.meshNest) {
  Promise.all([
    import('@/services/rendering/thumbnailService'),
    import('@/services/indexing/indexModelFile'),
    import('@/services/indexing/bridgeBackend'),
    import('@/services/llm/mockVisionProvider'),
    import('@/services/llm/mockEmbeddingProvider'),
  ]).then(([thumbnails, indexing, bridge, vision, embedding]) => {
    ;(window as unknown as Record<string, unknown>).__meshNestDiagnostics = {
      renderAndStoreModelViews: thumbnails.renderAndStoreModelViews,
      indexScannedFile: (file: import('@/types/modelFile').ScannedFile, projectId: string) =>
        indexing.indexModelFile(file, projectId, {
          backend: bridge.createBridgeIndexingBackend(),
          visionProvider: new vision.MockVisionProvider(),
          embeddingProvider: new embedding.MockEmbeddingProvider(),
        }),
    }
  })
}
