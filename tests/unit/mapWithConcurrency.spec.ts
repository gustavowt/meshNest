// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'
import { ScanCancelledError } from '@/services/filesystem/directoryScanner'
import { mapWithConcurrency } from '@/services/filesystem/mapWithConcurrency'

describe('mapWithConcurrency', () => {
  test('preserves input order in results', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => value * 2, {
      concurrency: 2,
    })
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  test('respects the concurrency bound', async () => {
    let inFlight = 0
    let maxInFlight = 0

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return true
    }, { concurrency: 3 })

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  test('supports cancellation through an AbortSignal', async () => {
    const controller = new AbortController()
    const started = vi.fn()

    await expect(
      mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), async (value) => {
        started()
        if (value === 2) {
          controller.abort()
        }
        await new Promise((resolve) => setTimeout(resolve, 1))
        return value
      }, { concurrency: 2, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ScanCancelledError)

    expect(started.mock.calls.length).toBeGreaterThan(0)
  })
})
