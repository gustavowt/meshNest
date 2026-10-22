[0m
> plan · kimi-k3:cloud
[0m
[0m→ [0mRead package.json
[0m
[0m$ [0mgit log --oneline -20
a95f5b1 Use richer App Review sample models with subdivided geometry.
c9046f0 Fix App Review issues and prepare 1.0.4 for Mac App Store.
21e1b93 set release version to 1.0.0
f3c6504 polish world search entry points
62922c6 open external links outside Electron window
e0b645f update world search settings for supported providers
253b847 remove unsupported token world search providers
8da6307 fix unused lint errors in main process
756daa1 refactor variables to const in indexingStore
1fbc1b9 update settings UI and docs for world search token setup
ce3a850 add token setup url to world search providers
da01a15 document world search feature
910e1f7 update provider settings tests for world search
e137c96 add world search i18n strings
6401c6e add world search settings UI and library entry points
373268f add world search page, store, and result card
598513f extend vision providers for image world search
f329d6e add image search query support to vision providers
4aa4241 add world search IPC and main-process wiring
da52bd0 add token and image world search backend services
[0m
[0m$ [0mgit log --oneline --all -- src/services/database electron/main/services/database.ts 2>/dev/null | head -40
c9046f0 Fix App Review issues and prepare 1.0.4 for Mac App Store.
8da6307 fix unused lint errors in main process
088a9c9 Stream library updates during indexing.
e11be80 Improve live library indexing and search.
1aea99f Refactor provider settings persistence.
742079a Harden model file repository for overlapping scans and hash relocation.
1e27da3 Recover from corrupted DuckDB and preserve provider settings across rebuilds.
8cd6e79 add MAS packaging, security-scoped bookmarks, and vision provider improvements
4f66255 update model indexing pipeline and provider factories
c6e37c2 Phase 24: add real embedding providers with built-in local model
3353e2a Phase 22: add provider settings page
e875849 Phase 19: add semantic vector search
456ba59 Phase 18: add model detail UI
6dfcfe1 Phase 17: add library UI
5a013b4 Phase 16: add directory indexing queue
3c5f6d9 Phase 14: add embedding provider contract with deterministic mock
79ed57c Phase 13: add vision provider contract with mock implementation
eba74a1 Phase 12: add deterministic multi-view model rendering
1c575f3 Phase 11: add render asset storage and repository
1c8fa98 Phase 7: parse 3MF packages for semantic metadata
8564d94 Phase 6: add STL loader, geometry metadata extraction, and persistence
0fe8783 Phase 5: add model file repository with idempotent upsert
be48f3f Phase 3: add DuckDB schema, migrations, and client wrapper
[0m
[0m✱ [0mGlob "src/services/database/**/*"[90m 14 matches[0m
[0m→ [0mRead src/services/database/duckdbClient.ts
[0m→ [0mRead src/services/database/searchRepository.ts
[0m→ [0mRead src/services/database/embeddingRepository.ts
[0m→ [0mRead src/services/database/embeddingTable.ts
[0m→ [0mRead src/services/database/migrations.ts
[0m
[0m$ [0mls electron/main electron/main/services 2>/dev/null
electron/main:
index.ts
ipc
services

electron/main/services:
appDataPaths.ts
builtinEmbedding.ts
database.ts
embeddingService.ts
providerSettings.ts
securityScopedBookmarks.ts
world-search
[0m
[0m✱ [0mGlob "electron/**/*.ts"[90m 23 matches[0m
[0m→ [0mRead electron/main/services/database.ts
[0m→ [0mRead electron/main/services/appDataPaths.ts
[0m→ [0mRead electron/main/services/builtinEmbedding.ts
[0m→ [0mRead electron/main/services/embeddingService.ts
[0m→ [0mRead src/services/database/schema.ts
[0m✱ [0mGrep ":memory:|getDatabasePath|meshnest\.duckdb"[90m in . · 24 matches[0m
[0m✱ [0mGrep "DuckDbClient|SearchRepository|EmbeddingRepository"[90m in src/services/llm · 0 matches[0m
[0m→ [0mRead electron/main/index.ts
[0m✱ [0mGrep "requestSingleInstanceLock|SearchRepository|EmbeddingRepository"[90m in electron · 7 matches[0m
[0m→ [0mRead electron/main/ipc/databaseIpc.ts
[0m→ [0mRead src/services/llm/embeddingProvider.ts
[0m→ [0mRead src/services/llm/embeddingProviderFactory.ts
[0m
[0m$ [0mls tests/unit tests/e2e 2>/dev/null; ls cypress/e2e 2>/dev/null
tests/e2e:
fixtures
specs
support

tests/unit:
dependencies.spec.ts
directoryScanner.spec.ts
duckdbClient.spec.ts
electronExternalNavigation.spec.ts
embeddingProvider.spec.ts
embeddingProviders.spec.ts
embeddingTable.spec.ts
example.spec.ts
helpers
imageQueryService.spec.ts
indexDirectory.spec.ts
indexModelFile.spec.ts
indexingStore.spec.ts
libraryPage.spec.ts
libraryRepository.spec.ts
libraryStore.spec.ts
mapWithConcurrency.spec.ts
migrations.spec.ts
modelCard.spec.ts
modelDetailService.spec.ts
modelFileRepository.spec.ts
modelMetadataPanel.spec.ts
modelNormalizer.spec.ts
modelPreview3D.spec.ts
providerSettings.spec.ts
renderAssetStorage.spec.ts
renderViews.spec.ts
searchResultCard.spec.ts
searchStore.spec.ts
semanticSearch.spec.ts
settingsStore.spec.ts
setup.ts
stlLoaderService.spec.ts
threeMfLoaderService.spec.ts
threeMfPackageParser.spec.ts
visionProvider.spec.ts
visionProviders.spec.ts
worldSearchAggregator.spec.ts
worldSearchProviderMetadata.spec.ts
worldSearchResultCard.spec.ts
worldSearchSettings.spec.ts
worldSearchStore.spec.ts
[0m
[0m$ [0mls tests/e2e/specs tests/e2e/support
tests/e2e/specs:
test.cy.ts

tests/e2e/support:
commands.ts
e2e.ts
[0m
[0m✱ [0mGrep "duckdb|userData|database"[90m in tests/e2e · 0 matches[0m
[0m
I have verified the ground-truth facts directly in the code (duckdbClient.ts, searchRepository.ts, embeddingTable.ts, migrations.ts, schema.ts, electron/main/services/database.ts, package.json, IPC layer, tests). Here is the plan.

## Objective

**Goal:** Decide and execute the infrastructure path for MeshNest's storage + vector-search stack so that (1) cross-process access errors on the database file are eliminated systematically (not papered over), and (2) embedding generation + vector/ANN search performance is adequate for 10k–100k vectors on a desktop machine — all while remaining Mac App Store-safe (no unsigned runtime downloads), keeping hybrid (vector + lexical) search semantics, and preserving fast `:memory:`-style unit tests.

**Acceptance criteria:**
- Two MeshNest processes (app + dev server / file inspector / second instance) touching the app's data root never produce corruption or unhandled lock errors; conflicts degrade to a controlled, user-facing behavior (second instance forwards to first, external readers get read-only concurrency).
- No unsigned runtime extension downloads on any build flavor; MAS build ships only signed, bundled natives.
- Vector search p95 < ~200 ms at 100k×1536-dim vectors on commodity hardware (validated by a benchmark script committed to the repo).
- Hybrid search (`searchStore` → `database:searchByEmbedding` IPC → repository) returns equivalent-or-better ranked results vs. current implementation on a golden fixture.
- `yarn test:unit`, `yarn lint`, `npm run build`, and `npm run dist:mas` all pass; e2e smoke of the real search flow (index a directory → semantic search) passes.
- Existing `meshnest.duckdb` data (all tables, not just embeddings) is migrated in-app on first launch, with a rollback-safe backup.
- Embeddings for multiple providers/dimensions can coexist; switching providers no longer wipes the table (`EmbeddingDimensionError` path redesigned).

**Step 0 result (from code + git archaeology performed during planning):** No prior work on `main` covers this scope. The newest relevant commits (1e27da3 "Recover from corrupted DuckDB", 742079a hardening, 8cd6e79 MAS packaging) added corruption-recovery wrapping in `electron/main/services/database.ts` but **no** lock-conflict handling, no `app.requestSingleInstanceLock()` (verified absent in `electron/main/index.ts`), no alternate-store abstraction. This is greenfield work, not reconciliation.

---

## Candidate evaluation (decision record for the plan)

| Candidate | Pain #1 (multi-process) | Perf @10k–100k | MAS-safe | Migration cost | Bundle/native | Testability | Maturity |
|---|---|---|---|---|---|---|---|
| **a. DuckDB hardened** | ⚠️ Mitigated only: exclusive `flock` is fundamental; external tools still conflict. Mitigations (single-instance lock, open retry, clear error, read-only copy-on-open for inspectors) reduce the *blast radius* but cannot grant concurrent access. | Good (HNSW), but MAS falls back to brute force | ❌ VSS runtime `INSTALL` downloads unsigned binary; bundling VSS statically is not supported by the node-api distribution | None | Already shipped | ✅ `:memory:` | Good |
| **b. SQLite + sqlite-vec** | ✅ WAL = multi-process readers + single writer; `SQLITE_BUSY` + `busy_timeout` = graceful, retriable conflicts instead of fatal lock errors | Brute-force vec0 only — C-speed linear scan, fine ≤100k×1536 (validate in step 2); no ANN index | ✅ Prebuilt dylib, re-signed by electron-builder like any native module; no runtime downloads | High (full repo port from DuckDB SQL: `TEXT[]`→JSON, `array_cosine_distance`→`vec_distance_cosine`) | ~1–2 MB; better-sqlite3 + sqlite-vec prebuilds | ✅ `:memory:` | Excellent (better-sqlite3), good (sqlite-vec, actively maintained, no ANN roadmap risk at this scale) |
| **c. LanceDB native** | ✅ Directory-based; concurrent readers OK, single-writer model fits the Electron-main-only access pattern | ✅ True ANN (IVF_PQ), fastest at 100k+ | ✅ Prebuilt NAPI binaries, no runtime downloads | High (non-SQL API; all repos rewrite) | ~15–30 MB native | ⚠️ Temp-dir instead of `:memory:` | Good but younger; API churn history |
| **d. usearch / hnswlib-node** | ✅ Index file + separate metadata DB; process-agnostic files | ✅ True ANN, very fast | ✅ Prebuilds signable | Very high (build persistence + durability + sync with metadata store by hand) | Small | ⚠️ | hnswlib-node maintenance is weak; usearch-node better but DIY durability is a real risk |
| **e. Chroma / Qdrant sidecar** | ✅ | ✅ | ❌ Ships a server process; unsigned Go/Rust binaries, sandbox/complexity nightmare for MAS | High | Huge | ❌ | — **rejected**: server-process footprint is wrong for a local-first desktop app |

**Recommendation:**
- **Primary: SQLite + sqlite-vec (better-sqlite3 driver, WAL mode) replacing the whole store.** It is the only option that *structurally* fixes pain #1 (file lock errors stop existing as a class; conflicts become retriable `SQLITE_BUSY`), is trivially MAS-safe, keeps one file (`meshnest.sqlite`) + WAL, restores true `:memory:` tests, and at the stated 10k–100k × ≤1536-dim scale its brute-force scan meets the latency budget — verified by an early benchmark gate that can veto the choice before the port begins.
- **Runner-up: LanceDB**, chosen only if the benchmark shows sqlite-vec misses the latency budget at 100k×1536 (then accept directory-based storage and non-SQL port) — or if DuckDB metadata retention had been required, which it is not.
- **Fallback (documented, not executed):** DuckDB hardening — rejected as primary because it leaves the MAS/VSS fragility and the fundamental exclusive-lock model in place.
- **Embedding generation:** Keep transformers.js/onnxruntime-node as the default provider — it is local-first/offline, already bundled and signed (it already ships in the current MAS build), and performs adequately for per-model one-shot embeddings. Redesign is about *coexistence*, not replacement: per-dimension vector tables so providers/models/dimensions can live side by side and switching providers reuses old embeddings when switching back.

---

## Steps (ordered)

1. **Benchmark + feasibility gate before any porting.** Create `scripts/bench-vector-stores.ts` (plain node script, not wired into the app): generate synthetic embeddings at 1k/10k/50k/100k rows × 384/768/1536 dims; measure insert throughput and p50/p95 cosine top-20 latency for (i) current DuckDB brute force, (ii) better-sqlite3 + sqlite-vec `vec0`, (iii) LanceDB (cheap to include since it's the runner-up). Also smoke-test `db.loadExtension(sqlite-vec)` from an Electron main-process context (small `electron/main` spike) and from a `dist:mas` build artifact to confirm signing/sandbox compliance. Files touched: `scripts/bench-vector-stores.ts` (new), `package.json` (dev-only spikes deps allowed). **Expected outcome:** recorded numbers; go/no-go — proceed with sqlite-vec if p95 ≤ ~200 ms @ 100k×1536; otherwise switch target to LanceDB and adjust steps 3–5 accordingly.

2. **Concurrency hardening of the app shell (independent of store choice).** Add `app.requestSingleInstanceLock()` in `electron/main/index.ts` with a `second-instance` handler that focuses the main window; surface a clear "database in use by another MeshNest process" path only as a last resort. Files touched: `electron/main/index.ts` (add lock + `second-instance`), `tests/unit/electronExternalNavigation.spec.ts`-style new spec `tests/unit/electronSingleInstance.spec.ts`. **Expected outcome:** the common second-app-instance collision is eliminated regardless of store.

3. **Introduce the SQLite storage layer mirroring existing module boundaries.** New module `src/services/database/sqliteClient.ts` exposing the same call shape as `DuckDbClient` (`run`, `all`, `close`, `open(path)` with `:memory:` support, WAL pragma + `busy_timeout` pragmas, sqlite-vec extension load, `vecAvailable` flag mirroring `vssAvailable`). Rewrite `src/services/database/schema.ts` (port DDL: `TEXT[]`→JSON text, `TIMESTAMP`→TEXT ISO strings, `BIGINT`→INTEGER) and `src/services/database/migrations.ts` (same `schema_migrations` pattern; migration IDs reset-prefixed `sqlite_001…` since the runner only applies to SQLite; add `sqlite_002_vec_extension` that creates per-dimension vec tables deterministically). Files touched: create `sqliteClient.ts`; modify `schema.ts`, `migrations.ts`. **Validation gate:** new `tests/unit/sqliteClient.spec.ts` + ported `tests/unit/migrations.spec.ts` pass with `:memory:`.

4. **Port repositories, one file at a time, preserving semantics.** Port in dependency order: `modelFileRepository.ts`, `geometryMetadataRepository.ts`, `threeMfMetadataRepository.ts`, `renderAssetRepository.ts`, `aiDescriptionRepository.ts`, `indexingJobRepository.ts`, `libraryRepository.ts`, `modelDetailService.ts` (each: arrays → JSON columns, DuckDB placeholders `$name` → better-sqlite3 named params, list params rebuilt; **delete** the DuckDB `ARRAY/FLOAT` special-casing and the sparse-vector integer-list workaround in `embeddingRepository.ts` line 62–68, which becomes obsolete). Search/embeddings last: rewrite `src/services/database/embeddingRepository.ts` (schema: `model_embeddings(model_file_id, provider, model, dimensions, source_text, created_at)` holding *all* providers' vectors as JSON blob + per-dimension `vec_model_embeddings_{dims}` `vec0` shadow tables keyed by `model_file_id` — upsert writes to both in a transaction; **remove** the destructive `ensureEmbeddingTable` rebuild in `src/services/database/embeddingTable.ts`, replace with `ensureVecTable(client, dimensions)` that creates the per-dim table if absent and never drops data; `EmbeddingDimensionError` deleted). Rewrite `src/services/database/searchRepository.ts`: primary query against `vec_model_embeddings_{activeDims}` with `distance_cosine` KNN subquery joined to `model_files`/`ai_model_descriptions`/`model_render_assets`, lexical boost CASE-LIKE clauses preserved verbatim with same weights (lines 38–45), same `rank_distance` blending and `score` clamp. Files touched: all named files modified; `duckdbClient.ts` **deleted at the end of this step** only after step 6's migrator is in place (see Dependencies). **Validation gate:** all existing unit specs (ported to open the sqlite client) pass: `semanticSearch.spec.ts`, `embeddingTable.spec.ts` (rewritten as vec-table spec), plus every repository spec listed in `tests/unit/`.

5. **Data migration from existing `meshnest.duckdb`.** New module `electron/main/services/duckdbMigration.ts`: on first launch under the new build, if `userData/meshnest.duckdb` exists and `userData/meshnest.sqlite` does not, open the DuckDB file with `@duckdb/node-api` (dependency retained until a later cleanup release), stream every old table into the new SQLite schema inside transactions, copy embeddings per-row into the correct per-dimension vec table using each row's stored `dimensions`, verify row counts, then rename the old files to `meshnest.duckdb.migrated-<timestamp>` (backup, never delete — mirrors the existing `backupCorruptDatabaseFiles` pattern in `electron/main/services/database.ts` lines 111–117). Update `electron/main/services/database.ts`: open the SQLite client, run sqlite migrations, call the migrator before serving IPC handlers; keep the fatal-error recovery wrapper (simplified — `SQLITE_BUSY` gets retry-with-backoff, corruption gets the existing rename-and-recreate path). Update `electron/main/services/appDataPaths.ts` line 13–15 (`getDatabasePath` → `meshnest.sqlite`; add `getLegacyDuckDbPath()`). Update `electron/main/services/embeddingService.ts` and `electron/main/ipc/databaseIpc.ts` only for import changes (repository signatures unchanged — IPC and preload surface stay stable). **Validation gate:** new `tests/unit/duckdbMigration.spec.ts` (seed a DuckDB file in a temp dir at test time — the dep is still present — then assert all tables + per-dim vec rows land intact); manual smoke: run new build over a real 1.0.4 userData and search.

6. **Dependencies, packaging, and MAS hygiene.** `package.json`: remove `@duckdb/node-api` (only after step 5 merges; alternatively keep one release with a `// legacy migration only` comment, then remove — decision recorded in PR), add `better-sqlite3` + `sqlite-vec`; update `asarUnpack` (add `**/node_modules/better-sqlite3/**`, sqlite-vec binaries) and `allowScripts`; verify `npmRebuild` story for both natives. Confirm `npm run dist:mas` produces a build where the app boots, creates the DB, and runs a search (App Review regression). Files touched: `package.json`; no source changes. **Validation gate:** `npm run dist:mas` artifact boots and passes a signed-build smoke checklist.

7. **Repository hygiene + e2e validation.** Update `AGENTS.md`/docs references to DuckDB; `tests/e2e/specs/test.cy.ts` add an e2e smoke that exercises the real flow (point app at a fixtures directory → index → run semantic search → assert a result card renders) — this is the "real app search flow" gate. Full suite: `yarn test:unit`, `npm run lint` (eslint), `npm run build` (vue-tsc), Cypress run.

## Dependencies

- Step 2 (single-instance lock) is independent; can ship before or with the migration.
- Step 3 depends on Step 1 (needs the chosen target confirmed by the benchmark).
- Step 4 depends on Step 3; substeps may parallelize across repositories with a shared client interface.
- Step 5 depends on Step 4 fully green (migration needs ported repositories) and requires `@duckdb/node-api` still installed.
- Step 6 depends on Step 5 (dependency removal, packaging).
- Step 7 depends on all prior.

## Risks / Open questions

- **Benchmark could veto the primary choice.** If sqlite-vec p95 at 100k×1536 misses the bar (threshold to be fixed with the owner before Step 1 — suggested 200 ms), switch the plan to LanceDB: Steps 3–4 become a non-SQL rewrite (bigger) and Step 5 migrator stays the same shape. **Open question:** confirm the latency budget with the owner before executing Step 1.
- **MAS entitlements for extension loading.** Loading `sqlite-vec` as a dynamically loaded extension may require `com.apple.security.cs.disable-library-validation` after re-signing; must be confirmed by the Step 1/6 MAS artifact smoke. If blocked, fallback: statically link vec0 by compiling against better-sqlite3's `sqlite3` bundle or pin the vector table as a plain BLOB column with a JS cosine fallback for search (still fixes pain #1, keeps the latency risk).
- **Cross-provider search semantics.** With per-dimension tables, search always uses the *active* provider's table; embeddings from other providers are retained but ignored. **Open question:** should the UI prompt "N models missing embeddings for this provider — re-embed?" (reuses existing `reembedAllModels` flow) — confirm desired UX before Step 4's searchRepository port.
- **One-release dependency tail.** Until Step 6 removes it, `@duckdb/node-api` remains installed purely for the migration path — flag so App Review binary size doesn't regress unnoticed.
- **Hybrid-score calibration.** After moving from DuckDB's `array_cosine_distance` to `vec_distance_cosine`, numerical equality is expected (both are 1 − cosine similarity) but the golden-fixture test in Step 7 should assert ordering, not exact floats, to avoid flaky precision failures.
- **`npmRebuild: false` is currently set** in `package.json`; better-sqlite3 prebuilds must be fetched for the right Electron ABI — confirm whether prebuild-install suffices or `npmRebuild` must flip to `true` (packaging detail for Step 6).
[0m
