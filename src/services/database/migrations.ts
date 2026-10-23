import type { DuckDbClient } from './duckdbClient'
import type { SqliteClient } from './sqliteClient'
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
  SQLITE_CREATE_SCHEMA_MIGRATIONS,
  SQLITE_INITIAL_SCHEMA_STATEMENTS,
  buildVecTableSql,
  getVecTableName,
} from './schema'

export type Migration = {
  /** Stable unique identifier; applied migrations are never re-run. */
  id: string
  statements: string[]
}

export const SQLITE_MIGRATIONS: Migration[] = [
  {
    id: 'sqlite_001_initial_schema',
    statements: SQLITE_INITIAL_SCHEMA_STATEMENTS,
  },
  {
    id: 'sqlite_002_vec_extension',
    statements: ['SELECT vec_version();'],
  },
]

export const MIGRATIONS = SQLITE_MIGRATIONS

export const DUCKDB_MIGRATIONS: Migration[] = [
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

const DUCKDB_CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT now()
);`

/**
 * Ensures a virtual vec0 table exists for the given embedding dimension.
 * Throws if sqlite-vec is unavailable or dimensions is invalid.
 */
export async function ensureVecTable(
  client: SqliteClient,
  dimensions: number,
): Promise<string> {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(`Dimensions must be a positive integer, received: ${dimensions}`)
  }
  if (!client.vecAvailable) {
    throw new Error('Cannot ensure vec table: sqlite-vec extension is not available')
  }

  const tableName = getVecTableName(dimensions)
  const sql = buildVecTableSql(dimensions)
  await client.run(sql)
  return tableName
}

async function runSqliteMigrations(client: SqliteClient): Promise<string[]> {
  await client.run(SQLITE_CREATE_SCHEMA_MIGRATIONS)

  const appliedRows = await client.all<{ id: string }>('SELECT id FROM schema_migrations')
  const applied = new Set(appliedRows.map((row) => row.id))

  const newlyApplied: string[] = []
  for (const migration of SQLITE_MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue
    }
    if (migration.id === 'sqlite_002_vec_extension' && !client.vecAvailable) {
      await client.run("INSERT INTO schema_migrations (id) VALUES ('sqlite_002_vec_extension');")
      newlyApplied.push(migration.id)
      continue
    }
    for (const statement of migration.statements) {
      await client.run(statement)
    }
    await client.run('INSERT INTO schema_migrations (id) VALUES (?);', [migration.id])
    newlyApplied.push(migration.id)
  }
  return newlyApplied
}

async function runDuckDbMigrations(client: DuckDbClient): Promise<string[]> {
  await client.run(DUCKDB_CREATE_SCHEMA_MIGRATIONS)

  const appliedRows = await client.all<{ id: string }>('SELECT id FROM schema_migrations')
  const applied = new Set(appliedRows.map((row) => row.id))

  const newlyApplied: string[] = []
  for (const migration of DUCKDB_MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue
    }
    // Without VSS the HNSW index type is unavailable. Still record the
    // migration so MAS / enableVss:false clients do not retry forever.
    if (migration.id === '002_embeddings_hnsw_index' && !client.vssAvailable) {
      await client.run('INSERT INTO schema_migrations (id) VALUES ($id)', { id: migration.id })
      newlyApplied.push(migration.id)
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

/**
 * Applies all pending migrations. Safe to call more than once: applied
 * migrations are tracked in schema_migrations and every statement is
 * idempotent as a second safety net.
 *
 * Supports both SqliteClient and legacy DuckDbClient.
 */
export async function runMigrations(
  client: SqliteClient | DuckDbClient,
): Promise<string[]> {
  if ('vssAvailable' in client) {
    return runDuckDbMigrations(client)
  }
  return runSqliteMigrations(client)
}
