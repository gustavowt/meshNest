# Vector store benchmark — Phase 1 feasibility gate (PLAN.md Step 1)

Decision record produced on the machine running MeshNest desktop (see [Machine](#machine)),
with `scripts/bench-vector-stores.ts` (committed in `4b04707`, benchmark arm updated to
cosine metric in `c997d73`). The raw per-run JSON (`--out`) is an ephemeral `/tmp` artifact and is not
persisted in the repo; all numbers in this document come from the invocation logs, and both
invocations are reproducible via
`node --experimental-strip-types scripts/bench-vector-stores.ts [--rows <list>] [--out <path>]`.

## Machine

| Item | Value |
|---|---|
| Model | MacBookAir7,2 (MacBook Air, early 2015) |
| CPU | Intel Core i5-5350U @ 1.80 GHz (dual-core, 4 logical CPUs) |
| RAM | 8 GB |
| OS | macOS 12.7.6 (darwin, x64) |
| Node | 22.23.4 |

**Hardware caveat (read before the decision):** this machine is a 10-year-old dual-core
ultraportable. The budget in PLAN.md is stated against *commodity hardware*; measured p95
latencies here are upper-bound pessimistic vs. any current consumer machine. Re-measure on
the owner's target hardware before locking the Phase 2 port (Step 3).

## Methodology

- Synthetic embeddings, unit-normalized (the exact shape the app pays for per row),
  generated at 1k / 10k / 50k / 100k rows x 384 / 768 / 1536 dims.
- Each (rows x dims) dataset is loaded into each store fresh; insert throughput measured
  for the full dataset, then 5 warmup queries (discarded) + 100 timed queries.
- Query = cosine top-20 over the whole table (brute force everywhere — see per-store notes).
- VSS note: the DuckDB VSS extension is deliberately NOT loaded — that mirrors the
  MAS-real brute-force mode our `DuckDbClient` uses on Mac App Store builds
  (`array_cosine_distance`).
- sqlite-vec 0.1.9 `vec0` virtual table, float32 BLOB binding (little-endian), created
  with `distance_metric=cosine` so its ranking is comparable with `array_cosine_distance`
  (earlier drafts relied on L2-ranking-is-cosine-when-unit-normalized; the explicit
  cosine metric removes that caveat).
- LanceDB pinned to 0.22.3: every stable release after 0.23.0 ships no darwin-x64 native
  binding, so 0.40.0 cannot even load on this platform.
- The 27 runs for 1k/10k/50k were measured in one invocation (2026-10-22 08:50-09:17 PDT);
  the owner-side process died mid-way through the 100k band, which was re-run in a second
  invocation (11:14-11:32 PDT) and completed all 9 remaining runs. Same machine, same script
  version (`c997d73`), same day.

## Results

All values are means over the run in question (insert = full-dataset wall time; p50/p95 =
100 cosine top-20 queries). `—` none: no runs failed (36/36 ok).

| rows | dims | store | insert (ms) | insert (rows/s) | p50 (ms) | p95 (ms) |
|---:|---:|---|---:|---:|---:|---:|
| 1000 | 384 | duckdb | 2666.13 | 375 | 5.79 | 6.63 |
| 1000 | 384 | sqlite-vec | 63.39 | 15774 | 2.65 | 3.22 |
| 1000 | 384 | lancedb | 135.62 | 7374 | 9.09 | 9.85 |
| 1000 | 768 | duckdb | 4236.78 | 236 | 8.97 | 10.94 |
| 1000 | 768 | sqlite-vec | 98.68 | 10134 | 5.11 | 5.41 |
| 1000 | 768 | lancedb | 195.87 | 5106 | 12.53 | 12.88 |
| 1000 | 1536 | duckdb | 7437.53 | 134 | 16.36 | 20.30 |
| 1000 | 1536 | sqlite-vec | 179.29 | 5577 | 11.24 | 11.64 |
| 1000 | 1536 | lancedb | 290.96 | 3437 | 21.16 | 21.41 |
| 10000 | 384 | duckdb | 47140.47 | 212 | 19.93 | 20.40 |
| 10000 | 384 | sqlite-vec | 575.44 | 17378 | 23.67 | 24.12 |
| 10000 | 384 | lancedb | 712.27 | 14040 | 30.98 | 31.91 |
| 10000 | 768 | duckdb | 44012.00 | 227 | 37.25 | 40.57 |
| 10000 | 768 | sqlite-vec | 910.33 | 10985 | 48.11 | 48.94 |
| 10000 | 768 | lancedb | 1177.95 | 8489 | 65.95 | 68.64 |
| 10000 | 1536 | duckdb | 77192.48 | 130 | 71.05 | 78.67 |
| 10000 | 1536 | sqlite-vec | 1526.03 | 6553 | 97.73 | 99.27 |
| 10000 | 1536 | lancedb | 2217.08 | 4510 | 120.97 | 123.90 |
| 50000 | 384 | duckdb | 166504.02 | 300 | 79.70 | 84.19 |
| 50000 | 384 | sqlite-vec | 2641.99 | 18925 | 115.85 | 120.08 |
| 50000 | 384 | lancedb | 3045.38 | 16418 | 132.12 | 136.13 |
| 50000 | 768 | duckdb | 225483.15 | 222 | 154.49 | 162.14 |
| 50000 | 768 | sqlite-vec | 3969.53 | 12596 | 237.70 | 240.42 |
| 50000 | 768 | lancedb | 5293.66 | 9445 | 284.91 | 293.32 |
| 50000 | 1536 | duckdb | 398226.76 | 126 | 307.78 | 328.12 |
| 50000 | 1536 | sqlite-vec | 7671.35 | 6518 | 478.06 | 483.10 |
| 50000 | 1536 | lancedb | 10379.78 | 4817 | 687.37 | 730.38 |
| 100000 | 384 | duckdb | 320767.37 | 312 | 150.54 | 164.79 |
| 100000 | 384 | sqlite-vec | 5057.31 | 19773 | 233.08 | 235.44 |
| 100000 | 384 | lancedb | 5865.03 | 17050 | 268.98 | 277.56 |
| 100000 | 768 | duckdb | 465460.85 | 215 | 294.20 | 309.71 |
| 100000 | 768 | sqlite-vec | 8072.66 | 12387 | 476.13 | 480.53 |
| 100000 | 768 | lancedb | 10532.26 | 9495 | 656.97 | 678.41 |
| 100000 | 1536 | duckdb | 829086.78 | 121 | 603.79 | 622.16 |
| 100000 | 1536 | sqlite-vec | 14858.41 | 6730 | 957.36 | 961.77 |
| 100000 | 1536 | lancedb | 19907.01 | 5023 | 1193.75 | 1288.29 |


### The decision cell: rows 100000 x dims 1536 (p95, cosine top-20)

| Store | p50 (ms) | p95 (ms) | Insert rows/s |
|---|---:|---:|---:|
| duckdb (brute force, VSS not loaded) | 603.79 | 622.16 | 121 |
| sqlite-vec (vec0 cosine) | 957.36 | 961.77 | 6,730 |
| LanceDB | 1193.75 | 1288.29 | 5,023 |

## Decision (explicit GO/NO-GO line)

> **Gate: NO-GO for sqlite-vec as primary** — sqlite-vec p95 cosine top-20 at 100k x 1536 =
> **961.77 ms**, which misses the 200 ms budget by 4.8x. Per PLAN.md, missing the budget
> flips the primary to **LanceDB**; on this machine LanceDB is measured (p95 1288.29 ms) and
> **also misses the budget — and is strictly slower than both sqlite-vec and DuckDB at every
> (rows x dims) cell.** Even DuckDB brute force misses the budget at that cell (622.16 ms p95;
> its only sub-200 ms cell in the 100k band is 384 dims, at 164.79 ms), so **no candidate
> meets the 200 ms budget at 100k x 1536 on this hardware.**

Interpretation recorded for the owner:

1. As measured, the plan's fallback logic leads to LanceDB, but LanceDB's true-ANN index is
   paying off only at scales beyond 100k rows here, and its insert/p95 profile is worse than
   sqlite-vec's at every point of the grid. Following the letter of the plan would choose the
   slowest store on the deciding cell.
2. The deciding numbers contradict the plan's assumption ("C-speed linear scan, fine at
   100k x 1536") only on this hardware; on 2024+ consumer CPUs every linear scan candidate
   is expected to drop well under the budget — this must be verified on the target machine
   before Step 3 (the Phase 2 port) starts, per the hardware caveat above.
3. Notable non-gate finding: sqlite-vec dominates the grid on insert throughput
   (6,730 rows/s at 100k x 1536 vs DuckDB's 121 rows/s — ~56x), and DuckDB's insert at
   100k x 1536 takes ~14 minutes. Insert cost matters for the app's re-indexing story.

**Recommended next step (owner call):** re-run this benchmark on the owner's target hardware
(`node --experimental-strip-types scripts/bench-vector-stores.ts --rows 100000`) before
committing Phase 2 to a store — the gate outcome there decides sqlite-vec vs LanceDB per plan.
If no decision is made, Phase 2 stays blocked on Step 3 by definition (it depends on Step 1).

## Electron main-process load spike (PLAN.md Step 1 evidence)

Two spikes committed in `4b04707`; both dynamically import better-sqlite3 + sqlite-vec
inside try/catch so an ABI failure becomes printed evidence instead of a crash, and both
exercise the full path: open temp DB -> load extension -> create small `vec0` table -> insert
-> KNN query. Re-run on this machine with the commit above (2026-10-22, exit code 0):

```json
{"context":"node","node":"22.23.4","ok":true,"steps":{"open":true,"load":true,"createTable":true,"insert":true,"knn":true},"error":null}
```

```json
{"context":"electron-main","versions":{"electron":"42.4.0","node":"24.16.0","modules":"146"},"ok":true,"steps":{"open":true,"load":true,"createTable":true,"insert":true,"knn":true},"error":null}
```

- **Node context** (`scripts/spike-sqlite-vec.mjs`): all 5 steps pass under plain node.
- **Electron main context** (`scripts/spike-sqlite-vec-electron.mjs`, run headless with the
  project's `npx electron`): all 5 steps pass — the native load path works inside the real
  Electron runtime that MeshNest ships, no `npm rebuild` needed (prebuilts matched ABI 146).
- **Dynamic-extension-load path:** `db.loadExtension(sqliteVec.getLoadablePath())` under
  better-sqlite3; the sqlite-vec package ships a prebuilt dylib next to the JS entry point,
  so no compile-time linkage and no runtime download.
- **Expected MAS signing implications:** electron-builder re-signs the shipped dylib
  alongside bundled native modules as it already does for onnxruntime/duckdb natives;
  loading via `loadExtension` may additionally require the
  `com.apple.security.cs.disable-library-validation` entitlement once the build is
  sandboxed. The real `dist:mas` artifact smoke is scheduled for Phase 2 (PLAN.md Step 6)
  and is explicitly out of scope here.
- Note: the Electron spike run printed an unrelated macOS `os_crypt`/Keychain warning
  (`errKCInteractionNotAllowed`) from going headless without a user session — the spike
  itself exits 0 with `ok: true`.
