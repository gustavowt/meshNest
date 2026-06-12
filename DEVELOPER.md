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

## Conventions

- Keep UI components separate from persistence/indexing services.
- Filesystem and DuckDB access only in Electron main; UI talks through the preload IPC bridge.
- Mock LLM/embedding providers are used before wiring real providers.
- Indexing is idempotent: unchanged files (same content hash + mtime) are not reprocessed.
- One bad model file must never crash a whole directory indexing run; errors are stored per file.
- No loggers; do not add logging unless explicitly requested.
