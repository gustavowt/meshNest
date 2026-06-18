# DEVELOPER.md

Developer reference for meshNest. Keep this file updated when features are added or important changes are made.

## What the project is

A local-first desktop app that scans user-selected directories for `.stl` and `.3mf` files, extracts geometry/package metadata, renders deterministic preview images, asks a vision-capable LLM for a structured description, embeds that description, and stores everything in DuckDB for semantic search.

Execution follows `roadmap.md` phase by phase. Completed phases are marked `[x]` in the roadmap.

## Stack

- **UI**: Ionic 8 + Vue 3 (script setup, TypeScript) + Vue Router, built with Vite.
- **Desktop shell**: Electron (main + preload). All filesystem and database access stays in the Electron main process and is exposed to the UI through a typed preload bridge.
- **3D**: Three.js (`STLLoader`, `ThreeMFLoader`) for loading, preview, and offscreen multi-view rendering.
- **3MF package parsing**: `fflate` (ZIP) + `fast-xml-parser` (XML), independent from the Three.js loader.
- **Database**: DuckDB via `@duckdb/node-api` with the VSS extension (HNSW index) for vector search.
- **Validation**: `zod` for LLM JSON output.
- **Tests**: Vitest (`tests/unit`), Cypress (`tests/e2e`).

## Project structure (current)

```text
src/
  views/            Ionic pages
  router/           Vue Router setup
  theme/            Ionic theme variables
  types/            Shared domain types (barrel: src/types/index.ts)
  services/
    database/       DuckDB client, schema, migrations (Node-context only)
    filesystem/     Directory scanner, file hashing, supported file helpers (Node-context only)
electron/
  main/             Electron main process entry + IPC handlers
  preload/          contextBridge preload exposing window.meshNest
tests/
  unit/             Vitest specs
  e2e/              Cypress specs
roadmap.md          Phase-by-phase execution plan (source of truth for scope)
```

## Electron integration

- `vite-plugin-electron/simple` builds `electron/main/index.ts` to `dist-electron/main.js` (ESM) and `electron/preload/index.ts` to `dist-electron/preload.cjs` (CJS — the preload must stay CJS because the root package is `"type": "module"` and sandboxed preloads cannot run ESM).
- The Electron plugin is disabled when `process.env.VITEST` is set so unit tests don't launch Electron.
- `npm run dev` starts Vite and launches Electron against the dev server; `npm run build` also produces `dist-electron/`.
- Native modules (`@duckdb/node-api`) are externalized in the main-process bundle.
- The preload exposes a typed `window.meshNest` API; its contract lives in `src/types/electronApi.ts`. UI must feature-detect `window.meshNest` (it is undefined in a plain browser).

The target structure for services, types, Electron main/preload, and components is documented in `roadmap.md` ("Suggested Directory Structure") and will be created as phases are executed.

## Completed phases

### Phase 1 - Install Dependencies

- Installed `three`, `fflate`, `fast-xml-parser`, `zod`, `@duckdb/node-api` (runtime) and `@types/three`, `electron`, `vite-plugin-electron` (dev).
- Verified DuckDB VSS extension loads and an HNSW index can be created (`INSTALL vss; LOAD vss;`).
- File hashing will use Node's built-in `crypto`; no extra dependency.
- `tests/unit/dependencies.spec.ts` smoke-tests that all Phase 1 libraries import and work.
- Dependency rationale table lives in `README.md`.

### Phase 2 - Core Types and Contracts

- `src/types/` holds the shared domain types, re-exported from `src/types/index.ts`:
  - `modelFile.ts`: `SUPPORTED_MODEL_EXTENSIONS`, `SupportedModelExtension`, `isSupportedModelExtension`, `ModelFileStatus`, `ModelFile` (persisted), `DiscoveredFile` (scanner output).
  - `modelMetadata.ts`: `GeometryMetadata` (mm units), `ThreeMfPackageMetadata`.
  - `modelRender.ts`: `RENDER_VIEW_NAMES`, `RenderViewName`, `ModelRenderAsset`.
  - `indexing.ts`: `IndexingJob`, `IndexingJobType`, `IndexingJobStatus`, `IndexingProgress`, `IndexingResult`.
  - `llm.ts`: `AIModelDescription`, `ModelEmbedding`, `VisionImageInput`.
  - `search.ts`: `SearchResult`, `SearchFilters`, `SearchQuery`.
- Types are plain data shapes (no behavior) so services can import them without circular dependencies.

### Phase 3 - Database Schema and Migrations

- `src/services/database/duckdbClient.ts`: `DuckDbClient` wrapper around `@duckdb/node-api`. `DuckDbClient.open(path)` loads the VSS extension and enables HNSW persistence. `run()` executes statements, `all()` returns JSON-compatible row objects. Node-context only (Electron main / tests).
- `src/services/database/schema.ts`: idempotent DDL for `model_files`, `geometry_metadata`, `three_mf_metadata`, `model_render_assets`, `ai_model_descriptions`, `model_embeddings`, `indexing_jobs`, `settings`, secondary indexes, and the HNSW cosine index. `EMBEDDING_DIMENSIONS = 1536` is the single source of truth for the vector dimension.
- `src/services/database/migrations.ts`: ordered `MIGRATIONS` list tracked in a `schema_migrations` table; `runMigrations(client)` applies pending migrations and is safe to call repeatedly.
- DuckDB binding notes: named parameters use `$name`; `TEXT[]` values must be wrapped with `listValue(...)` and `FLOAT[n]` vectors with `arrayValue(...)` from `@duckdb/node-api`.
- Tests: `tests/unit/migrations.spec.ts` (fresh DB, double-run safety, embedding dimension, HNSW index + cosine search on a persisted DB). Database tests use `// @vitest-environment node`.

### Phase 4 - Filesystem Access and Directory Scanner

- Bootstrapped the Electron layer (see "Electron integration" above): `electron/main/index.ts` creates the window and registers IPC; `electron/main/ipc/filesystemIpc.ts` handles `filesystem:pickDirectory`, `filesystem:scanDirectory` (with per-scan `AbortController` and `filesystem:scanProgress` events), and `filesystem:cancelScan`.
- `src/services/filesystem/supportedFiles.ts`: ignored-directory set, hidden-name check, case-insensitive `.stl`/`.3mf` extension detection.
- `src/services/filesystem/directoryScanner.ts`: recursive scan returning `DiscoveredFile[]`, deterministic (codepoint-sorted), cancellable via `AbortSignal` (`ScanCancelledError`), progress callback per found file.
- `src/services/filesystem/fileHash.ts`: streaming SHA-256 `hashFile` + `hashBuffer`.
- The scan IPC handler enriches results with content hashes and returns `ScannedFile[]`.
- `src/views/HomePage.vue` provides the minimal select-directory + scan UI (will be replaced by the Library/Indexing pages in later phases).
- Tests: `tests/unit/directoryScanner.spec.ts` (recursion, ignore rules, determinism, progress, cancellation, hashing).

### Phase 5 - Model File Repository

- `src/services/database/modelFileRepository.ts`: `ModelFileRepository` class wrapping a `DuckDbClient`. Methods: `upsertModelFile` (insert as pending / reset changed files to pending / return unchanged as-is), `findByPath`, `findById`, `findByHash`, `listModelFiles`, `listPendingFiles`, `markIndexed`, `markFailed`, `shouldReindexFile`.
- Change detection compares content hash, modified timestamp, and size. `shouldReindexFile` also returns true for any non-`indexed` status.
- Timestamps are stored as DuckDB TIMESTAMP (UTC, no timezone suffix) and mapped back to ISO strings in `ModelFile`.
- Tests: `tests/unit/modelFileRepository.spec.ts`.

### Phase 6 - STL Loading and Geometry Metadata

- `src/services/model-parsing/modelScene.ts`: `ModelScene` (normalized `{ root: Object3D, source: 'stl' | '3mf' }` shared by preview/renderer/metadata) and `ModelParseError`.
- `src/services/model-parsing/stlLoaderService.ts`: `loadStlScene(content)` parses binary/ASCII STL via Three.js `STLLoader.parse`, wraps the geometry in a Group, throws `ModelParseError` on invalid/empty content. STL is geometry-only.
- `src/services/model-parsing/geometryMetadata.ts`: `extractGeometryMetadata(scene)` computes bounding-box dimensions (mm), triangle/vertex/mesh/object counts. Volume, surface area, and watertightness remain undefined placeholders.
- `src/services/database/geometryMetadataRepository.ts`: `GeometryMetadataRepository.upsert/getByModelFileId` (delete+insert upsert).
- Tests: `tests/unit/stlLoaderService.spec.ts` with fixture builders in `tests/unit/helpers/stlFixtures.ts` (ASCII + binary STL generators).

### Phase 7 - 3MF Package Parsing

- `src/services/model-parsing/threeMfPackageParser.ts`: `parseThreeMfPackage(bytes)` opens the `.3mf` as ZIP (fflate), resolves the model part via `_rels/.rels` (falling back to `3D/3dmodel.model`), and extracts object names, material names, display colors, thumbnail path (relationship or `model@thumbnail`), plus a raw-metadata JSON blob for debugging. Missing optional metadata never throws; invalid ZIP or missing model part throws `ModelParseError`. Independent from `ThreeMFLoader`.
- `src/services/database/threeMfMetadataRepository.ts`: `ThreeMfMetadataRepository.upsert/getByModelFileId`.
- `DuckDbClient.run/all` now accept an optional `types` record (e.g. `LIST(VARCHAR)`) — required when binding empty list parameters.
- Tests: `tests/unit/threeMfPackageParser.spec.ts` with the package builder in `tests/unit/helpers/threeMfFixtures.ts` (generates valid in-memory 3MF packages, also used by later phases).

### Phase 8 - 3MF Scene Loading

- `src/services/model-parsing/threeMfLoaderService.ts`: `loadThreeMfScene(content)` parses 3MF via Three.js `ThreeMFLoader.parse` into a `ModelScene`, validates that at least one mesh exists, and throws `ModelParseError` otherwise. Loader-preserved materials/colors are kept. Unsupported features surface as loader console warnings only.
- Important constraint: `ThreeMFLoader` needs `DOMParser`, so this service requires a DOM context (Electron renderer or jsdom in tests) — it cannot run in the bare main process. Its tests therefore use the default jsdom environment, not `node`.
- `extractGeometryMetadata` works unchanged on 3MF scenes (verified for single- and multi-object packages including transforms).

### Phase 9 - Model Normalization

- `src/services/model-parsing/modelNormalizer.ts`:
  - `normalizeModelScene(scene)` wraps the loaded scene in a group, rotates it -90° around X (3D-printing Z-up to Three.js Y-up), and centers it at the origin. The source object/geometry is never mutated (only the wrapper transforms). Returns `NormalizedModel` with bounding box/sphere, normalized `size`, `maxDimension`, and `originalSize` (pre-orientation dimensions for metadata).
  - `computeCameraDistance(model, fov)` fits the bounding sphere into the vertical FOV with a 1.4 safety margin.
  - `getCameraPlacement(model, direction, fov)` returns deterministic `{ position, target, near, far }` for any view direction — shared by the preview component (Phase 10) and the multi-view renderer (Phase 12).
- Tests: `tests/unit/modelNormalizer.spec.ts` (centering, orientation, non-mutation, determinism, STL + 3MF, camera fit proportionality).

### Phase 10 - 3D Preview Component

- `src/components/model/ModelPreview3D.vue`: reusable interactive preview for STL/3MF. Props: `filePath`, `extension`. Reads bytes through `window.meshNest.readModelFile`, loads via the **async worker loaders** (`loadStlSceneAsync` / `loadThreeMfSceneAsync`), normalizes via Phase 9, renders with `WebGLRenderer` + `OrbitControls`, ambient + key/fill directional lights, deterministic camera fit. Handles loading/error states (including missing bridge and WebGL failures), resizes via `ResizeObserver`, and disposes renderer/controls/geometries/materials on unmount and on reload.
- Responsiveness: parsing runs off the renderer main thread in a Web Worker; the component then `yieldToBrowser()`s (one `requestAnimationFrame`) before the synchronous WebGL setup so the loading overlay paints before the unavoidable GPU upload on first render. A `loadGeneration` counter bails out of stale loads after each `await`, so rapid navigation/prop changes never leave a half-built scene.
- Off-thread loaders (renderer-only, used only by the preview):
  - `stlLoaderService.loadStlSceneAsync(content)` parses STL in `stlParser.worker.ts` (STLLoader works in a worker) and transfers back position/normal arrays + precomputed bounds.
  - `threeMfLoaderService.loadThreeMfSceneAsync(content)` parses 3MF in `threeMfParser.worker.ts` (a DOM-free regex parser, since `ThreeMFLoader` needs `DOMParser`/`querySelectorAll` which workers lack) and reconstructs the scene on the main thread from the worker's `{ objects, buildItems }` payload: each object becomes a `Mesh` (default material, geometry-only) or a `Group` of transformed component references; build items (or all renderable objects when `<build>` is absent) are added under the root with their transforms applied. Geometry-only, like the STL preview — loader-preserved 3MF materials/colors are only available via the synchronous `loadThreeMfScene` used by the indexing/render pipeline.
  - **Production extension support (required for Bambu/OrcaSlicer 3MF):** geometry is frequently split across multiple `3D/Objects/object_*.model` parts referenced by `p:path` from assembly objects/build items. The worker resolves the root model via `_rels/.rels` (then `3D/3dmodel.model`, then any `.model`), recursively parses every referenced part, and keys objects globally as `<zip path>#<local id>` (object ids are only unique per part), rewriting all component/build-item references to those global keys before transferring. Verified against real Bambu Studio packages (split parts + single-file multi-object).
- The synchronous `loadStlScene` / `loadThreeMfScene` remain the path for indexing + offscreen rendering (`indexModelFile`, `thumbnailService`).
- New IPC: `filesystem:readModelFile` (rejects non-.stl/.3mf paths); exposed as `window.meshNest.readModelFile`.
- `HomePage.vue` opens a preview modal when a scanned file is clicked (temporary entry point until the detail page in Phase 18).
- Tests: `tests/unit/modelPreview3D.spec.ts` (state machine, reload on prop change). IPC + WebGL availability verified manually in Electron via CDP.

### Phase 11 - Render Asset Storage

- `electron/main/services/appDataPaths.ts`: app-data locations under Electron `userData` — `getDatabasePath()` (`meshnest.duckdb`) and `getModelRendersRoot()` (`model-renders/`). Generated data never lives next to source models.
- `src/services/rendering/renderAssetStorage.ts`: `RenderAssetStorage(rendersRoot)` saves PNGs at `<root>/<model-file-id>/<view>.png` (deterministic, stable paths), `clearModelRenders` removes a model's folder before reindexing, `listModelRenderFiles` for consistency checks. Takes the root as a constructor argument so it is testable without Electron.
- `src/services/database/renderAssetRepository.ts`: `RenderAssetRepository.replaceForModelFile` (delete+insert keeps DB aligned with disk), `listByModelFileId`, `findThumbnail`, `deleteByModelFileId`.
- Tests: `tests/unit/renderAssetStorage.spec.ts` (stable paths, restart survival, clearing, overwrite, DB/disk alignment).

### Phase 12 - Thumbnail and Multi-View Rendering

- `src/services/rendering/renderViews.ts`: deterministic `RENDER_VIEW_DEFINITIONS` (thumbnail 256px + front/back/left/right/top/perspective 512px) with per-view direction and up vectors.
- `src/services/rendering/modelRenderer.ts`: `renderModelViews(normalizedModel, options)` renders all views offscreen with `WebGLRenderer` (pixelRatio 1, antialias, preserveDrawingBuffer), neutral `#f1f2f4` background (configurable, `'transparent'` supported), ambient + camera-following key light, returns PNG bytes per view. Renders are byte-deterministic across app restarts (verified). Runs only in a WebGL context (Electron renderer); isolated so the host can change later.
- `src/services/rendering/thumbnailService.ts`: `renderAndStoreModelViews(modelFileId, filePath, extension)` — renderer-process orchestrator (read via bridge -> load -> normalize -> render -> persist via IPC).
- `electron/main/ipc/renderingIpc.ts`: `rendering:saveRenderAssets` clears stale renders, writes PNGs through `RenderAssetStorage`, replaces DB records. Exposed as `window.meshNest.saveRenderAssets`.
- `electron/main/services/database.ts`: lazy singleton app DB (userData/meshnest.duckdb) with migrations on first use.
- Architecture note: parsing + rendering run in the renderer process (DOMParser + WebGL); main owns FS/DB. The indexing pipeline therefore also runs renderer-side and talks through IPC.
- Fixes required for packaged loading: removed `<base href="/">` from `index.html` and switched the router to hash history (file:// compatible).
- `src/main.ts` exposes `window.__meshNestDiagnostics.renderAndStoreModelViews` in the desktop shell for integration checks.
- Tests: `tests/unit/renderViews.spec.ts`; full STL+3MF render/store verified in Electron via CDP (file output, DB records, determinism).

### Phase 13 - Mock Vision Provider

- `src/services/llm/visionProvider.ts`: `VisionProvider` interface (`name`, `model`, `describeModel(input)`), with `VisionAnalysisInput` carrying filename, extension, rendered images, geometry, and optional 3MF package metadata. The pipeline depends only on the interface.
- `src/services/llm/prompts.ts`: `VISION_PROMPT` (strict-JSON instruction) and `SUGGESTED_CATEGORIES`.
- `src/services/llm/jsonValidation.ts`: `aiModelDescriptionSchema` (zod) and `validateVisionResponse(stringOrObject)` throwing `VisionValidationError` with readable issue paths.
- `src/services/llm/mockVisionProvider.ts`: `MockVisionProvider` — deterministic descriptions derived from filename/extension/geometry, validated through the same schema before returning; uses 3MF object names when present.
- `src/services/database/aiDescriptionRepository.ts`: `AiDescriptionRepository.upsert/getByModelFileId` storing the validated description plus the raw response JSON.
- Tests: `tests/unit/visionProvider.spec.ts`.

### Phase 14 - Mock Embedding Provider

- `src/services/llm/embeddingProvider.ts`: `EmbeddingProvider` interface (`name`, `model`, `dimensions`, `embedText`) and `buildEmbeddingSourceText(description)` — the canonical, stable embedding text format.
- `src/services/llm/mockEmbeddingProvider.ts`: `MockEmbeddingProvider` — deterministic feature-hashing embeddings (1536 dims, normalized); texts sharing tokens produce similar vectors so mock semantic search behaves plausibly.
- `src/services/database/embeddingRepository.ts`: `EmbeddingRepository.upsert/getByModelFileId/countEmbeddings`; throws `EmbeddingDimensionError` when vector length does not match `EMBEDDING_DIMENSIONS`.
- Tests: `tests/unit/embeddingProvider.spec.ts` (format, determinism, normalization, relatedness, dimension guard, persistence).

### Phase 15 - Indexing Pipeline

- `src/services/indexing/indexingBackend.ts`: `IndexingBackend` — the persistence contract the pipeline needs (upsert, read bytes, store geometry/3MF metadata/renders/description/embedding, mark indexed/failed).
- `src/services/indexing/indexModelFile.ts`: `indexModelFile(file, projectId, deps)` runs the full per-file pipeline. Skips when the upserted record is already `indexed` (unchanged); any step failure marks the file `failed` with a persisted reason and returns a result instead of throwing. The render function is injectable (tests use a fake; production defaults to the WebGL renderer).
- `src/services/indexing/bridgeBackend.ts`: `createBridgeIndexingBackend()` — production backend forwarding everything to main over IPC.
- `electron/main/ipc/databaseIpc.ts`: `database:*` handlers (upsertModelFile, listModelFiles, storeGeometryMetadata, storeThreeMfMetadata, storeAiDescription, storeEmbedding, markIndexed, markFailed) over the shared DB client; all exposed on `window.meshNest`.
- Diagnostics hook gained `indexScannedFile(file, projectId)` (mock providers + bridge backend).
- Tests: `tests/unit/indexModelFile.spec.ts` (STL + 3MF end-to-end against real repositories with an in-process backend, failure persistence, skip-unchanged, reindex-changed, failure isolation). Full pipeline also verified inside Electron (real WebGL + IPC): scan -> index -> skipped on second run, failed file retried with stored reason.

### Phase 16 - Directory Indexing Queue

- `src/services/indexing/indexQueue.ts`: `processIndexQueue(items, worker, options)` — generic bounded-concurrency queue (default 2) with progress snapshots (`IndexingProgress`), cooperative cancellation via `AbortSignal` (in-flight items finish, queued items stay pending), and conversion of unexpected worker throws into failed results. Returns one result slot per input item in input order.
- `src/services/indexing/indexDirectory.ts`:
  - `indexScannedFiles(files, projectId, deps, options)` — runs `indexModelFile` for each file through the queue; persists one `indexing_jobs` row per file (`queued -> running -> succeeded|failed|cancelled`) via the injectable `IndexingJobTracker`; returns `{ summary, resultsByPath }` where the summary covers total/indexed/skipped/failed/pending/cancelled.
  - `indexDirectory(directory, projectId, deps, options)` — scans through the bridge, then indexes everything.
  - `retryFailedFiles(files, previousResults, ...)` — re-runs only files whose previous result was `failed`, recorded as `retry` jobs.
- `src/services/database/indexingJobRepository.ts`: `create`, `markRunning`, `finish`, `listRecent`, `countByStatus` over the `indexing_jobs` table.
- IPC: `database:createIndexingJob` / `markIndexingJobRunning` / `finishIndexingJob` / `listIndexingJobs`; `createBridgeJobTracker()` in `bridgeBackend.ts` is the production tracker. Progress events flow as renderer-side callbacks (no IPC needed: the queue runs in the renderer).
- Diagnostics hook gained `indexDirectory(path, projectId, options)`.
- Test helpers shared between indexing specs: `tests/unit/helpers/indexingTestUtils.ts` (in-process backend, job tracker, fake renderer, scanned-file factory).
- Tests: `tests/unit/indexDirectory.spec.ts` (concurrency bound, progress snapshots, cancellation, throw containment, summary accuracy, job persistence with error reasons, skip-on-rerun, cancelled-job bookkeeping, retry semantics). Verified in Electron: directory with nested + broken files indexed with concurrency 2, accurate summary, and persisted job history.

### Phase 17 - Library UI

- `src/types/library.ts`: `LibraryEntry` (file record + AI summary + thumbnail path) and `LibrarySortKey`.
- `src/services/database/libraryRepository.ts`: `listLibraryEntries(projectId?)` — read model joining `model_files` with `ai_model_descriptions` and the thumbnail row of `model_render_assets`.
- Stores (plain Vue reactive singletons, no pinia):
  - `src/stores/libraryStore.ts` — entries, loading/error/loaded flags, sort key, client-side sorting (filename asc; modified/indexed desc with unindexed last). All bridge access lives in the store.
  - `src/stores/indexingStore.ts` — owns one indexing run (scan + queue): progress, summary, cancel (AbortController), and retry of failed files (merges retry results so repeated retries only pick still-failing files).
- `src/services/indexing/desktopIndexingDeps.ts`: `createDesktopIndexingDeps()` — production wiring (bridge backend + job tracker + mock providers); used by the indexing store and the diagnostics hook.
- Components (`src/components/library/`): `ModelCard.vue` (thumbnail or placeholder, AI short name with filename subtitle, category + up to 3 tag chips with overflow counter, status badge, error message on failed cards), `ModelGrid.vue` (responsive auto-fill grid), `IndexingStatusBadge.vue` (color-coded per `ModelFileStatus`).
- `src/composables/useRenderAssetUrl.ts`: loads render PNG bytes over the bridge and exposes a managed object URL (revoked on change/unmount).
- `src/views/LibraryPage.vue`: default route (`/` redirects to `/library`). Header has sort select + "Index folder" button; an in-header progress bar with current file and cancel appears while indexing; run summary line with "Retry n failed" button; loading / error / empty states; clicking a card opens the interactive `ModelPreview3D` modal. Library reloads automatically when a run finishes.
- IPC additions: `database:listLibraryEntries`; `rendering:readRenderAsset` (validates the requested path is inside the renders root before reading).
- Tests: `tests/unit/libraryRepository.spec.ts` (joined entries for indexed/failed files, project filter), `tests/unit/libraryStore.spec.ts` (bridge loading, error states, all three sort orders), `tests/unit/modelCard.spec.ts` (title fallback, tag overflow, status badge, failed state, placeholder, select event). Verified in Electron: empty state -> index 3 fixtures -> reload (restart equivalent) shows 3 cards with 2 blob thumbnails, AI names, chips, and the failed card's error.

### Phase 18 - Model Detail UI

- `src/types/modelDetail.ts`: `ModelDetail` — aggregate of file record, geometry, 3MF metadata, AI description, and render assets.
- `src/services/database/modelDetailService.ts`: `getModelDetail(client, id)` composes existing repositories (3MF metadata only included for `.3mf` files); returns undefined for unknown ids.
- `ModelFileRepository.resetToPending(id)` — forces a file back to `pending` so reindex bypasses the unchanged-file skip.
- IPC additions: `database:getModelDetail`, `database:resetToPending`, `filesystem:scanFile` (stat + hash one supported file, for single-file reindex), `filesystem:revealInFolder` (Electron `shell.showItemInFolder`).
- Components (`src/components/model/`): `ModelMetadataPanel.vue` (AI description with tags/print-use/style/confidence/search phrases, raw indexing error block for failed files, geometry facts with mm dimensions and counts, 3MF package section, file facts incl. absolute path), `ModelRenderGallery.vue` (all non-thumbnail views with captions), `GalleryImage.vue` (blob-URL image with placeholder).
- `src/views/ModelDetailPage.vue`: route `/models/:id`. Header has back button, status badge, "Reveal" (OS file manager), and "Reindex" (resetToPending -> scanFile -> indexModelFile -> reload detail + library). Two-column layout (interactive `ModelPreview3D` + render gallery | metadata panel) collapsing to one column under 860px; loading and not-found states.
- Library cards now navigate to the detail page (replacing the preview modal — the interactive preview lives on the detail page).
- Tests: `tests/unit/modelDetailService.spec.ts` (aggregation for STL/3MF/failed/unknown, resetToPending), `tests/unit/modelMetadataPanel.spec.ts` (file facts, geometry formatting, AI section with chips/phrases, 3MF section, hidden sections, error block). Verified in Electron: detail page shows live 3D canvas, 6 gallery images, AI + geometry + path sections; failed file shows error and reindex button re-runs the pipeline.

### Phase 19 - Semantic Search

- `src/services/database/searchRepository.ts` (main process): `searchByEmbedding(queryEmbedding, { limit, projectId })` runs the cosine-distance query over `model_embeddings` joined with file metadata, AI description, and thumbnail; results sorted ascending by distance with `score = 1 - distance / 2` (0..1). Validates query dimensions (`EmbeddingDimensionError`) and throws `NoEmbeddingsError` on an empty index. `countEmbeddings()` lets the UI detect an empty index up front.
- `src/services/search/semanticSearch.ts` (renderer-safe): `semanticSearch(query, deps, options)` trims the query (blank -> `[]`), embeds it via the provider, and delegates to the injected `searchByEmbedding` executor. `createDesktopSearchDeps(provider)` wires the IPC executor for production.
- IPC: `database:searchByEmbedding`, `database:countEmbeddings`.
- Diagnostics hook gained `semanticSearch(query, limit)`.
- IMPORTANT DuckDB gotcha (fixed here): `arrayValue(...)` without an explicit type lets DuckDB infer the list element type from leading values; sparse embedding vectors starting with `0` were inferred as integer lists and **silently stored as all zeros**. Both the embedding upsert and the search query now bind with `ARRAY(FLOAT, EMBEDDING_DIMENSIONS)`. When binding any float list/array parameter, always pass the explicit DuckDB type.
- Tests: `tests/unit/semanticSearch.spec.ts` (relevance ranking with mock providers, joined metadata + score bounds, limit, blank query, NoEmbeddingsError, dimension validation, project filter); embedding persistence test now asserts stored values roundtrip (would have caught the zero-truncation bug). Verified in Electron: empty index raises the error; after indexing three fixtures, "dragon phone stand" ranks the matching file first (score 0.92 vs 0.51).

### Phase 20 - Search UI

- `src/stores/searchStore.ts`: reactive singleton preserving the last query and results across navigation; `runSearch` (blank queries clear without searching; backend errors including the empty-index case become error state) and `refreshIndexStatus` (embedding count for the "nothing indexed" state).
- Components (`src/components/search/`): `ModelSearchBar.vue` (`ion-searchbar` wrapper, v-model + Enter-to-search), `SearchResultCard.vue` (thumbnail, AI name with filename subtitle, category/tag chips, two-line description, subtle score badge showing `score` as a percentage with cosine distance in the tooltip; prop typed `DeepReadonly<SearchResult>` so readonly store state binds directly).
- `src/views/SearchPage.vue`: route `/search`, reachable from the library header search icon. States: initial (clickable example queries), loading, nothing-indexed guidance (links back to library), backend error, no-results, and a responsive results grid. Clicking a result opens the model detail page.
- Tests: `tests/unit/searchStore.spec.ts` (search round-trip with generated query embedding, blank query, error capture, missing bridge, index status), `tests/unit/searchResultCard.spec.ts` (content, score badge + tooltip, filename fallback, select event). Verified in Electron: typed query returns ranked cards (92% top score, blob thumbnails), result click navigates to detail with live preview, and back-navigation preserves query + results.

### Phase 22 - Provider Settings

- `src/types/providerSettings.ts`: `VisionSettings` (provider, model, apiKey?, baseUrl?), `EmbeddingSettings` (adds `dimensions`), `ProviderSettings`, `ProviderTestResult`. Provider ids: vision `mock | openai | gemini | ollama`; embedding `builtin | mock | openai | gemini | ollama`.
- `src/services/settings/providerSettings.ts`: `VISION_PROVIDERS` / `EMBEDDING_PROVIDERS` metadata maps (label, needsApiKey, needsBaseUrl, default model/baseUrl/dimensions), `DEFAULT_PROVIDER_SETTINGS` (mock vision + **built-in local embedding** `Xenova/all-MiniLM-L6-v2`, 384 dims, downloaded from Hugging Face on first use), `defaultVisionSettings` / `defaultEmbeddingSettings` (provider-switch defaults), `validateProviderSettings` (human-readable problem list).
- `src/services/database/settingsRepository.ts`: generic key-value store over the `settings` table with JSON helpers; provider settings stored under the `providers` key.
- `src/services/settings/providerTester.ts`: cheap connectivity/auth checks that spend no tokens (OpenAI `GET /models`, Gemini models list, Ollama `GET /api/tags`; mock/builtin always pass). Takes an injectable `fetch` for tests.
- Main process: `electron/main/services/providerSettings.ts` (load with default merge / validated save), `electron/main/ipc/settingsIpc.ts` (`settings:getProviderSettings`, `settings:saveProviderSettings`, `settings:testVisionProvider`, `settings:testEmbeddingProvider`).
- UI: `src/stores/settingsStore.ts` (editable draft + explicit save; provider switch resets model/baseUrl to that provider's defaults but keeps the API key; state intentionally not `readonly` because the draft is a form), `src/views/SettingsPage.vue` (route `/settings`, gear icon in library header; Vision and Embedding sections with provider select, model, API key, base URL, dimensions, per-section Test connection buttons, validation problems list, re-embed warning footnote), `src/components/settings/ProviderTestBanner.vue`.
- API keys are stored plaintext in the local DuckDB settings table (explicit user decision; local-first app).
- Tests: `tests/unit/providerSettings.spec.ts` (defaults, provider-switch defaults, validation, JSON persistence round-trip/overwrite, connection testers with fake fetch). Verified in Electron: defaults round-trip, save persists, invalid save rejected over IPC, test buttons return clear success/auth-failure messages, page renders.

### Phase 23 - Real Vision Providers

- `src/services/llm/httpVisionProvider.ts`: abstract `HttpVisionProvider` base — subclasses implement one API round-trip (`requestOnce`); the base adds JSON validation with **one retry** on malformed/non-conforming responses (then `VisionProviderError`), markdown fence stripping (`stripJsonFences`), and HTTP error mapping (401/403 -> "rejected the API key", network -> "Could not reach"). `buildVisionUserText` composes the JSON prompt + filename/geometry/3MF context.
- Implementations: `openaiVisionProvider.ts` (chat completions, data-URL images, `response_format: json_object`, custom `baseUrl` for OpenAI-compatible endpoints), `geminiVisionProvider.ts` (`generateContent`, `inline_data` images, `responseMimeType: application/json`), `ollamaVisionProvider.ts` (`/api/chat`, base64 `images` array, `format: 'json'`, `stream: false`). All take an injectable `fetch`.
- `visionProviderFactory.ts`: `createVisionProvider(visionSettings)` -> mock/openai/gemini/ollama instance.
- Vision runs in the **Electron main process**: `electron/main/ipc/llmIpc.ts` registers `llm:describeModel` (loads saved settings, builds provider, describes) and `llm:getActiveVisionProvider`. API keys never reach the renderer and main-process requests bypass CORS.
- Renderer side: `src/services/llm/bridgeVisionProvider.ts` (`BridgeVisionProvider` + `createBridgeVisionProvider()`); `createDesktopIndexingDeps()` is now **async** and wires the bridge vision provider (callers must `await` it).
- Tests: `tests/unit/visionProviders.spec.ts` (payload shapes per API with fake fetch, custom base URL, retry-once then success, failure after two invalid responses, 401 mapping without retry, fence-wrapped JSON, factory selection). Verified in Electron end-to-end through the IPC path with the mock provider (no real API keys in dev); remote payloads are covered by the unit tests.

### Phase 24 - Real Embedding Providers (built-in local default)

- **Built-in local model is the default embedding service**: `electron/main/services/builtinEmbedding.ts` runs `Xenova/all-MiniLM-L6-v2` (384 dims) via `@huggingface/transformers` (transformers.js) in the Electron main process. ONNX weights (~25 MB) download from Hugging Face on first use into `userData/hf-models` and work fully offline afterwards. Pipelines are cached per model name. The dependency is marked `external` in the Electron main rollup config (like DuckDB).
- Remote providers (`src/services/llm/`): `httpEmbeddingProvider.ts` (shared base: POST/error mapping + validation that the returned vector matches the configured dimensions), `openaiEmbeddingProvider.ts` (`/embeddings`, custom baseUrl), `geminiEmbeddingProvider.ts` (`:embedContent`), `ollamaEmbeddingProvider.ts` (`/api/embeddings`). `embeddingProviderFactory.ts` selects by settings; the builtin case requires an injected `builtinFactory` (main process only).
- **Dimension-flexible embeddings table** (`src/services/database/embeddingTable.ts`): `getEmbeddingTableDimensions` reads the `FLOAT[N]` column type from information_schema; `ensureEmbeddingTable(client, dims)` drops and recreates `model_embeddings` + HNSW index when the size differs (embeddings from different providers live in different vector spaces and must be regenerated anyway). The initial migration still creates the table at 1536; `getDatabaseClient()` reconciles it with the saved settings at startup. `EmbeddingRepository`/`SearchRepository` validate against the live table width (no more fixed `EMBEDDING_DIMENSIONS` checks); `EmbeddingDimensionError` now reports actual vs expected.
- **Provider-switch flow**: `saveProviderSettings` (main) compares old/new embedding config; when provider/model/dimensions change it resizes the table or clears embeddings and returns `{ embeddingsCleared: true }`. The Settings page then shows a warning and a "Re-embed library" button. `reembedAllModels` (`electron/main/services/embeddingService.ts`) regenerates embeddings for every stored AI description with the active provider — no re-render or vision calls needed (`AiDescriptionRepository.listAll`).
- IPC: `llm:embedText`, `llm:getActiveEmbeddingProvider`, `llm:reembedAll`. Renderer uses `BridgeEmbeddingProvider` (`src/services/llm/bridgeEmbeddingProvider.ts`); both `createDesktopIndexingDeps()` and the search store now embed through the bridge, so indexing and search always use the configured service.
- Tests: `tests/unit/embeddingTable.spec.ts` (default width, keep/rebuild semantics, 384-dim round-trip + search, mismatch rejections), `tests/unit/embeddingProviders.spec.ts` (payload shapes per API with fake fetch, dimension validation, 401 mapping, factory selection incl. builtin injection). Verified in Electron with the real model: first `reembedAll` downloaded MiniLM and embedded 7 models in ~13 s; "weekly pill organizer with compartments" ranked the Pill Organizer first at 0.84 and "toy to fidget with" ranked the fidget toy first at 0.74.

## Conventions

- Keep UI components separate from persistence/indexing services.
- Filesystem and DuckDB access only in Electron main; UI talks through the preload IPC bridge.
- Vision/embedding providers are selected in Settings and run in the Electron main process; the renderer talks to them through bridge providers. Mocks remain available for development.
- Indexing is idempotent: unchanged files (same content hash + mtime) are not reprocessed.
- One bad model file must never crash a whole directory indexing run; errors are stored per file.
- No loggers; do not add logging unless explicitly requested.
