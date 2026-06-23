import type { DuckDbClient } from './duckdbClient'
import {
  CREATE_AI_MODEL_DESCRIPTIONS,
  CREATE_GEOMETRY_METADATA,
  CREATE_HNSW_INDEX,
  CREATE_INDEXES,
  CREATE_INDEXING_JOBS,
  CREATE_MODEL_EMBEDDINGS,
  CREATE_MODEL_FILES,
  CREATE_MODEL_RENDER_ASSETS,
  CREATE_THREE_MF_METADATA,
} from './schema'

export type Migration = {
  /** Stable unique identifier; applied migrations are never re-run. */
  id: string
  statements: string[]
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_initial_schema',
    statements: [
      CREATE_MODEL_FILES,
      CREATE_GEOMETRY_METADATA,
      CREATE_THREE_MF_METADATA,
      CREATE_MODEL_RENDER_ASSETS,
      CREATE_AI_MODEL_DESCRIPTIONS,
      CREATE_MODEL_EMBEDDINGS,
      CREATE_INDEXING_JOBS,
      ...CREATE_INDEXES,
    ],
  },
  {
    id: '002_embeddings_hnsw_index',
    statements: [CREATE_HNSW_INDEX],
  },
  {
    id: '003_model_files_absolute_path_non_unique',
    statements: [
      'DROP INDEX IF EXISTS idx_model_files_absolute_path;',
      'CREATE INDEX IF NOT EXISTS idx_model_files_absolute_path ON model_files (absolute_path);',
    ],
  },
]

const CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT now()
);`

/**
 * Applies all pending migrations. Safe to call more than once: applied
 * migrations are tracked in schema_migrations and every statement is
 * idempotent as a second safety net.
 */
export async function runMigrations(client: DuckDbClient): Promise<string[]> {
  await client.run(CREATE_SCHEMA_MIGRATIONS)

  const appliedRows = await client.all<{ id: string }>('SELECT id FROM schema_migrations')
  const applied = new Set(appliedRows.map((row) => row.id))

  const newlyApplied: string[] = []
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue
    }
    for (const statement of migration.statements) {
      await client.run(statement)
    }
    await client.run('INSERT INTO schema_migrations (id) VALUES ($id)', { id: migration.id })
    newlyApplied.push(migration.id)
  }
  return newlyApplied
}
