import { describe, expect, test } from 'vitest'
import { RENDER_VIEW_DEFINITIONS } from '@/services/rendering/renderViews'
import { RENDER_VIEW_NAMES } from '@/types/modelRender'

describe('RENDER_VIEW_DEFINITIONS', () => {
  test('covers every required view exactly once', () => {
    const names = RENDER_VIEW_DEFINITIONS.map((view) => view.viewName)
    expect([...names].sort()).toEqual([...RENDER_VIEW_NAMES].sort())
    expect(new Set(names).size).toBe(names.length)
  })

  test('all views have valid directions, ups, and sizes', () => {
    for (const view of RENDER_VIEW_DEFINITIONS) {
      expect(view.direction.length()).toBeGreaterThan(0)
      expect(view.up.length()).toBeGreaterThan(0)
      // Up vector must never be parallel to the view direction.
      const cross = view.direction.clone().normalize().cross(view.up.clone().normalize())
      expect(cross.length()).toBeGreaterThan(0.01)
      expect(view.width).toBeGreaterThan(0)
      expect(view.height).toBeGreaterThan(0)
    }
  })

  test('thumbnail is smaller than the analysis views', () => {
    const thumbnail = RENDER_VIEW_DEFINITIONS.find((view) => view.viewName === 'thumbnail')!
    const front = RENDER_VIEW_DEFINITIONS.find((view) => view.viewName === 'front')!
    expect(thumbnail.width).toBeLessThan(front.width)
  })
})
