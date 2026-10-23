# SQLite + sqlite-vec Migration Learnings

## Multi-Dimension Coexistence
- Per-dimension `vec0` shadow tables (`vec_model_embeddings_${dimensions}`) allow switching providers (e.g. 384-dim MiniLM vs 1536-dim OpenAI) without dropping and recreating tables or losing past vectors.
- In `searchByEmbedding`, always check `countEmbeddings() === 0` to return `NoEmbeddingsError` before checking query vector dimension matching, avoiding false dimension errors when the database has no rows.

## Parameterized Query Bindings
- SQLite named parameters (`@name` or `:name`) work natively with better-sqlite3 statements. Unlike DuckDB positional `$name` syntax, better-sqlite3 binds objects with keys matching `@name` or `:name`.
- SQLite virtual `vec0` tables accept `Float32Array` objects as query vectors in `MATCH` queries.

## Concurrency and Locks
- While SQLite in WAL mode handles multiple readers and single writer, transient `SQLITE_BUSY` conflicts can occur during high concurrency. Wrapping client calls with exponential backoff retry gracefully resolves these conflicts without failing user actions.
