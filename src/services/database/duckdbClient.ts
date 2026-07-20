import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import type { DuckDBType, DuckDBValue } from '@duckdb/node-api'

export type SqlParams = Record<string, DuckDBValue>
/** Optional explicit DuckDB types, needed e.g. for empty list parameters. */
export type SqlParamTypes = Record<string, DuckDBType>

export type DuckDbOpenOptions = {
  /**
   * When true, INSTALL/LOAD the VSS extension and enable HNSW persistence.
   * Defaults to false on Mac App Store builds (`process.mas`), true otherwise.
   * MAS must skip VSS: runtime INSTALL downloads an unsigned extension that
   * Gatekeeper/sandbox rejects.
   */
  enableVss?: boolean
}

function isMacAppStoreBuild(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process as NodeJS.Process & { mas?: boolean }).mas === true
  )
}

/**
 * Thin wrapper around @duckdb/node-api. Owns one instance/connection pair.
 *
 * Must only be used from a Node context (Electron main process or tests),
 * never from UI code.
 */
export class DuckDbClient {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly connection: DuckDBConnection,
    /** True when VSS was loaded; HNSW index DDL is only safe when this is true. */
    readonly vssAvailable: boolean,
  ) {}

  /**
   * Opens (or creates) a database at the given path. Use ':memory:' for tests.
   *
   * By default loads the VSS extension and enables HNSW index persistence.
   * Mac App Store builds (`process.mas`) skip VSS so Gatekeeper does not
   * reject the unsigned downloaded `vss.duckdb_extension`; semantic search
   * still works via brute-force `array_cosine_distance`.
   */
  static async open(
    databasePath: string,
    options?: DuckDbOpenOptions,
  ): Promise<DuckDbClient> {
    const enableVss = options?.enableVss ?? !isMacAppStoreBuild()
    const instance = await DuckDBInstance.create(databasePath)
    const connection = await instance.connect()
    if (!enableVss) {
      return new DuckDbClient(instance, connection, false)
    }
    await connection.run('INSTALL vss; LOAD vss;')
    await connection.run('SET hnsw_enable_experimental_persistence = true;')
    return new DuckDbClient(instance, connection, true)
  }

  async run(sql: string, params?: SqlParams, types?: SqlParamTypes): Promise<void> {
    if (params) {
      await this.connection.run(sql, params, types)
    } else {
      await this.connection.run(sql)
    }
  }

  /**
   * Runs a query and returns rows as plain JSON-compatible objects
   * (timestamps as strings, lists as arrays).
   */
  async all<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParams,
    types?: SqlParamTypes,
  ): Promise<T[]> {
    const reader = params
      ? await this.connection.runAndReadAll(sql, params, types)
      : await this.connection.runAndReadAll(sql)
    return reader.getRowObjectsJson() as T[]
  }

  async close(): Promise<void> {
    this.connection.closeSync()
    this.instance.closeSync()
  }
}
