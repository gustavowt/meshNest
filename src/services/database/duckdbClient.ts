import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import type { DuckDBValue } from '@duckdb/node-api'

export type SqlParams = Record<string, DuckDBValue>

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
  ) {}

  /**
   * Opens (or creates) a database at the given path. Use ':memory:' for tests.
   * Loads the VSS extension and enables HNSW index persistence.
   */
  static async open(databasePath: string): Promise<DuckDbClient> {
    const instance = await DuckDBInstance.create(databasePath)
    const connection = await instance.connect()
    await connection.run('INSTALL vss; LOAD vss;')
    await connection.run('SET hnsw_enable_experimental_persistence = true;')
    return new DuckDbClient(instance, connection)
  }

  async run(sql: string, params?: SqlParams): Promise<void> {
    if (params) {
      await this.connection.run(sql, params)
    } else {
      await this.connection.run(sql)
    }
  }

  /**
   * Runs a query and returns rows as plain JSON-compatible objects
   * (timestamps as strings, lists as arrays).
   */
  async all<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]> {
    const reader = params
      ? await this.connection.runAndReadAll(sql, params)
      : await this.connection.runAndReadAll(sql)
    return reader.getRowObjectsJson() as T[]
  }

  async close(): Promise<void> {
    this.connection.closeSync()
    this.instance.closeSync()
  }
}
