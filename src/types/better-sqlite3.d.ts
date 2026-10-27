declare module 'better-sqlite3' {
  namespace Database {
    interface RunResult {
      changes: number
      lastInsertRowid: number | bigint
    }

    interface Options {
      readonly?: boolean
      fileMustExist?: boolean
      timeout?: number
      verbose?: ((message?: unknown, ...additionalArgs: unknown[]) => void) | null
      nativeBinding?: string
    }

    interface PragmaOptions {
      simple?: boolean
    }

    interface Statement<BindParameters extends unknown[] | [Record<string, unknown>] = unknown[], Result = unknown> {
      database: Database
      source: string
      reader: boolean
      readonly: boolean
      busy: boolean
      run(...params: BindParameters): RunResult
      get(...params: BindParameters): Result | undefined
      all(...params: BindParameters): Result[]
      iterate(...params: BindParameters): IterableIterator<Result>
      pluck(toggle?: boolean): this
      raw(toggle?: boolean): this
    }

    interface Database {
      memory: boolean
      readonly: boolean
      name: string
      open: boolean
      inTransaction: boolean
      prepare<BindParameters extends unknown[] | [Record<string, unknown>] = unknown[], Result = unknown>(
        source: string,
      ): Statement<BindParameters, Result>
      exec(source: string): this
      pragma(source: string, options?: PragmaOptions): unknown
      close(): this
      loadExtension(path: string, entrypoint?: string): this
      transaction<F extends (...args: any[]) => any>(fn: F): F
    }
  }

  interface DatabaseConstructor {
    new (filename: string | Buffer, options?: Database.Options): Database.Database
    (filename: string | Buffer, options?: Database.Options): Database.Database
  }

  const Database: DatabaseConstructor
  export default Database
}
