import {
  DEFAULT_PROVIDER_SETTINGS,
  validateProviderSettings,
} from '@/services/settings/providerSettings'
import { mergeWorldSearchSettings } from '@/services/settings/worldSearchSettings'
import type { ProviderSettings } from '@/types/providerSettings'

const CACHE_VERSION = 1
const STORAGE_KEY = 'meshnest.providerSettings.v1'

type CachedProviderSettings = {
  version: typeof CACHE_VERSION
  settings: ProviderSettings
}

type ProviderSettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function cloneSettings(settings: ProviderSettings): ProviderSettings {
  return JSON.parse(JSON.stringify(settings))
}

function normalizeSettings(settings: Partial<ProviderSettings>): ProviderSettings {
  return {
    vision: { ...DEFAULT_PROVIDER_SETTINGS.vision, ...settings.vision },
    embedding: { ...DEFAULT_PROVIDER_SETTINGS.embedding, ...settings.embedding },
    worldSearch: mergeWorldSearchSettings(settings.worldSearch),
    libraryFolder: settings.libraryFolder ?? DEFAULT_PROVIDER_SETTINGS.libraryFolder,
    appearance: settings.appearance ?? DEFAULT_PROVIDER_SETTINGS.appearance,
    language: settings.language ?? DEFAULT_PROVIDER_SETTINGS.language,
  }
}

function getStorage(): ProviderSettingsStorage | null {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return null
  }
  return storage
}

export function loadCachedProviderSettings(): ProviderSettings | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const cached = JSON.parse(raw) as CachedProviderSettings
    if (cached.version !== CACHE_VERSION || !cached.settings) {
      storage.removeItem(STORAGE_KEY)
      return null
    }

    const settings = normalizeSettings(cached.settings)
    if (validateProviderSettings(settings).length > 0) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    return settings
  } catch {
    storage.removeItem(STORAGE_KEY)
    return null
  }
}

export function saveCachedProviderSettings(settings: ProviderSettings): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  const normalized = normalizeSettings(settings)
  if (validateProviderSettings(normalized).length > 0) {
    return
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: CACHE_VERSION,
      settings: cloneSettings(normalized),
    } satisfies CachedProviderSettings),
  )
}

export function clearCachedProviderSettings(): void {
  const storage = getStorage()
  storage?.removeItem(STORAGE_KEY)
}
