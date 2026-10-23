# meshNest

A local-first desktop application that indexes, previews, categorizes, and semantically searches `.stl` and `.3mf` files used in 3D printing.

Built with **Ionic + Vue 3** for the UI and **Electron** for local filesystem and database access.

## Getting Started

```bash
npm install
npm run dev        # web dev server (UI only)
npm run test:unit  # unit tests
npm run build      # type-check + production build
```

See [DEVELOPER.md](./DEVELOPER.md) for architecture and project structure details.

## Dependencies

Each dependency exists to serve a planned service of the indexing/search pipeline:

| Dependency | Why it exists |
| --- | --- |
| `three` | Loads STL (`STLLoader`) and 3MF (`ThreeMFLoader`) files, powers the interactive 3D preview and the deterministic multi-view renderer used for AI descriptions. |
| `@types/three` (dev) | TypeScript definitions for Three.js examples/loaders. |
| `fflate` | Opens `.3mf` files as ZIP packages to extract internal metadata, thumbnails, and model XML. |
| `fast-xml-parser` | Parses 3MF model XML (`3D/3dmodel.model`, `[Content_Types].xml`) for object names, materials, and colors. |
| `zod` | Validates structured JSON returned by the vision LLM before it is persisted. |
| `better-sqlite3` | Local SQLite database storing model files, geometry metadata, AI descriptions, and embeddings in WAL mode with busy retry handling. Runs in the Electron main process. |
| `sqlite-vec` | Vector search extension (`vec0`) providing fast cosine KNN search over float32 embedding vectors across providers and dimensions. |
| `@duckdb/node-api` | Legacy data migration only: one-shot migrator streaming pre-existing `meshnest.duckdb` files to SQLite upon initial launch. |
| `electron` (dev) | Desktop shell providing local filesystem access, the SQLite host process, and the IPC bridge to the UI. |
| `vite-plugin-electron` (dev) | Builds and runs the Electron main/preload code alongside the existing Vite setup. |

File hashing uses Node's built-in `crypto` module (in the Electron main process), so no extra hashing library is needed.
