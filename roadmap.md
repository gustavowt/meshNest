# STL/3MF Semantic Library Roadmap

> Execution roadmap for a local-first desktop application that indexes, previews, categorizes, and semantically searches `.stl` and `.3mf` files used in 3D printing.
>
> This roadmap assumes the base **Ionic + Vue 3 + Electron** project already exists. Do **not** create or initialize a new app. Start from dependency installation and implement one phase at a time.

---

## Goal

Build a local-first 3D model library where the user selects a directory containing STL and 3MF files, the app scans and indexes those files, renders visual previews, asks a configurable vision-capable LLM to describe each model, generates embeddings from those descriptions, and stores everything in DuckDB for semantic search.

The final user experience should support searches like:

- `dragon phone stand`
- `articulated creature toy`
- `headset stand with leaves`
- `gridfinity container for small tools`
- `round part with a center hole`
- `cable organizer for desk`
- `printer replacement part`
- `miniature medieval building`

The core indexing strategy is:

```text
STL/3MF file
  -> technical parser
  -> geometry metadata
  -> normalized 3D scene
  -> multi-view rendering
  -> vision LLM description
  -> text embedding
  -> DuckDB storage
  -> vector search + hybrid search UI
```

---

## High-Level Architecture

```text
Ionic + Vue UI
  ├── Library browser
  ├── Search page
  ├── 3D preview
  ├── File detail page
  ├── Indexing status
  └── Settings

Electron Main / Preload
  ├── Local filesystem access
  ├── Directory scanner
  ├── File hashing
  ├── DuckDB access
  ├── Indexing queue
  └── IPC bridge

3D Processing Layer
  ├── STL loader
  ├── 3MF loader
  ├── 3MF ZIP/XML metadata extractor
  ├── Geometry metadata extractor
  ├── Model normalizer
  ├── Thumbnail renderer
  └── Multi-view renderer

AI Layer
  ├── Vision provider interface
  ├── Embedding provider interface
  ├── Prompt templates
  ├── JSON response validation
  └── Mock providers for development

Persistence Layer
  ├── DuckDB schema
  ├── Migrations
  ├── Model file repository
  ├── Render asset repository
  ├── AI description repository
  ├── Embedding repository
  └── Search repository
```

---

## Constraints & Principles

- [ ] Execute one phase at a time.
- [ ] Do not create a new Ionic/Vue/Electron application.
- [ ] Keep the project local-first.
- [ ] Keep filesystem access inside Electron main/preload boundaries.
- [ ] Keep UI components separate from persistence and indexing services.
- [ ] Use Three.js for STL/3MF preview and rendering.
- [ ] Use DuckDB as the local database.
- [ ] Use DuckDB VSS/HNSW for semantic vector search.
- [ ] Use a configurable vision-capable LLM to describe rendered model views.
- [ ] Use text embeddings generated from the LLM description for the MVP.
- [ ] Make indexing idempotent: unchanged files should not be reprocessed.
- [ ] Store indexing errors per file so the user can retry later.
- [ ] Use mock LLM and mock embedding providers before wiring real providers.
- [ ] Keep tasks small enough for an executing LLM to complete safely.
- [ ] After completing each task, update this roadmap by changing `[ ]` to `[x]`.

---

## Technical Decisions

### STL Handling

STL should be treated as geometry-only. It usually does not contain useful semantic metadata, colors, materials, object names, or print context.

Use:

- Three.js `STLLoader` for loading.
- Geometry analysis for dimensions, triangle count, bounding box, and basic mesh information.
- Multi-view rendering for visual understanding.
- Vision LLM output for semantic description.

### 3MF Handling

3MF should be treated as a package format, not only as a mesh file.

Use both:

- Three.js `ThreeMFLoader` to load the 3D scene.
- ZIP/XML parsing to inspect internal metadata, thumbnails, names, relationships, and model structure.

Start with standard 3MF support. Do not attempt full slicer-specific interpretation in the MVP.

### Rendering Strategy

For semantic understanding, generate deterministic rendered images:

- front
- back
- left
- right
- top
- perspective

Optional later:

- bottom
- close-up/detail
- exploded view for multi-part 3MF files

### AI Strategy

For MVP:

- Send rendered images to a vision-capable LLM.
- Ask for structured JSON.
- Generate text embeddings from the structured description.
- Store the embedding in DuckDB.

Do not start with direct image embeddings. Add image embeddings later only if text-based semantic search is not enough.

---

## Suggested Directory Structure

Adjust names to match the existing project, but preserve this separation of responsibilities.

```text
src/
  components/
    model/
      ModelCard.vue
      ModelGrid.vue
      ModelPreview3D.vue
      ModelSearchBar.vue
      ModelMetadataPanel.vue
      ModelRenderGallery.vue
      IndexingStatusBadge.vue

  pages/
    LibraryPage.vue
    ModelDetailPage.vue
    SearchPage.vue
    SettingsPage.vue
    IndexingPage.vue

  services/
    database/
      duckdbClient.ts
      schema.ts
      migrations.ts
      modelFileRepository.ts
      renderAssetRepository.ts
      aiDescriptionRepository.ts
      embeddingRepository.ts
      searchRepository.ts

    filesystem/
      directoryScanner.ts
      fileHash.ts
      fileMetadata.ts
      supportedFiles.ts

    model-parsing/
      stlLoaderService.ts
      threeMfLoaderService.ts
      threeMfPackageParser.ts
      geometryMetadata.ts
      modelNormalizer.ts
      modelScene.ts

    rendering/
      modelRenderer.ts
      renderViews.ts
      thumbnailService.ts
      renderAssetStorage.ts

    indexing/
      indexQueue.ts
      indexModelFile.ts
      indexDirectory.ts
      indexingStatus.ts
      retryIndexing.ts

    llm/
      visionProvider.ts
      embeddingProvider.ts
      providerSettings.ts
      prompts.ts
      mockVisionProvider.ts
      mockEmbeddingProvider.ts
      jsonValidation.ts

    search/
      semanticSearch.ts
      hybridSearch.ts
      searchRanking.ts
      searchFilters.ts

  stores/
    libraryStore.ts
    settingsStore.ts
    indexingStore.ts
    searchStore.ts

  types/
    modelFile.ts
    modelMetadata.ts
    modelRender.ts
    indexing.ts
    search.ts
    llm.ts

electron/
  main/
    ipc/
      filesystemIpc.ts
      databaseIpc.ts
      renderingIpc.ts
      indexingIpc.ts
    services/
      localFileAccess.ts
      appDataPaths.ts

  preload/
    index.ts
```

---

# Phase 1 - Install Dependencies

## Goal

Install the required libraries for 3D file loading, rendering, ZIP/XML parsing, local storage, validation, and vector search.

## Tasks

- [x] Install Three.js.
- [x] Install type definitions if needed.
- [x] Install a ZIP parser for reading `.3mf` packages.
- [x] Install an XML parser for reading 3MF model metadata.
- [x] Install a schema validation library for LLM JSON output.
- [x] Install or verify DuckDB support in the existing app.
- [x] Install or verify DuckDB VSS extension support.
- [x] Install utility libraries for hashing files if the project does not already have one. (Node built-in `crypto` is used; no extra dependency.)
- [x] Add a short dependency note in the project README explaining why each dependency exists.

## Suggested Dependencies

```bash
npm install three fflate fast-xml-parser zod
```

Depending on the existing project setup, DuckDB may already be installed. If not, install the correct DuckDB package for the current architecture used by the app.

## Success Criteria

- [x] The project builds after dependency installation.
- [x] TypeScript can import Three.js successfully.
- [x] TypeScript can import STL and 3MF loaders successfully.
- [x] TypeScript can import the ZIP and XML parser successfully.
- [x] No dependency is added without being used by a planned service.

---

# Phase 2 - Define Core Types and Contracts

## Goal

Create the shared domain types that all future services will use.

## Tasks

- [x] Create `src/types/modelFile.ts`.
- [x] Create `src/types/modelMetadata.ts`.
- [x] Create `src/types/modelRender.ts`.
- [x] Create `src/types/indexing.ts`.
- [x] Create `src/types/llm.ts`.
- [x] Create `src/types/search.ts`.
- [x] Define supported file extensions: `.stl` and `.3mf`.
- [x] Define a `ModelFile` type.
- [x] Define a `GeometryMetadata` type.
- [x] Define a `ThreeMfPackageMetadata` type.
- [x] Define a `ModelRenderAsset` type.
- [x] Define an `AIModelDescription` type.
- [x] Define an `IndexingJob` type.
- [x] Define a `SearchResult` type.

## Suggested Type Shape

```ts
export type SupportedModelExtension = "stl" | "3mf";

export type ModelFile = {
  id: string;
  projectId: string;
  absolutePath: string;
  relativePath: string;
  filename: string;
  extension: SupportedModelExtension;
  sizeBytes: number;
  modifiedAt: string;
  contentHash: string;
  indexedAt?: string;
  status: "pending" | "indexed" | "failed" | "skipped";
  errorMessage?: string;
};

export type GeometryMetadata = {
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  triangleCount?: number;
  vertexCount?: number;
  meshCount?: number;
  objectCount?: number;
  surfaceAreaMm2?: number;
  volumeMm3?: number;
  isWatertight?: boolean;
};

export type AIModelDescription = {
  shortName: string;
  description: string;
  likelyCategory: string;
  tags: string[];
  objectsDetected: string[];
  printUse?: string;
  style?: string;
  confidence: number;
  searchPhrases: string[];
};
```

## Success Criteria

- [x] Types compile without errors.
- [x] Types are exported from a predictable location.
- [x] Future services can import these types without circular dependencies.
- [x] The type names are descriptive and stable.

---

# Phase 3 - Database Schema and Migrations

## Goal

Create the DuckDB schema for model files, geometry metadata, render assets, AI descriptions, embeddings, indexing jobs, and settings.

## Tasks

- [x] Create or update `src/services/database/schema.ts`.
- [x] Create or update `src/services/database/migrations.ts`.
- [x] Create a migration runner if one does not already exist.
- [x] Create a `model_files` table.
- [x] Create a `geometry_metadata` table.
- [x] Create a `three_mf_metadata` table.
- [x] Create a `model_render_assets` table.
- [x] Create an `ai_model_descriptions` table.
- [x] Create a `model_embeddings` table.
- [x] Create an `indexing_jobs` table.
- [x] Create a `settings` table if the project does not already have one.
- [x] Add indexes for file path, hash, extension, status, and category.
- [x] Add an HNSW vector index for embeddings.

## Suggested Schema

```sql
CREATE TABLE IF NOT EXISTS model_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  modified_at TIMESTAMP NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMP,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geometry_metadata (
  model_file_id TEXT PRIMARY KEY,
  width_mm DOUBLE,
  height_mm DOUBLE,
  depth_mm DOUBLE,
  triangle_count BIGINT,
  vertex_count BIGINT,
  mesh_count BIGINT,
  object_count BIGINT,
  surface_area_mm2 DOUBLE,
  volume_mm3 DOUBLE,
  is_watertight BOOLEAN,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS three_mf_metadata (
  model_file_id TEXT PRIMARY KEY,
  object_names TEXT[],
  material_names TEXT[],
  color_values TEXT[],
  has_thumbnail BOOLEAN,
  thumbnail_internal_path TEXT,
  raw_metadata_json TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_render_assets (
  id TEXT PRIMARY KEY,
  model_file_id TEXT NOT NULL,
  view_name TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_model_descriptions (
  model_file_id TEXT PRIMARY KEY,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL,
  likely_category TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  objects_detected TEXT[] NOT NULL,
  print_use TEXT,
  style TEXT,
  confidence DOUBLE NOT NULL,
  search_phrases TEXT[] NOT NULL,
  raw_response_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_embeddings (
  model_file_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding FLOAT[1536],
  source_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexing_jobs (
  id TEXT PRIMARY KEY,
  model_file_id TEXT,
  absolute_path TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
```

## Notes

- If the selected embedding model does not use 1536 dimensions, update the `FLOAT[1536]` column and index accordingly.
- Keep embedding dimensions consistent per database.
- For MVP, one embedding dimension is enough. Multi-provider/multi-dimension support can be added later.

## Success Criteria

- [x] Migrations run safely more than once.
- [x] Tables are created on a fresh database.
- [x] Existing database initialization still works.
- [x] Embedding table supports the selected embedding dimension.
- [x] HNSW index can be created successfully.

---

# Phase 4 - Filesystem Access and Directory Scanner

## Goal

Allow the user to select a directory and scan it recursively for `.stl` and `.3mf` files.

## Tasks

- [x] Create `filesystemIpc.ts` in Electron main if needed. (The Electron main/preload layer was bootstrapped here since the base project did not include it yet.)
- [x] Expose a safe directory picker through preload.
- [x] Create `directoryScanner.ts`.
- [x] Scan directories recursively.
- [x] Ignore hidden directories by default.
- [x] Ignore common dependency/build folders such as `node_modules`, `.git`, `dist`, `build`, and cache folders.
- [x] Detect `.stl` and `.3mf` case-insensitively.
- [x] Return absolute path, relative path, filename, extension, size, and modified timestamp.
- [x] Create `fileHash.ts`.
- [x] Generate a content hash for each file.
- [x] Add cancellation support for long scans.
- [x] Add progress events for scanned files.

## Success Criteria

- [x] User can select a directory from the UI.
- [x] Scanner finds STL files.
- [x] Scanner finds 3MF files.
- [x] Scanner ignores unsupported files.
- [x] Scanner does not block the UI.
- [x] Large directories show progress.
- [x] Scan output is deterministic and typed.

---

# Phase 5 - Model File Repository

## Goal

Persist discovered files and determine whether each file needs indexing.

## Tasks

- [x] Create `modelFileRepository.ts`.
- [x] Implement `upsertModelFile`.
- [x] Implement `findByPath`.
- [x] Implement `findByHash`.
- [x] Implement `listModelFiles`.
- [x] Implement `listPendingFiles`.
- [x] Implement `markIndexed`.
- [x] Implement `markFailed`.
- [x] Implement `shouldReindexFile`.
- [x] Use file hash and modified timestamp to avoid unnecessary reindexing.
- [x] Add unit tests or lightweight integration tests for repository behavior.

## Success Criteria

- [x] New files are inserted.
- [x] Existing unchanged files are skipped.
- [x] Modified files are marked for reindexing.
- [x] Failed files preserve their error message.
- [x] Repository methods do not leak raw SQL into UI code.

---

# Phase 6 - STL Loading and Geometry Metadata

## Goal

Load STL files and extract basic geometry metadata.

## Tasks

- [x] Create `stlLoaderService.ts`.
- [x] Import and configure Three.js `STLLoader`.
- [x] Load binary STL files.
- [x] Load ASCII STL files.
- [x] Convert loaded geometry into a normalized internal scene representation.
- [x] Create `geometryMetadata.ts`.
- [x] Extract bounding box dimensions.
- [x] Extract vertex count.
- [x] Extract triangle count.
- [x] Extract mesh count.
- [x] Add placeholders for volume and surface area if not implemented yet.
- [x] Handle invalid STL files gracefully.
- [x] Store geometry metadata in DuckDB.

## Success Criteria

- [x] A valid STL file can be loaded.
- [x] Invalid STL files produce a controlled indexing error.
- [x] Dimensions are calculated consistently.
- [x] Geometry metadata is persisted.
- [x] The service has no direct UI dependency.

---

# Phase 7 - 3MF Package Parsing

## Goal

Read 3MF files as ZIP/XML packages and extract useful metadata before rendering.

## Tasks

- [x] Create `threeMfPackageParser.ts`.
- [x] Open `.3mf` files as ZIP archives.
- [x] Detect `[Content_Types].xml`.
- [x] Detect `/3D/3dmodel.model` or equivalent model paths.
- [x] Parse model XML.
- [x] Extract object names where available.
- [x] Extract material names where available.
- [x] Extract color values where available.
- [x] Detect internal thumbnails where available.
- [x] Extract thumbnail path where available.
- [x] Store raw metadata JSON for debugging.
- [x] Store parsed 3MF metadata in DuckDB.
- [x] Handle malformed 3MF files gracefully.

## Success Criteria

- [x] Standard 3MF files can be opened as packages.
- [x] Missing optional metadata does not fail indexing.
- [x] Malformed package errors are captured per file.
- [x] Parsed metadata is visible in the detail page later. (Persisted and readable; the detail page itself is Phase 18.)
- [x] Parser is independent from the Three.js 3D loader.

---

# Phase 8 - 3MF Scene Loading

## Goal

Load 3MF files into a Three.js scene for preview and rendering.

## Tasks

- [x] Create `threeMfLoaderService.ts`.
- [x] Import and configure Three.js `ThreeMFLoader`.
- [x] Load 3MF files from local file content.
- [x] Convert loaded 3MF data into a normalized internal scene representation.
- [x] Extract mesh count.
- [x] Extract object count where possible.
- [x] Extract bounding box dimensions.
- [x] Preserve basic material/color information where available.
- [x] Handle 3MF files with multiple objects.
- [x] Handle unsupported 3MF features gracefully.

## Success Criteria

- [x] A standard 3MF file can be loaded.
- [x] Multi-object 3MF files do not crash the loader.
- [x] Basic geometry metadata is extracted.
- [x] Unsupported 3MF features produce warnings, not fatal errors.
- [x] Loaded 3MF scenes can be passed to the renderer.

---

# Phase 9 - Model Normalization

## Goal

Normalize loaded STL/3MF scenes so previews and rendered views are consistent.

## Tasks

- [x] Create `modelNormalizer.ts`.
- [x] Center model geometry around the origin.
- [x] Compute model bounding sphere.
- [x] Compute model bounding box.
- [x] Normalize camera distance based on bounding size.
- [x] Preserve original dimensions in metadata.
- [x] Avoid permanently mutating source geometry when possible.
- [x] Add utility for fitting the model into a preview scene.
- [x] Add utility for deterministic model orientation.

## Success Criteria

- [x] Small and large models both render within frame.
- [x] Tall models do not get cropped.
- [x] Wide models do not get cropped.
- [x] Preview camera setup is deterministic.
- [x] Normalization works for both STL and 3MF scenes.

---

# Phase 10 - 3D Preview Component

## Goal

Create a reusable Vue component for interactive preview of STL and 3MF files.

## Tasks

- [x] Create `ModelPreview3D.vue`.
- [x] Render a Three.js scene inside the component.
- [x] Add orbit controls.
- [x] Add loading state.
- [x] Add error state.
- [x] Add resize handling.
- [x] Add basic lighting.
- [x] Add camera fit behavior.
- [x] Support STL preview.
- [x] Support 3MF preview.
- [x] Dispose Three.js resources when the component unmounts.

## Success Criteria

- [x] User can preview an STL file interactively.
- [x] User can preview a 3MF file interactively.
- [x] Component does not leak WebGL resources after repeated navigation.
- [x] Preview remains responsive on window resize.
- [x] Errors are visible and understandable.

---

# Phase 11 - Render Asset Storage

## Goal

Create a safe location for generated thumbnails and multi-view render images.

## Tasks

- [x] Create `appDataPaths.ts` if needed.
- [x] Define a model render cache directory.
- [x] Create a deterministic folder per model file ID.
- [x] Create `renderAssetStorage.ts`.
- [x] Save PNG render assets to disk.
- [x] Generate stable paths for views.
- [x] Clean stale render assets when a file is reindexed.
- [x] Store render asset records in DuckDB.

## Suggested Structure

```text
app-data/
  model-renders/
    <model-file-id>/
      thumbnail.png
      front.png
      back.png
      left.png
      right.png
      top.png
      perspective.png
```

## Success Criteria

- [x] Render assets are saved outside the source model directory.
- [x] Render assets survive app restart.
- [x] Reindexing replaces old render assets.
- [x] Render asset database records match files on disk.

---

# Phase 12 - Thumbnail and Multi-View Rendering

## Goal

Generate deterministic preview images that can be used in the UI and sent to a vision-capable LLM.

## Tasks

- [x] Create `modelRenderer.ts`.
- [x] Create `renderViews.ts`.
- [x] Render `thumbnail.png`.
- [x] Render `front.png`.
- [x] Render `back.png`.
- [x] Render `left.png`.
- [x] Render `right.png`.
- [x] Render `top.png`.
- [x] Render `perspective.png`.
- [x] Use consistent lighting.
- [x] Use consistent background.
- [x] Use deterministic camera positions.
- [x] Ensure transparent or neutral backgrounds are supported.
- [x] Save render assets to disk.
- [x] Store render asset metadata in DuckDB.

## Notes

The renderer may run in a hidden browser window, an offscreen Electron context, or a controlled renderer process. Keep this implementation isolated so it can be changed later if needed.

## Success Criteria

- [x] STL thumbnails are generated.
- [x] 3MF thumbnails are generated.
- [x] All required views are generated.
- [x] Images are not cropped.
- [x] Images are deterministic enough for repeatable AI descriptions. (Verified byte-identical across app restarts.)
- [x] Rendering failures are captured per file. (Errors propagate as exceptions; per-file persistence happens in the Phase 15 pipeline.)

---

# Phase 13 - Mock Vision Provider

## Goal

Build the LLM vision interface and a mock implementation before using real AI providers.

## Tasks

- [x] Create `visionProvider.ts`.
- [x] Define a provider interface for model image analysis.
- [x] Create `mockVisionProvider.ts`.
- [x] Return deterministic fake descriptions based on filename and extension.
- [x] Create `prompts.ts`.
- [x] Create the final vision prompt template.
- [x] Create `jsonValidation.ts`.
- [x] Validate the vision provider response using Zod or equivalent.
- [x] Store raw JSON responses for debugging.

## Required Vision Output Shape

```json
{
  "shortName": "...",
  "description": "...",
  "likelyCategory": "...",
  "tags": ["..."],
  "objectsDetected": ["..."],
  "printUse": "...",
  "style": "...",
  "confidence": 0.0,
  "searchPhrases": ["..."]
}
```

## Suggested Prompt

```text
Analyze these rendered views of a 3D printable model.

Return only valid JSON with this shape:
{
  "shortName": string,
  "description": string,
  "likelyCategory": string,
  "tags": string[],
  "objectsDetected": string[],
  "printUse": string,
  "style": string,
  "confidence": number,
  "searchPhrases": string[]
}

Focus on what the object appears to be, not only geometry.
Mention uncertainty when the object is ambiguous.
Prefer practical 3D printing categories such as toys, tools, organizers, miniatures, printer parts, household, cosplay, replacement parts, decorative, and utility.
```

## Success Criteria

- [x] Indexing can call a vision provider without knowing whether it is mock or real.
- [x] Mock provider returns valid structured data.
- [x] Invalid provider output fails validation cleanly.
- [x] AI descriptions are persisted in DuckDB.

---

# Phase 14 - Mock Embedding Provider

## Goal

Build the embedding interface and a deterministic mock implementation for local development.

## Tasks

- [x] Create `embeddingProvider.ts`.
- [x] Define an interface for generating embeddings from text.
- [x] Create `mockEmbeddingProvider.ts`.
- [x] Return deterministic vectors with the same dimension expected by the database.
- [x] Create a function that builds embedding source text from AI descriptions.
- [x] Store embedding provider name and model name.
- [x] Store embedding source text.
- [x] Store embedding vector in DuckDB.

## Embedding Source Text Format

```text
Short name: <shortName>
Description: <description>
Category: <likelyCategory>
Tags: <tag1>, <tag2>, <tag3>
Objects detected: <object1>, <object2>
Print use: <printUse>
Style: <style>
Search phrases: <phrase1>; <phrase2>; <phrase3>
```

## Success Criteria

- [x] Embeddings can be generated without a real provider.
- [x] Embedding dimensions match the database schema.
- [x] Embeddings are stored successfully.
- [x] The indexing pipeline can run fully using mock AI services. (All mock pieces are in place; the pipeline itself is assembled in Phase 15.)

---

# Phase 15 - Indexing Pipeline

## Goal

Create the end-to-end pipeline for indexing one model file.

## Tasks

- [x] Create `indexModelFile.ts`.
- [x] Accept one discovered file as input.
- [x] Upsert file metadata.
- [x] Decide whether the file should be skipped or reindexed.
- [x] Load STL files through the STL loader.
- [x] Load 3MF files through the 3MF loader and package parser.
- [x] Extract geometry metadata.
- [x] Normalize the scene.
- [x] Generate render assets.
- [x] Send render assets to the vision provider.
- [x] Validate and store AI description.
- [x] Build embedding source text.
- [x] Generate and store embedding.
- [x] Mark file as indexed.
- [x] Mark file as failed when any step throws.
- [x] Persist the failure reason.

## Success Criteria

- [x] One STL file can be indexed end-to-end using mock providers.
- [x] One 3MF file can be indexed end-to-end using mock providers.
- [x] Failed files do not crash the whole app.
- [x] Indexed files contain metadata, renders, description, and embedding.
- [x] Re-running indexing skips unchanged files.

---

# Phase 16 - Directory Indexing Queue

## Goal

Index a full directory safely with progress, cancellation, retries, and bounded concurrency.

## Tasks

- [x] Create `indexQueue.ts`.
- [x] Create `indexDirectory.ts`.
- [x] Add a queue for discovered files.
- [x] Add bounded concurrency.
- [x] Add progress events.
- [x] Add cancellation support.
- [x] Add retry support for failed files.
- [x] Add queue status persistence.
- [x] Add indexing summary: total, indexed, skipped, failed, pending.
- [x] Expose indexing events through IPC or store updates.

## Success Criteria

- [x] User can index a directory with multiple files.
- [x] UI remains responsive while indexing.
- [x] User can cancel indexing.
- [x] User can retry failed files.
- [x] Progress survives enough state to explain what happened after a failure.

---

# Phase 17 - Library UI

## Goal

Create the first usable interface for browsing indexed files.

## Tasks

- [x] Create or update `LibraryPage.vue`.
- [x] Create `ModelGrid.vue`.
- [x] Create `ModelCard.vue`.
- [x] Display model thumbnail.
- [x] Display filename.
- [x] Display short AI name if available.
- [x] Display category if available.
- [x] Display tags if available.
- [x] Display indexing status.
- [x] Add empty state.
- [x] Add loading state.
- [x] Add failed/error state.
- [x] Add basic sorting by filename, date modified, and indexed date.

## Success Criteria

- [x] Indexed files appear in the library.
- [x] Thumbnails are visible.
- [x] Cards make indexed and failed states obvious.
- [x] Empty library state guides the user to select/index a directory.
- [x] UI works after app restart.

---

# Phase 18 - Model Detail UI

## Goal

Create a detail page that shows preview, metadata, AI description, tags, render views, and file information.

## Tasks

- [x] Create or update `ModelDetailPage.vue`.
- [x] Add `ModelPreview3D.vue` to the detail page.
- [x] Add `ModelMetadataPanel.vue`.
- [x] Add `ModelRenderGallery.vue`.
- [x] Show filename and absolute path.
- [x] Show dimensions.
- [x] Show triangle and vertex count.
- [x] Show 3MF metadata when available.
- [x] Show AI description.
- [x] Show tags.
- [x] Show search phrases.
- [x] Show raw indexing error when file failed.
- [x] Add button to reindex the file.
- [x] Add button to reveal file in OS file manager if supported.

## Success Criteria

- [x] User can open any model from the library.
- [x] Detail page shows interactive 3D preview.
- [x] Detail page shows render gallery.
- [x] Detail page shows AI metadata.
- [x] Failed files are inspectable and retryable.

---

# Phase 19 - Semantic Search

## Goal

Implement vector search against embeddings stored in DuckDB.

## Tasks

- [x] Create `semanticSearch.ts`.
- [x] Accept a natural language query.
- [x] Generate query embedding using the embedding provider.
- [x] Query DuckDB using cosine distance.
- [x] Return top matching model files.
- [x] Include distance/score in results.
- [x] Join model metadata, thumbnails, descriptions, and tags.
- [x] Add empty result handling.
- [x] Add error handling when no embeddings exist.

## Suggested Query Shape

```sql
SELECT
  mf.id,
  mf.filename,
  mf.absolute_path,
  aid.short_name,
  aid.description,
  aid.likely_category,
  aid.tags,
  mra.absolute_path AS thumbnail_path,
  array_cosine_distance(me.embedding, $query_embedding) AS distance
FROM model_embeddings me
JOIN model_files mf ON mf.id = me.model_file_id
LEFT JOIN ai_model_descriptions aid ON aid.model_file_id = mf.id
LEFT JOIN model_render_assets mra
  ON mra.model_file_id = mf.id
 AND mra.view_name = 'thumbnail'
ORDER BY array_cosine_distance(me.embedding, $query_embedding)
LIMIT $limit;
```

## Success Criteria

- [x] User can search indexed models by natural language.
- [x] Search returns relevant mock-provider results during development.
- [x] Search results include thumbnail, filename, category, tags, and score.
- [x] Search handles an empty index gracefully.

---

# Phase 20 - Search UI

## Goal

Create a search interface focused on semantic discovery.

## Tasks

- [x] Create or update `SearchPage.vue`.
- [x] Create `ModelSearchBar.vue`.
- [x] Add query input.
- [x] Add loading state while searching.
- [x] Add search result grid/list.
- [x] Show semantic score or match confidence in a subtle way.
- [x] Allow opening a result in the detail page.
- [x] Preserve the last query in state.
- [x] Add helpful example queries.
- [x] Add empty search state.
- [x] Add no-results state.

## Success Criteria

- [x] User can type a natural language query.
- [x] User can see matching files.
- [x] User can open a matching file.
- [x] UI gives useful feedback when nothing is indexed.

---

# Phase 21 - Hybrid Search and Filters

## Goal

Improve search quality by combining vector search, filename search, tag search, and filters.

## Tasks

- [ ] Create `hybridSearch.ts`.
- [ ] Create `searchRanking.ts`.
- [ ] Create `searchFilters.ts`.
- [ ] Add filename matching.
- [ ] Add tag matching.
- [ ] Add category filtering.
- [ ] Add extension filtering: STL/3MF.
- [ ] Add dimension filters.
- [ ] Add indexed status filters.
- [ ] Add modified date filters.
- [ ] Combine vector distance with text/tag/category boosts.
- [ ] Keep ranking logic easy to tune.

## Suggested Ranking Formula

```text
score =
  semanticScore * 0.65
  + filenameMatch * 0.15
  + tagMatch * 0.15
  + categoryMatch * 0.05
```

## Success Criteria

- [ ] Exact filename searches work.
- [ ] Tag searches work.
- [ ] Semantic searches still work.
- [ ] Filters can narrow search results.
- [ ] Ranking behavior is easy to inspect during debugging.

---

# Phase 22 - Provider Settings

## Goal

Allow the user to configure real vision and embedding providers.

## Tasks

- [ ] Create or update `SettingsPage.vue`.
- [ ] Create `providerSettings.ts`.
- [ ] Add settings for vision provider.
- [ ] Add settings for vision model.
- [ ] Add settings for embedding provider.
- [ ] Add settings for embedding model.
- [ ] Add API key storage strategy appropriate for the existing Electron app.
- [ ] Add base URL setting for OpenAI-compatible local or remote providers.
- [ ] Add provider test button.
- [ ] Add validation for required settings.
- [ ] Keep mock providers available for development.

## Supported Provider Targets

Start with interfaces that can support:

- OpenAI-compatible vision endpoint.
- OpenAI-compatible embedding endpoint.
- Local Ollama-compatible vision endpoint if desired.
- Local Ollama-compatible embedding endpoint if desired.

## Success Criteria

- [ ] User can select mock providers.
- [ ] User can configure a real vision provider.
- [ ] User can configure a real embedding provider.
- [ ] Provider test gives clear success/failure feedback.
- [ ] Settings persist after app restart.

---

# Phase 23 - Real Vision Provider

## Goal

Connect the indexing pipeline to a real vision-capable LLM provider.

## Tasks

- [ ] Create a real implementation of `VisionProvider`.
- [ ] Load rendered image files as base64 or provider-compatible payloads.
- [ ] Send the multi-view image set to the provider.
- [ ] Include the structured JSON prompt.
- [ ] Parse the provider response.
- [ ] Validate response JSON.
- [ ] Retry once when the response is invalid JSON.
- [ ] Store raw response JSON.
- [ ] Store validated AI description.
- [ ] Add user-facing error messages for provider failures.

## Success Criteria

- [ ] Real provider can describe an STL model from rendered views.
- [ ] Real provider can describe a 3MF model from rendered views.
- [ ] Invalid responses do not corrupt the database.
- [ ] Provider failures mark the file as failed with a useful error.
- [ ] Mock provider can still be used for development.

---

# Phase 24 - Real Embedding Provider

## Goal

Connect the indexing and search pipeline to a real text embedding provider.

## Tasks

- [ ] Create a real implementation of `EmbeddingProvider`.
- [ ] Generate embeddings for AI description source text.
- [ ] Generate embeddings for search queries.
- [ ] Validate embedding dimensions.
- [ ] Store provider and model name with each embedding.
- [ ] Add clear error if embedding dimensions do not match the database schema.
- [ ] Add migration or reset flow if changing embedding dimensions is required.

## Success Criteria

- [ ] Real embeddings are generated during indexing.
- [ ] Real embeddings are generated during search.
- [ ] Semantic search returns meaningful results.
- [ ] Dimension mismatches are detected early.
- [ ] Mock embedding provider remains available for development.

---

# Phase 25 - Reindexing and Maintenance

## Goal

Give the user control over reindexing, cleanup, failed files, and changed files.

## Tasks

- [ ] Add a reindex button for one file.
- [ ] Add a retry failed files action.
- [ ] Add a rescan directory action.
- [ ] Add a force reindex directory action.
- [ ] Add stale file detection for files removed from disk.
- [ ] Add cleanup for render assets belonging to deleted/missing files.
- [ ] Add cleanup for database records belonging to deleted/missing files.
- [ ] Add a maintenance summary view.
- [ ] Add confirmation dialogs for destructive cleanup actions.

## Success Criteria

- [ ] User can retry failed files.
- [ ] User can force reindex one file.
- [ ] User can rescan a directory.
- [ ] Removed files can be detected.
- [ ] Stale render assets can be cleaned safely.

---

# Phase 26 - Categories and Tag Management

## Goal

Make AI-generated categories and tags useful, editable, and searchable.

## Tasks

- [ ] Add tag display to cards and detail page.
- [ ] Add category display to cards and detail page.
- [ ] Allow user to edit tags.
- [ ] Allow user to edit category.
- [ ] Store user-edited tags separately or mark them as user overrides.
- [ ] Ensure reindexing does not accidentally erase user overrides.
- [ ] Add tag filter UI.
- [ ] Add category filter UI.
- [ ] Add tag/category counts.

## Suggested Categories

- toys
- tools
- organizers
- miniatures
- printer parts
- household
- cosplay
- replacement parts
- decorative
- utility
- containers
- mounts
- adapters
- unknown

## Success Criteria

- [ ] User can browse by category.
- [ ] User can filter by tag.
- [ ] User can correct AI-generated metadata.
- [ ] User corrections survive reindexing.

---

# Phase 27 - Duplicate and Similar Model Detection

## Goal

Help the user identify duplicate or near-duplicate files.

## Tasks

- [ ] Detect exact duplicates by content hash.
- [ ] Show duplicate groups in the UI.
- [ ] Add a duplicate warning on the detail page.
- [ ] Add similar model search using embeddings.
- [ ] Add `Find Similar` action from the detail page.
- [ ] Return visually/semantically similar models.
- [ ] Keep deletion/manual cleanup out of scope unless explicitly added later.

## Success Criteria

- [ ] Exact duplicates are detected.
- [ ] User can see duplicate groups.
- [ ] User can find semantically similar models.
- [ ] Duplicate detection does not delete anything automatically.

---

# Phase 28 - Performance and Large Libraries

## Goal

Make the app usable with thousands of STL/3MF files.

## Tasks

- [ ] Add pagination or virtual scrolling to the library grid.
- [ ] Add lazy thumbnail loading.
- [ ] Add bounded indexing concurrency.
- [ ] Add queue pause/resume.
- [ ] Avoid loading full 3D scenes for every card.
- [ ] Cache search results where useful.
- [ ] Add database query timing logs in development mode.
- [ ] Add render timing logs in development mode.
- [ ] Add AI provider timing logs in development mode.
- [ ] Optimize slow queries with indexes.

## Success Criteria

- [ ] Library view remains responsive with many files.
- [ ] Indexing does not freeze the UI.
- [ ] Preview loads only when needed.
- [ ] Search remains fast enough for interactive use.
- [ ] Slow stages are measurable.

---

# Phase 29 - Error Handling and Observability

## Goal

Make failures understandable for both the user and the developer.

## Tasks

- [ ] Standardize error objects for indexing failures.
- [ ] Capture parser errors.
- [ ] Capture renderer errors.
- [ ] Capture vision provider errors.
- [ ] Capture embedding provider errors.
- [ ] Capture database errors.
- [ ] Add indexing logs view or export.
- [ ] Add per-file error detail.
- [ ] Add retry guidance for common failures.
- [ ] Avoid exposing raw stack traces to normal users unless in developer mode.

## Success Criteria

- [ ] Failed files are easy to identify.
- [ ] Failure reasons are visible.
- [ ] User can retry recoverable failures.
- [ ] Developer can inspect detailed logs when needed.

---

# Phase 30 - Packaging and Local Data Safety

## Goal

Prepare the app for desktop usage while protecting local data and avoiding broken paths.

## Tasks

- [ ] Verify render asset paths work after packaging.
- [ ] Verify DuckDB database path works after packaging.
- [ ] Verify directory selection works after packaging.
- [ ] Verify preview works after packaging.
- [ ] Verify offscreen/hidden rendering works after packaging.
- [ ] Verify provider settings persist after packaging.
- [ ] Add backup/export option for database if needed.
- [ ] Add clear local data location documentation.
- [ ] Add app reset option only if safe and confirmed by user.

## Success Criteria

- [ ] Packaged app can scan a directory.
- [ ] Packaged app can index STL files.
- [ ] Packaged app can index 3MF files.
- [ ] Packaged app can search indexed files.
- [ ] Local database and render assets persist across restarts.

---

# Phase 31 - Optional: Advanced 3MF/Slicer Metadata

## Goal

Improve support for 3MF files generated by slicers such as Bambu Studio, OrcaSlicer, and PrusaSlicer.

## Tasks

- [ ] Inspect real-world 3MF files from common slicers.
- [ ] Detect slicer-specific metadata files.
- [ ] Extract plate names where available.
- [ ] Extract print profile names where available.
- [ ] Extract filament/material hints where available.
- [ ] Extract estimated print time where available.
- [ ] Extract nozzle/print settings where available.
- [ ] Store slicer metadata separately from standard 3MF metadata.
- [ ] Show slicer metadata in the detail page.

## Success Criteria

- [ ] Slicer metadata is extracted when available.
- [ ] Standard 3MF files still work.
- [ ] Unsupported slicer metadata does not fail indexing.
- [ ] Slicer-specific logic is isolated and optional.

---

# Phase 32 - Optional: Visual Similarity Embeddings

## Goal

Add direct image or multi-modal embeddings if text descriptions are not enough.

## Tasks

- [ ] Add an optional image embedding provider interface.
- [ ] Generate image embeddings from thumbnail or perspective render.
- [ ] Store image embeddings separately from text embeddings.
- [ ] Add a second vector index for image embeddings.
- [ ] Add search mode selection: text, visual, hybrid.
- [ ] Add `Find visually similar` action.
- [ ] Compare results against existing text embedding search.

## Success Criteria

- [ ] Visual similarity can be searched independently.
- [ ] Text search behavior is not degraded.
- [ ] User can find models that look similar even when descriptions differ.

---

# Phase 33 - Optional: Collections and Project Organization

## Goal

Allow users to organize models beyond a single indexed directory.

## Tasks

- [ ] Add collection/project table if not already present.
- [ ] Allow multiple indexed directories.
- [ ] Allow user-created collections.
- [ ] Allow assigning models to collections.
- [ ] Add collection filters.
- [ ] Add collection detail page.
- [ ] Preserve original file paths.
- [ ] Do not move source files unless a separate explicit feature is created.

## Success Criteria

- [ ] User can index more than one directory.
- [ ] User can group models into collections.
- [ ] Search can be filtered by collection.
- [ ] Source files are not modified or moved.

---

# Definition of Done

The project reaches MVP done when:

- [ ] User can select a directory.
- [ ] App scans for STL and 3MF files.
- [ ] App stores discovered files in DuckDB.
- [ ] App loads STL files.
- [ ] App loads 3MF files.
- [ ] App extracts basic geometry metadata.
- [ ] App generates thumbnails and multi-view renders.
- [ ] App sends renders to a configurable vision-capable LLM.
- [ ] App stores structured AI descriptions.
- [ ] App generates text embeddings from descriptions.
- [ ] App stores embeddings in DuckDB.
- [ ] App performs semantic vector search.
- [ ] App shows results with thumbnails and metadata.
- [ ] User can open a model detail page.
- [ ] User can preview the model interactively.
- [ ] User can retry failed indexing jobs.
- [ ] App skips unchanged files on repeated indexing.
- [ ] App remains usable after restart.

---

# Notes for the Executing LLM

- Work phase by phase.
- Do not mark a phase complete until its success criteria are met.
- Prefer simple, explicit implementations over clever abstractions.
- Keep commits or implementation chunks small.
- Update this file as tasks are completed.
- Do not remove unfinished tasks.
- Do not silently change the architecture.
- Do not introduce cloud-only assumptions.
- Keep comments and code identifiers in English.
- Use mock providers first, then real providers.
- Never let one bad model file crash a full directory indexing run.
- Treat `.stl` as geometry-only.
- Treat `.3mf` as both a 3D scene and a metadata package.
- The semantic source of truth is the AI-generated description plus user corrections.
- The original model files must remain untouched.
