import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetDatabase } from '@/services/database'

describe('Renderer database reset service', () => {
  beforeEach(() => {
    delete (window as any).meshNest
  })

  afterEach(() => {
    delete (window as any).meshNest
    vi.restoreAllMocks()
  })

  test('calls window.meshNest.resetDatabase and returns result when available', async () => {
    const mockReset = vi.fn(async () => ({ ok: true as const, removed: ['/mock/db.sqlite'] }))
    ;(window as any).meshNest = {
      resetDatabase: mockReset,
    }

    const result = await resetDatabase()

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, removed: ['/mock/db.sqlite'] })
  })

  test('calls window.meshNest.database.reset and returns result when bridge uses nested namespace', async () => {
    const mockReset = vi.fn(async () => ({ ok: true as const, removed: ['/mock/db.sqlite', '/mock/db.sqlite-wal'] }))
    ;(window as any).meshNest = {
      database: {
        reset: mockReset,
      },
    }

    const result = await resetDatabase()

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, removed: ['/mock/db.sqlite', '/mock/db.sqlite-wal'] })
  })

  test('returns error object when desktop bridge window.meshNest is not available', async () => {
    delete (window as any).meshNest

    const result = await resetDatabase()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/desktop/i)
    }
  })

  test('returns error object when window.meshNest exists but reset method is missing', async () => {
    (window as any).meshNest = {}

    const result = await resetDatabase()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/desktop/i)
    }
  })

  test('propagates failure result from desktop bridge without throwing', async () => {
    const mockReset = vi.fn(async () => ({ ok: false as const, error: 'Database file is locked' }))
    ;(window as any).meshNest = {
      resetDatabase: mockReset,
    }

    const result = await resetDatabase()

    expect(result).toEqual({ ok: false, error: 'Database file is locked' })
  })
})
