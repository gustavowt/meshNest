import type { DuckDbClient } from './duckdbClient'

/**
 * Key-value persistence over the settings table. Values are stored as
 * strings; use the JSON helpers for structured settings.
 */
export class SettingsRepository {
  constructor(private readonly client: DuckDbClient) {}

  async getValue(key: string): Promise<string | undefined> {
    const rows = await this.client.all<{ value: string }>(
      'SELECT value FROM settings WHERE key = $key',
      { key },
    )
    return rows.length > 0 ? rows[0].value : undefined
  }

  async setValue(key: string, value: string): Promise<void> {
    await this.client.run('DELETE FROM settings WHERE key = $key', { key })
    await this.client.run(
      'INSERT INTO settings (key, value) VALUES ($key, $value)',
      { key, value },
    )
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = await this.getValue(key)
    if (raw === undefined) {
      return undefined
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.setValue(key, JSON.stringify(value))
  }
}

const PROVIDER_SETTINGS_KEY = 'providers'

export async function loadStoredProviderSettings<T>(
  repository: SettingsRepository,
): Promise<T | undefined> {
  return repository.getJson<T>(PROVIDER_SETTINGS_KEY)
}

export async function storeProviderSettings(
  repository: SettingsRepository,
  settings: unknown,
): Promise<void> {
  await repository.setJson(PROVIDER_SETTINGS_KEY, settings)
}
