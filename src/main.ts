import { createApp } from 'vue'
import App from './App.vue'
import router from './router';
import i18n from './i18n';

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

/* import '@ionic/vue/css/palettes/dark.system.css'; */

/* Theme variables */
import './theme/variables.css';

const app = createApp(App)
  .use(IonicVue)
  .use(i18n)
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
    import('@/services/indexing/indexDirectory'),
    import('@/services/indexing/desktopIndexingDeps'),
    import('@/services/search/semanticSearch'),
    import('@/services/llm/bridgeEmbeddingProvider'),
  ]).then(([thumbnails, indexing, directory, deps, search, embedding]) => {
    (window as unknown as Record<string, unknown>).__meshNestDiagnostics = {
      renderAndStoreModelViews: thumbnails.renderAndStoreModelViews,
      indexScannedFile: async (file: import('@/types/modelFile').ScannedFile, projectId: string) =>
        indexing.indexModelFile(file, projectId, await deps.createDesktopIndexingDeps()),
      indexDirectory: async (
        path: string,
        projectId: string,
        options?: import('@/services/indexing/indexDirectory').IndexFilesOptions,
      ) => directory.indexDirectory(path, projectId, await deps.createDesktopIndexingDeps(), options),
      semanticSearch: async (query: string, limit?: number) =>
        search.semanticSearch(
          query,
          search.createDesktopSearchDeps(await embedding.createBridgeEmbeddingProvider()),
          { limit },
        ),
    }
  })
}
