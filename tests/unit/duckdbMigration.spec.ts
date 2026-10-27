// @vitest-environment node
import fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

let mockUserDataDir = ''
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') {
        return mockUserDataDir || tmpdir()
      }
      return tmpdir()
    }),
  },
}))
import { SqliteClient } from '@/services/database/sqliteClient'
import {
  migrateDuckDbToSqlite,
  type DuckDbMigrationResult,
} from '../../electron/main/services/duckdbMigration'
import {
  getDatabaseClient,
  _resetDatabaseStateForTests,
} from '../../electron/main/services/database'

describe('duckdbMigration', () => {
  let tempDirs: string[] = []
  let openClients: SqliteClient[] = []

  beforeEach(() => {
    tempDirs = []
    openClients = []
    mockUserDataDir = createTempDir()
  })

  afterEach(async () => {
    await _resetDatabaseStateForTests()
    while (openClients.length > 0) {
      await openClients.pop()!.close()
    }
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  })

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'meshnest-migration-test-'))
    tempDirs.push(dir)
    return dir
  }

  async function seedLegacyDuckDb(filePath: string): Promise<void> {
    const instance = await DuckDBInstance.create(filePath)
    const conn = await instance.connect()
    try {
      await conn.run(`
        CREATE TABLE model_files (
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
        CREATE TABLE geometry_metadata (
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
        CREATE TABLE three_mf_metadata (
          model_file_id TEXT PRIMARY KEY,
          object_names TEXT[],
          material_names TEXT[],
          color_values TEXT[],
          has_thumbnail BOOLEAN,
          thumbnail_internal_path TEXT,
          raw_metadata_json TEXT,
          created_at TIMESTAMP DEFAULT now()
        );
        CREATE TABLE model_render_assets (
          id TEXT PRIMARY KEY,
          model_file_id TEXT NOT NULL,
          view_name TEXT NOT NULL,
          absolute_path TEXT NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT now()
        );
        CREATE TABLE ai_model_descriptions (
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
        CREATE TABLE model_embeddings (
          model_file_id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          dimensions INTEGER NOT NULL,
          embedding FLOAT[],
          source_text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT now()
        );
        CREATE TABLE indexing_jobs (
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
      `)

      // Seed model_files (3 rows)
      await conn.run(`
        INSERT INTO model_files VALUES
          ('file-1', 'proj-1', '/models/dragon.stl', 'dragon.stl', 'dragon.stl', '.stl', 1048576, TIMESTAMP '2025-01-01 10:00:00', 'hash123', TIMESTAMP '2025-01-01 10:05:00', 'indexed', NULL, now(), now()),
          ('file-2', 'proj-1', '/models/benchy.3mf', 'benchy.3mf', 'benchy.3mf', '.3mf', 2097152, TIMESTAMP '2025-01-02 11:00:00', 'hash456', TIMESTAMP '2025-01-02 11:05:00', 'indexed', NULL, now(), now()),
          ('file-3', 'proj-2', '/models/gear.obj', 'gear.obj', 'gear.obj', '.obj', 524288, TIMESTAMP '2025-01-03 12:00:00', 'hash789', NULL, 'failed', 'Parse error', now(), now());
      `)

      // Seed geometry_metadata (2 rows)
      await conn.run(`
        INSERT INTO geometry_metadata VALUES
          ('file-1', 100.5, 50.2, 75.0, 12000, 6000, 1, 1, 15000.5, 45000.2, true, now()),
          ('file-2', 60.0, 31.0, 48.0, 8000, 4000, 2, 2, 8500.0, 20000.0, false, now());
      `)

      // Seed three_mf_metadata (2 rows)
      await conn.run(`
        INSERT INTO three_mf_metadata VALUES
          ('file-2', ['hull', 'cabin'], ['PLA-Orange', 'PLA-White'], ['#FFA500', '#FFFFFF'], true, 'Metadata/thumbnail.png', '{"designer":"Creative3D"}', now()),
          ('file-1', [], [], [], false, NULL, NULL, now());
      `)

      // Seed model_render_assets (2 rows)
      await conn.run(`
        INSERT INTO model_render_assets VALUES
          ('render-1', 'file-1', 'isometric', '/renders/file-1-iso.png', 512, 512, now()),
          ('render-2', 'file-2', 'isometric', '/renders/file-2-iso.png', 512, 512, now());
      `)

      // Seed ai_model_descriptions (2 rows)
      await conn.run(`
        INSERT INTO ai_model_descriptions VALUES
          ('file-1', 'Articulated Dragon', 'Flexible toy dragon', 'Toys & Games', ['dragon', 'articulated', 'flexi'], ['dragon', 'tail'], 'toy', 'organic', 0.95, ['flexible dragon', 'articulated toy'], '{"status":"ok"}', now()),
          ('file-2', '3DBenchy', 'Standard 3D printer calibration test boat', 'Calibration', ['benchy', 'boat', 'test'], ['boat'], 'test', 'geometric', 0.99, ['3d benchy', 'boat print'], '{"status":"ok"}', now());
      `)

      // Seed model_embeddings (3 rows: 2 rows with 384 dims, 1 row with 768 dims)
      await conn.run(`
        INSERT INTO model_embeddings VALUES
          ('file-1', 'transformers', 'all-MiniLM-L6-v2', 384, (SELECT ARRAY(SELECT 0.001 * (i % 10) FROM range(384) tbl(i))), 'dragon articulated', now()),
          ('file-3', 'transformers', 'all-MiniLM-L6-v2', 384, (SELECT ARRAY(SELECT 0.002 * (i % 10) FROM range(384) tbl(i))), 'gear mechanical', now()),
          ('file-2', 'ollama', 'nomic-embed-text', 768, (SELECT ARRAY(SELECT 0.001 * (i % 10) FROM range(768) tbl(i))), 'benchy boat calibration', now());
      `)

      // Seed indexing_jobs (3 rows)
      await conn.run(`
        INSERT INTO indexing_jobs VALUES
          ('job-1', 'file-1', '/models/dragon.stl', 'full-index', 'completed', NULL, TIMESTAMP '2025-01-01 10:00:00', TIMESTAMP '2025-01-01 10:05:00', now()),
          ('job-2', 'file-2', '/models/benchy.3mf', 'full-index', 'completed', NULL, TIMESTAMP '2025-01-02 11:00:00', TIMESTAMP '2025-01-02 11:05:00', now()),
          ('job-3', 'file-3', '/models/gear.obj', 'geometry-only', 'failed', 'Parse error', TIMESTAMP '2025-01-03 12:00:00', TIMESTAMP '2025-01-03 12:01:00', now());
      `)
    } finally {
      conn.closeSync()
      instance.closeSync()
    }
  }

  test('migrates all tables, counts, and per-dimension vector tables accurately', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    await seedLegacyDuckDb(duckdbPath)

    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    const result: DuckDbMigrationResult = await migrateDuckDbToSqlite({
      duckdbPath,
      sqliteClient,
    })

    // Assertions on result
    expect(result.migrated).toBe(true)
    expect(result.backupPath).toBeDefined()
    expect(fs.existsSync(duckdbPath)).toBe(false)
    expect(fs.existsSync(result.backupPath!)).toBe(true)

    expect(result.tablesMigrated).toEqual({
      model_files: 3,
      geometry_metadata: 2,
      three_mf_metadata: 2,
      model_render_assets: 2,
      ai_model_descriptions: 2,
      model_embeddings: 3,
      indexing_jobs: 3,
    })

    // SQLite table row counts
    const count = async (table: string) => {
      const rows = await sqliteClient.all<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`)
      return Number(rows[0].c)
    }

    expect(await count('model_files')).toBe(3)
    expect(await count('geometry_metadata')).toBe(2)
    expect(await count('three_mf_metadata')).toBe(2)
    expect(await count('model_render_assets')).toBe(2)
    expect(await count('ai_model_descriptions')).toBe(2)
    expect(await count('model_embeddings')).toBe(3)
    expect(await count('indexing_jobs')).toBe(3)

    // Check specific data conversions
    const files = await sqliteClient.all<{ id: string; size_bytes: number; modified_at: string }>(
      'SELECT id, size_bytes, modified_at FROM model_files ORDER BY id',
    )
    expect(files[0].id).toBe('file-1')
    expect(files[0].size_bytes).toBe(1048576)
    expect(files[0].modified_at).toBe('2025-01-01T10:00:00.000Z')

    const geom = await sqliteClient.all<{ model_file_id: string; is_watertight: number }>(
      'SELECT model_file_id, is_watertight FROM geometry_metadata ORDER BY model_file_id',
    )
    expect(geom[0]).toEqual({ model_file_id: 'file-1', is_watertight: 1 })
    expect(geom[1]).toEqual({ model_file_id: 'file-2', is_watertight: 0 })

    const threeMf = await sqliteClient.all<{
      model_file_id: string
      object_names: string
      has_thumbnail: number
    }>('SELECT model_file_id, object_names, has_thumbnail FROM three_mf_metadata WHERE model_file_id = ?', ['file-2'])
    expect(threeMf[0].has_thumbnail).toBe(1)
    expect(JSON.parse(threeMf[0].object_names)).toEqual(['hull', 'cabin'])

    const aiDesc = await sqliteClient.all<{ model_file_id: string; tags: string; confidence: number }>(
      'SELECT model_file_id, tags, confidence FROM ai_model_descriptions WHERE model_file_id = ?',
      ['file-1'],
    )
    expect(JSON.parse(aiDesc[0].tags)).toEqual(['dragon', 'articulated', 'flexi'])
    expect(aiDesc[0].confidence).toBeCloseTo(0.95)

    // Per-dimension vector tables
    if (sqliteClient.vecAvailable) {
      expect(await count('vec_model_embeddings_384')).toBe(2)
      expect(await count('vec_model_embeddings_768')).toBe(1)

      const vecRows384 = await sqliteClient.all<{ model_file_id: string }>(
        'SELECT model_file_id FROM vec_model_embeddings_384 ORDER BY model_file_id',
      )
      expect(vecRows384.map((r) => r.model_file_id)).toEqual(['file-1', 'file-3'])

      const vecRows768 = await sqliteClient.all<{ model_file_id: string }>(
        'SELECT model_file_id FROM vec_model_embeddings_768',
      )
      expect(vecRows768.map((r) => r.model_file_id)).toEqual(['file-2'])
    }
  })

  test('renames companion WAL file when present', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    await seedLegacyDuckDb(duckdbPath)

    const walPath = `${duckdbPath}.wal`
    fs.writeFileSync(walPath, 'dummy wal content')
    expect(fs.existsSync(walPath)).toBe(true)

    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    const result = await migrateDuckDbToSqlite({ duckdbPath, sqliteClient })
    expect(result.migrated).toBe(true)
    expect(fs.existsSync(walPath)).toBe(false)
    expect(fs.existsSync(`${walPath}.migrated-${result.backupPath!.split('.migrated-')[1]}`)).toBe(true)
  })

  test('idempotency: calling migrateDuckDbToSqlite again returns { migrated: false }', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    await seedLegacyDuckDb(duckdbPath)

    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    const firstRun = await migrateDuckDbToSqlite({ duckdbPath, sqliteClient })
    expect(firstRun.migrated).toBe(true)

    // Second call against now-renamed duckdbPath
    const secondRun = await migrateDuckDbToSqlite({ duckdbPath, sqliteClient })
    expect(secondRun.migrated).toBe(false)
    expect(secondRun.reason).toBe('no-legacy-duckdb')
  })

  test('returns { migrated: false, reason: "no-legacy-duckdb" } when DuckDB file is absent', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'nonexistent.duckdb')
    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    const result = await migrateDuckDbToSqlite({ duckdbPath, sqliteClient })
    expect(result).toEqual({ migrated: false, reason: 'no-legacy-duckdb' })
  })

  test('aborts with reason "sqlite-already-exists" when sqliteClient is omitted and sqlitePath exists', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    const sqlitePath = join(dir, 'meshnest.sqlite')

    await seedLegacyDuckDb(duckdbPath)
    fs.writeFileSync(sqlitePath, 'dummy sqlite file')

    const result = await migrateDuckDbToSqlite({ duckdbPath, sqlitePath })
    expect(result).toEqual({ migrated: false, reason: 'sqlite-already-exists' })
    // Original duckdb should not have been moved
    expect(fs.existsSync(duckdbPath)).toBe(true)
  })

  test('migrates to disk and closes client automatically when sqliteClient is omitted', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    const sqlitePath = join(dir, 'meshnest.sqlite')

    await seedLegacyDuckDb(duckdbPath)

    const result = await migrateDuckDbToSqlite({ duckdbPath, sqlitePath })
    expect(result.migrated).toBe(true)
    expect(fs.existsSync(sqlitePath)).toBe(true)
    expect(fs.existsSync(duckdbPath)).toBe(false)

    // Verify sqlite file can be opened independently and has migrated data
    const client = await SqliteClient.open(sqlitePath)
    openClients.push(client)
    const rows = await client.all<{ c: number }>('SELECT count(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(3)
  })

  test('aborts with fatal error and rolls back transaction on table row count mismatch', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    await seedLegacyDuckDb(duckdbPath)

    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    await expect(
      migrateDuckDbToSqlite({
        duckdbPath,
        sqliteClient,
        _testHook: (rawDb) => {
          rawDb.prepare('DELETE FROM model_files WHERE id = ?').run('file-1')
        },
      }),
    ).rejects.toThrow(/Migration row count mismatch for model_files/)

    // Assert that the original DuckDB file remains intact at duckdbPath (NOT renamed to .migrated-*)
    expect(fs.existsSync(duckdbPath)).toBe(true)
    const dirFiles = fs.readdirSync(dir)
    expect(dirFiles.some((f) => f.includes('.migrated-'))).toBe(false)

    // Assert that SQLite has rolled back the transaction
    const count = async (table: string) => {
      const rows = await sqliteClient.all<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`)
      return Number(rows[0].c)
    }

    expect(await count('model_files')).toBe(0)
    expect(await count('geometry_metadata')).toBe(0)
    expect(await count('three_mf_metadata')).toBe(0)
    expect(await count('model_render_assets')).toBe(0)
    expect(await count('ai_model_descriptions')).toBe(0)
    expect(await count('model_embeddings')).toBe(0)
    expect(await count('indexing_jobs')).toBe(0)
  })

  test('aborts with fatal error and rolls back transaction on vector count mismatch', async () => {
    const dir = createTempDir()
    const duckdbPath = join(dir, 'meshnest.duckdb')
    await seedLegacyDuckDb(duckdbPath)

    const sqliteClient = await SqliteClient.open(':memory:')
    openClients.push(sqliteClient)

    if (sqliteClient.vecAvailable) {
      await expect(
        migrateDuckDbToSqlite({
          duckdbPath,
          sqliteClient,
          _testHook: (rawDb) => {
            rawDb
              .prepare('DELETE FROM vec_model_embeddings_384 WHERE model_file_id = ?')
              .run('file-1')
          },
        }),
      ).rejects.toThrow(/Migration row count mismatch for vec_model_embeddings_384/)

      expect(fs.existsSync(duckdbPath)).toBe(true)
      const dirFiles = fs.readdirSync(dir)
      expect(dirFiles.some((f) => f.includes('.migrated-'))).toBe(false)

      const count = async (table: string) => {
        const rows = await sqliteClient.all<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`)
        return Number(rows[0].c)
      }
      expect(await count('model_files')).toBe(0)
      expect(await count('vec_model_embeddings_384')).toBe(0)
    }
  })

  test('database startup failure during migration removes failed sqlite files and allows retry', async () => {
    const legacyDuckDbPath = join(mockUserDataDir, 'meshnest.duckdb')
    const sqlitePath = join(mockUserDataDir, 'meshnest.sqlite')
    await seedLegacyDuckDb(legacyDuckDbPath)

    const migrationModule = await import('../../electron/main/services/duckdbMigration')
    const spy = vi.spyOn(migrationModule, 'migrateDuckDbToSqlite').mockImplementationOnce(async () => {
      throw new Error('Migration row count mismatch for model_files: duckdb=3, sqlite=2')
    })

    await expect(getDatabaseClient()).rejects.toThrow(/Migration row count mismatch/)

    // SQLite file must be cleaned up to avoid locking out migration on retry
    expect(fs.existsSync(sqlitePath)).toBe(false)
    expect(fs.existsSync(legacyDuckDbPath)).toBe(true)

    // Retry should work and migrate data cleanly
    spy.mockRestore()
    const client = await getDatabaseClient()
    openClients.push(client)

    const rows = await client.all<{ c: number }>('SELECT count(*) as c FROM model_files')
    expect(Number(rows[0].c)).toBe(3)
    expect(fs.existsSync(sqlitePath)).toBe(true)
    expect(fs.existsSync(legacyDuckDbPath)).toBe(false)
  })
})
