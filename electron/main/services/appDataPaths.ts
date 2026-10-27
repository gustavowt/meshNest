import path from 'node:path'
import { app } from 'electron'

/**
 * Central definition of local app-data locations. Everything the app
 * generates (database, render cache) lives under Electron's userData
 * directory, never inside the user's model directories.
 */
export function getAppDataRoot(): string {
  return app.getPath('userData')
}

export function getDatabasePath(): string {
  return path.join(getAppDataRoot(), 'meshnest.sqlite')
}

export function getLegacyDuckDbPath(): string {
  return path.join(getAppDataRoot(), 'meshnest.duckdb')
}

export function getModelRendersRoot(): string {
  return path.join(getAppDataRoot(), 'model-renders')
}
