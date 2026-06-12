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
tests/
  unit/             Vitest specs
  e2e/              Cypress specs
roadmap.md          Phase-by-phase execution plan (source of truth for scope)
```

The target structure for services, types, Electron main/preload, and components is documented in `roadmap.md` ("Suggested Directory Structure") and will be created as phases are executed.

## Completed phases

### Phase 1 - Install Dependencies

- Installed `three`, `fflate`, `fast-xml-parser`, `zod`, `@duckdb/node-api` (runtime) and `@types/three`, `electron`, `vite-plugin-electron` (dev).
- Verified DuckDB VSS extension loads and an HNSW index can be created (`INSTALL vss; LOAD vss;`).
- File hashing will use Node's built-in `crypto`; no extra dependency.
- `tests/unit/dependencies.spec.ts` smoke-tests that all Phase 1 libraries import and work.
- Dependency rationale table lives in `README.md`.

## Conventions

- Keep UI components separate from persistence/indexing services.
- Filesystem and DuckDB access only in Electron main; UI talks through the preload IPC bridge.
- Mock LLM/embedding providers are used before wiring real providers.
- Indexing is idempotent: unchanged files (same content hash + mtime) are not reprocessed.
- One bad model file must never crash a whole directory indexing run; errors are stored per file.
- No loggers; do not add logging unless explicitly requested.
