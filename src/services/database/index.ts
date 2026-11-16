import type { ResetDatabaseResult } from '@/types/electronApi'

export async function resetDatabase(): Promise<ResetDatabaseResult> {
  if (typeof window !== 'undefined' && window.meshNest) {
    if (window.meshNest.database?.reset) {
      return (await window.meshNest.database.reset()) as ResetDatabaseResult
    }
    if (window.meshNest.resetDatabase) {
      return (await window.meshNest.resetDatabase()) as ResetDatabaseResult
    }
  }
  return { ok: false, error: 'Database reset is only supported in desktop environment' }
}
