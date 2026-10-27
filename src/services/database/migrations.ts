import type { SqliteClient } from './sqliteClient'
import {
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

/**
 * Applies all pending migrations. Safe to call more than once: applied
 * migrations are tracked in schema_migrations and every statement is
 * idempotent as a second safety net.
 */
export async function runMigrations(
  client: SqliteClient,
): Promise<string[]> {
  return runSqliteMigrations(client)
}
