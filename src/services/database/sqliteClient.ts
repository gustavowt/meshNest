import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

export type SqliteParams = Record<string, unknown> | unknown[]

export type SqliteOpenOptions = {
  enableVec?: boolean
  readonly?: boolean
  fileMustExist?: boolean
  timeout?: number
}

function isEmptyParams(params?: SqliteParams): boolean {
  if (!params) return true
  if (Array.isArray(params)) return params.length === 0
  return Object.keys(params).length === 0
}

function loadSqliteVec(db: Database.Database): boolean {
  try {
    let loadPath = sqliteVec.getLoadablePath()
    if (loadPath.includes('app.asar') && !loadPath.includes('app.asar.unpacked')) {
      loadPath = loadPath.replace('app.asar', 'app.asar.unpacked')
    }
    db.loadExtension(loadPath)
    return true
  } catch (err) {
    console.error('Failed to load sqlite-vec extension:', err)
    return false
  }
}

/**
 * SQLite client wrapper around better-sqlite3 with sqlite-vec extension support.
 * Matches the standard database client call shape for repository compatibility.
 *
 * Must only be used from a Node context (Electron main process or tests),
 * never from UI code.
 */
export class SqliteClient {
  private readonly db: Database.Database
  readonly vecAvailable: boolean

  private constructor(db: Database.Database, vecAvailable: boolean) {
    this.db = db
    this.vecAvailable = vecAvailable
  }

  get rawDb(): Database.Database {
    return this.db
  }

  /**
   * Opens (or creates) a database at the given path. Use ':memory:' for tests.
   *
   * By default enables WAL mode (for non-readonly databases), sets busy_timeout
   * to 5000ms, and attempts to load the sqlite-vec extension.
   */
  static async open(
    databasePath: string,
    options?: SqliteOpenOptions,
  ): Promise<SqliteClient> {
    const dbOptions: Database.Options = {}
    if (options?.readonly !== undefined) {
      dbOptions.readonly = options.readonly
    }
    if (options?.fileMustExist !== undefined) {
      dbOptions.fileMustExist = options.fileMustExist
    }
    if (options?.timeout !== undefined) {
      dbOptions.timeout = options.timeout
    }

    const db = new Database(databasePath, dbOptions)

    if (!options?.readonly) {
      db.pragma('journal_mode = WAL')
    }
    const timeout = options?.timeout ?? 5000
    db.pragma(`busy_timeout = ${timeout}`)

    let vecAvailable = false
    if (options?.enableVec ?? true) {
      vecAvailable = loadSqliteVec(db)
    }

    return new SqliteClient(db, vecAvailable)
  }

  async run(sql: string, params?: SqliteParams): Promise<void> {
    const trimmed = sql.trim()
    if (isEmptyParams(params)) {
      this.db.exec(trimmed)
      return
    }

    const stmt = this.db.prepare(trimmed)
    if (Array.isArray(params)) {
      stmt.run(...params)
    } else {
      stmt.run(params)
    }
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params?: SqliteParams,
  ): Promise<T[]> {
    const trimmed = sql.trim()
    const stmt = this.db.prepare(trimmed)
    let rows: unknown[]
    if (isEmptyParams(params)) {
      rows = stmt.all()
    } else if (Array.isArray(params)) {
      rows = stmt.all(...params)
    } else {
      rows = stmt.all(params)
    }
    return rows as T[]
  }

  async close(): Promise<void> {
    if (this.db.open) {
      this.db.close()
    }
  }
}
