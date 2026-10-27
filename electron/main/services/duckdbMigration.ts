import fs from 'node:fs'
import path from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import type Database from 'better-sqlite3'
import { SqliteClient } from '../../../src/services/database/sqliteClient'
import { ensureVecTable, runMigrations } from '../../../src/services/database/migrations'
import { getDatabasePath, getLegacyDuckDbPath } from './appDataPaths'

export interface DuckDbMigrationOptions {
  duckdbPath?: string
  sqlitePath?: string
  sqliteClient?: SqliteClient
  _testHook?: (rawDb: Database.Database) => void
}

export interface DuckDbMigrationResult {
  migrated: boolean
  reason?: string
  backupPath?: string
  tablesMigrated?: Record<string, number>
}

const TABLES_TO_MIGRATE = [
  'model_files',
  'geometry_metadata',
  'three_mf_metadata',
  'model_render_assets',
  'ai_model_descriptions',
  'model_embeddings',
  'indexing_jobs',
] as const

function toIsoTimestamp(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'number') return new Date(val).toISOString()
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      return trimmed
    }
    const normalized = trimmed.replace(' ', 'T')
    const withZ = normalized.endsWith('Z') ? normalized : `${normalized}Z`
    const parsed = new Date(withZ)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
    return trimmed
  }
  return String(val)
}

function toSqliteBoolean(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (val === true || val === 1 || val === 'true') return 1
  if (val === false || val === 0 || val === 'false') return 0
  return val ? 1 : 0
}

function toJsonArrayString(val: unknown): string {
  if (Array.isArray(val)) {
    return JSON.stringify(val)
  }
  if (typeof val === 'string') {
    return val
  }
  return JSON.stringify([])
}

export async function migrateDuckDbToSqlite(
  options?: DuckDbMigrationOptions,
): Promise<DuckDbMigrationResult> {
  const duckdbPath = options?.duckdbPath ?? getLegacyDuckDbPath()

  if (!fs.existsSync(duckdbPath)) {
    return { migrated: false, reason: 'no-legacy-duckdb' }
  }

  const sqlitePath = !options?.sqliteClient
    ? (options?.sqlitePath ?? getDatabasePath())
    : options?.sqlitePath

  if (!options?.sqliteClient && sqlitePath && fs.existsSync(sqlitePath)) {
    return { migrated: false, reason: 'sqlite-already-exists' }
  }

  const shouldCloseSqlite = !options?.sqliteClient
  let sqliteClient: SqliteClient | undefined = options?.sqliteClient
  let instance: DuckDBInstance | undefined
  let connection: DuckDBConnection | undefined

  try {
    if (!sqliteClient) {
      const resolvedSqlitePath = sqlitePath ?? getDatabasePath()
      const sqliteDir = path.dirname(resolvedSqlitePath)
      if (!fs.existsSync(sqliteDir)) {
        fs.mkdirSync(sqliteDir, { recursive: true })
      }
      sqliteClient = await SqliteClient.open(resolvedSqlitePath)
    }

    await runMigrations(sqliteClient)

    instance = await DuckDBInstance.create(duckdbPath)
    connection = await instance.connect()

    const tablesQuery = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
    )
    const existingTableNames = new Set(
      tablesQuery
        .getRowObjectsJson()
        .map((row) => String(row.table_name ?? '').toLowerCase()),
    )

    const tableData: Partial<Record<(typeof TABLES_TO_MIGRATE)[number], Record<string, unknown>[]>> = {}
    for (const table of TABLES_TO_MIGRATE) {
      if (existingTableNames.has(table)) {
        const reader = await connection.runAndReadAll(`SELECT * FROM ${table}`)
        tableData[table] = reader.getRowObjectsJson() as Record<string, unknown>[]
      }
    }

    const embeddingRows = tableData.model_embeddings ?? []
    const distinctDims = new Set<number>()
    for (const row of embeddingRows) {
      const dims = Number(row.dimensions ?? 0)
      if (Number.isInteger(dims) && dims > 0) {
        distinctDims.add(dims)
      }
    }

    const vecStmts = new Map<number, Database.Statement>()
    if (sqliteClient.vecAvailable && existingTableNames.has('model_embeddings')) {
      for (const dims of distinctDims) {
        await ensureVecTable(sqliteClient, dims)
        vecStmts.set(
          dims,
          sqliteClient.rawDb.prepare(
            `INSERT INTO vec_model_embeddings_${dims} (model_file_id, embedding) VALUES (?, ?)`,
          ),
        )
      }
    }

    const tablesMigrated: Record<string, number> = {}
    for (const table of TABLES_TO_MIGRATE) {
      if (existingTableNames.has(table) && tableData[table]) {
        tablesMigrated[table] = tableData[table]!.length
      }
    }

    const rawDb = sqliteClient.rawDb
    const tx = rawDb.transaction(() => {
      if (existingTableNames.has('model_files') && tableData.model_files) {
        const insertModelFile = rawDb.prepare(`
          INSERT INTO model_files (
            id, project_id, absolute_path, relative_path, filename, extension,
            size_bytes, modified_at, content_hash, indexed_at, status, error_message,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.model_files) {
          insertModelFile.run(
            String(row.id),
            String(row.project_id),
            String(row.absolute_path),
            String(row.relative_path),
            String(row.filename),
            String(row.extension),
            Number(row.size_bytes ?? 0),
            toIsoTimestamp(row.modified_at) ?? new Date().toISOString(),
            String(row.content_hash),
            toIsoTimestamp(row.indexed_at),
            String(row.status),
            row.error_message != null ? String(row.error_message) : null,
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
            toIsoTimestamp(row.updated_at) ?? new Date().toISOString(),
          )
        }
      }

      if (existingTableNames.has('geometry_metadata') && tableData.geometry_metadata) {
        const insertGeometry = rawDb.prepare(`
          INSERT INTO geometry_metadata (
            model_file_id, width_mm, height_mm, depth_mm, triangle_count, vertex_count,
            mesh_count, object_count, surface_area_mm2, volume_mm3, is_watertight, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.geometry_metadata) {
          insertGeometry.run(
            String(row.model_file_id),
            row.width_mm != null ? Number(row.width_mm) : null,
            row.height_mm != null ? Number(row.height_mm) : null,
            row.depth_mm != null ? Number(row.depth_mm) : null,
            row.triangle_count != null ? Number(row.triangle_count) : null,
            row.vertex_count != null ? Number(row.vertex_count) : null,
            row.mesh_count != null ? Number(row.mesh_count) : null,
            row.object_count != null ? Number(row.object_count) : null,
            row.surface_area_mm2 != null ? Number(row.surface_area_mm2) : null,
            row.volume_mm3 != null ? Number(row.volume_mm3) : null,
            toSqliteBoolean(row.is_watertight),
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )
        }
      }

      if (existingTableNames.has('three_mf_metadata') && tableData.three_mf_metadata) {
        const insertThreeMf = rawDb.prepare(`
          INSERT INTO three_mf_metadata (
            model_file_id, object_names, material_names, color_values,
            has_thumbnail, thumbnail_internal_path, raw_metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.three_mf_metadata) {
          insertThreeMf.run(
            String(row.model_file_id),
            toJsonArrayString(row.object_names),
            toJsonArrayString(row.material_names),
            toJsonArrayString(row.color_values),
            toSqliteBoolean(row.has_thumbnail),
            row.thumbnail_internal_path != null ? String(row.thumbnail_internal_path) : null,
            row.raw_metadata_json != null
              ? typeof row.raw_metadata_json === 'string'
                ? row.raw_metadata_json
                : JSON.stringify(row.raw_metadata_json)
              : null,
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )
        }
      }

      if (existingTableNames.has('model_render_assets') && tableData.model_render_assets) {
        const insertRenderAsset = rawDb.prepare(`
          INSERT INTO model_render_assets (
            id, model_file_id, view_name, absolute_path, width, height, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.model_render_assets) {
          insertRenderAsset.run(
            String(row.id),
            String(row.model_file_id),
            String(row.view_name),
            String(row.absolute_path),
            Number(row.width ?? 0),
            Number(row.height ?? 0),
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )
        }
      }

      if (existingTableNames.has('ai_model_descriptions') && tableData.ai_model_descriptions) {
        const insertAiDescription = rawDb.prepare(`
          INSERT INTO ai_model_descriptions (
            model_file_id, short_name, description, likely_category, tags,
            objects_detected, print_use, style, confidence, search_phrases,
            raw_response_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.ai_model_descriptions) {
          insertAiDescription.run(
            String(row.model_file_id),
            String(row.short_name),
            String(row.description),
            String(row.likely_category),
            toJsonArrayString(row.tags),
            toJsonArrayString(row.objects_detected),
            row.print_use != null ? String(row.print_use) : null,
            row.style != null ? String(row.style) : null,
            Number(row.confidence ?? 0),
            toJsonArrayString(row.search_phrases),
            row.raw_response_json != null
              ? typeof row.raw_response_json === 'string'
                ? row.raw_response_json
                : JSON.stringify(row.raw_response_json)
              : '{}',
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )
        }
      }

      if (existingTableNames.has('model_embeddings') && tableData.model_embeddings) {
        const insertEmbedding = rawDb.prepare(`
          INSERT INTO model_embeddings (
            model_file_id, provider, model, dimensions, embedding, source_text, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.model_embeddings) {
          const dims = Number(row.dimensions ?? 0)
          let embeddingArray: number[] = []
          if (Array.isArray(row.embedding)) {
            embeddingArray = row.embedding.map(Number)
          } else if (row.embedding instanceof Float32Array) {
            embeddingArray = Array.from(row.embedding)
          } else if (typeof row.embedding === 'string') {
            try {
              const parsed = JSON.parse(row.embedding)
              embeddingArray = Array.isArray(parsed) ? parsed.map(Number) : []
            } catch {
              embeddingArray = []
            }
          }

          insertEmbedding.run(
            String(row.model_file_id),
            String(row.provider),
            String(row.model),
            dims,
            JSON.stringify(embeddingArray),
            String(row.source_text ?? ''),
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )

          if (sqliteClient!.vecAvailable && dims > 0 && embeddingArray.length === dims) {
            const vecStmt = vecStmts.get(dims)
            if (vecStmt) {
              vecStmt.run(
                String(row.model_file_id),
                Float32Array.from(embeddingArray),
              )
            }
          }
        }
      }

      if (existingTableNames.has('indexing_jobs') && tableData.indexing_jobs) {
        const insertJob = rawDb.prepare(`
          INSERT INTO indexing_jobs (
            id, model_file_id, absolute_path, job_type, status, error_message,
            started_at, finished_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of tableData.indexing_jobs) {
          insertJob.run(
            String(row.id),
            row.model_file_id != null ? String(row.model_file_id) : null,
            String(row.absolute_path),
            String(row.job_type),
            String(row.status),
            row.error_message != null ? String(row.error_message) : null,
            toIsoTimestamp(row.started_at),
            toIsoTimestamp(row.finished_at),
            toIsoTimestamp(row.created_at) ?? new Date().toISOString(),
          )
        }
      }

      if (options?._testHook) {
        options._testHook(rawDb)
      }

      for (const [table, duckCount] of Object.entries(tablesMigrated)) {
        const row = rawDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as
          | { c: number | bigint }
          | undefined
        const sqliteCount = Number(row?.c ?? 0)
        if (sqliteCount !== duckCount) {
          throw new Error(
            `Migration row count mismatch for ${table}: duckdb=${duckCount}, sqlite=${sqliteCount}`,
          )
        }
      }

      if (sqliteClient!.vecAvailable && existingTableNames.has('model_embeddings')) {
        const embeddingRows = tableData.model_embeddings ?? []
        for (const dims of distinctDims) {
          const expectedCount = embeddingRows.filter(
            (r) => Number(r.dimensions ?? 0) === dims,
          ).length
          const row = rawDb
            .prepare(`SELECT COUNT(*) as c FROM vec_model_embeddings_${dims}`)
            .get() as { c: number | bigint } | undefined
          const sqliteVecCount = Number(row?.c ?? 0)
          if (sqliteVecCount !== expectedCount) {
            throw new Error(
              `Migration row count mismatch for vec_model_embeddings_${dims}: duckdb=${expectedCount}, sqlite=${sqliteVecCount}`,
            )
          }
        }
      }
    })

    tx()

    if (connection) {
      connection.closeSync()
      connection = undefined
    }
    if (instance) {
      instance.closeSync()
      instance = undefined
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${duckdbPath}.migrated-${timestamp}`
    fs.renameSync(duckdbPath, backupPath)

    for (const companion of [`${duckdbPath}.wal`, `${duckdbPath}-wal`]) {
      if (fs.existsSync(companion)) {
        fs.renameSync(companion, `${companion}.migrated-${timestamp}`)
      }
    }

    return {
      migrated: true,
      backupPath,
      tablesMigrated,
    }
  } finally {
    if (connection) {
      try {
        connection.closeSync()
      } catch {
        // ignore
      }
    }
    if (instance) {
      try {
        instance.closeSync()
      } catch {
        // ignore
      }
    }
    if (shouldCloseSqlite && sqliteClient) {
      try {
        await sqliteClient.close()
      } catch {
        // ignore
      }
    }
  }
}
