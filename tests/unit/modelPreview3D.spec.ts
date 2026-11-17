import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as three from 'three'
import ModelPreview3D from '@/components/model/ModelPreview3D.vue'
import * as stlLoader from '@/services/model-parsing/stlLoaderService'
import * as threeMfLoader from '@/services/model-parsing/threeMfLoaderService'
import { FILAMENT_PRESETS, hashStringToFilamentColor } from '@/services/rendering/filamentColors'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'

let mockWebGLThrow = true

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    constructor() {
      if (mockWebGLThrow) {
        throw new Error('WebGL not supported')
      }
    }
    setSize = vi.fn()
    setPixelRatio = vi.fn()
    setClearColor = vi.fn()
    render = vi.fn()
    dispose = vi.fn()
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

beforeEach(() => {
  mockWebGLThrow = true
})

afterEach(() => {
  delete (window as { meshNest?: unknown }).meshNest
  vi.restoreAllMocks()
})

describe('ModelPreview3D.vue', () => {
  test('shows an error state outside the desktop app', async () => {
    const wrapper = mount(ModelPreview3D, {
      props: { filePath: '/models/part.stl', extension: 'stl' as const },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('only available in the desktop app')
    wrapper.unmount()
  })

  test('shows an error state when the model cannot be read', async () => {
    window.meshNest = {
      readModelFile: vi.fn().mockRejectedValue(new Error('File not found')),
    } as unknown as Window['meshNest']

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: '/models/missing.stl', extension: 'stl' as const },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('File not found')
    wrapper.unmount()
  })

  test('fails gracefully when WebGL is unavailable (jsdom)', async () => {
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))),
    } as unknown as Window['meshNest']

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: '/models/part.stl', extension: 'stl' as const },
    })
    await flushPromises()

    // jsdom has no WebGL context, so the component must land in the
    // error state instead of throwing.
    expect(wrapper.find('.model-preview__overlay--error').exists()).toBe(true)
    wrapper.unmount()
  })

  test('reloads when the file path changes', async () => {
    const readModelFile = vi.fn().mockRejectedValue(new Error('read failed'))
    window.meshNest = { readModelFile } as unknown as Window['meshNest']

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: '/models/a.stl', extension: 'stl' as const },
    })
    await flushPromises()
    expect(readModelFile).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ filePath: '/models/b.stl' })
    await flushPromises()
    expect(readModelFile).toHaveBeenCalledTimes(2)
    expect(readModelFile).toHaveBeenLastCalledWith('/models/b.stl')
    wrapper.unmount()
  })

  test('passes autoColor derived from filePath to stl and 3mf scene loaders', async () => {
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const stlSpy = vi.spyOn(stlLoader, 'loadStlSceneAsync').mockRejectedValue(new Error('bailout'))
    const threeMfSpy = vi.spyOn(threeMfLoader, 'loadThreeMfSceneAsync').mockRejectedValue(new Error('bailout'))

    const stlPath = '/models/test-model.stl'
    const expectedStlColor = hashStringToFilamentColor(stlPath)
    const stlWrapper = mount(ModelPreview3D, {
      props: { filePath: stlPath, extension: 'stl' as const },
    })
    await flushPromises()
    expect(stlSpy).toHaveBeenCalledWith(bytes, expectedStlColor)
    stlWrapper.unmount()

    const threeMfPath = '/models/test-assembly.3mf'
    const expectedThreeMfColor = hashStringToFilamentColor(threeMfPath)
    const threeMfWrapper = mount(ModelPreview3D, {
      props: { filePath: threeMfPath, extension: '3mf' as const },
    })
    await flushPromises()
    expect(threeMfSpy).toHaveBeenCalledWith(bytes, expectedThreeMfColor)
    threeMfWrapper.unmount()
  })

  test('renders filament toolbar and swatches when ready, and supports recoloring', async () => {
    mockWebGLThrow = false
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const stlPath = '/models/car.stl'
    const defaultColor = hashStringToFilamentColor(stlPath)

    const mesh = new three.Mesh(
      new three.BufferGeometry(),
      new three.MeshStandardMaterial({ color: defaultColor })
    )
    mesh.userData.originalColor = defaultColor
    const group = new three.Group()
    group.add(mesh)

    vi.spyOn(stlLoader, 'loadStlSceneAsync').mockResolvedValue({
      root: group,
      source: 'stl',
    })

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: stlPath, extension: 'stl' as const },
      global: {
        mocks: {
          $t: (key: string) => key,
        },
      },
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    // Toolbar is displayed
    const toolbar = wrapper.find('.filament-toolbar')
    expect(toolbar.exists()).toBe(true)

    // All presets swatches are rendered
    const swatches = wrapper.findAll('.filament-swatch')
    expect(swatches.length).toBe(FILAMENT_PRESETS.length)

    // Reset button is initially hidden
    expect(wrapper.find('.reset-btn').exists()).toBe(false)

    // Click a different swatch
    const targetSwatch = FILAMENT_PRESETS.find((p) => p.hex.toLowerCase() !== defaultColor.toLowerCase())!
    const targetSwatchEl = swatches.find((s) => s.attributes('title') === targetSwatch.name)!
    await targetSwatchEl.trigger('click')

    // Material color changed without reloading
    const mat = mesh.material as three.MeshStandardMaterial
    expect('#' + mat.color.getHexString().toUpperCase()).toBe(targetSwatch.hex.toUpperCase())

    // Reset button is now visible
    const resetBtn = wrapper.find('.reset-btn')
    expect(resetBtn.exists()).toBe(true)

    // Custom color input can also recolor
    const colorInput = wrapper.find('.color-picker-input')
    await colorInput.setValue('#123456')
    expect('#' + mat.color.getHexString()).toBe('#123456')

    // Reset button resets to default
    await resetBtn.trigger('click')
    expect('#' + mat.color.getHexString().toUpperCase()).toBe(defaultColor.toUpperCase())
    expect(wrapper.find('.reset-btn').exists()).toBe(false)

    wrapper.unmount()
  })

  test('does not set needsUpdate on recoloring when vertexColors is false (Finding 1)', async () => {
    mockWebGLThrow = false
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const stlPath = '/models/test-perf.stl'
    const defaultColor = hashStringToFilamentColor(stlPath)

    const mat = new three.MeshStandardMaterial({ color: defaultColor, vertexColors: false })
    const mesh = new three.Mesh(new three.BufferGeometry(), mat)
    mesh.userData.originalColor = defaultColor
    mesh.userData.hasVertexColors = false
    const group = new three.Group()
    group.add(mesh)

    vi.spyOn(stlLoader, 'loadStlSceneAsync').mockResolvedValue({
      root: group,
      source: 'stl',
    })

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: stlPath, extension: 'stl' as const },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    const needsUpdateSpy = vi.spyOn(mat, 'needsUpdate', 'set')

    // Click a preset swatch
    const swatches = wrapper.findAll('.filament-swatch')
    const targetSwatch = FILAMENT_PRESETS.find((p) => p.hex.toLowerCase() !== defaultColor.toLowerCase())!
    const targetSwatchEl = swatches.find((s) => s.attributes('title') === targetSwatch.name)!
    await targetSwatchEl.trigger('click')

    // Uniform color set without shader recompilation
    expect(needsUpdateSpy).not.toHaveBeenCalled()
    expect('#' + mat.color.getHexString().toUpperCase()).toBe(targetSwatch.hex.toUpperCase())

    // Drag custom color picker
    const colorInput = wrapper.find('.color-picker-input')
    await colorInput.setValue('#aabbcc')
    expect(needsUpdateSpy).not.toHaveBeenCalled()

    // Reset color
    const resetBtn = wrapper.find('.reset-btn')
    await resetBtn.trigger('click')
    expect(needsUpdateSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  test('sets needsUpdate only when toggling vertexColors (Finding 1)', async () => {
    mockWebGLThrow = false
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const stlPath = '/models/test-vertex.stl'
    const defaultColor = hashStringToFilamentColor(stlPath)

    const mat = new three.MeshStandardMaterial({ color: 0xffffff, vertexColors: true })
    const mesh = new three.Mesh(new three.BufferGeometry(), mat)
    mesh.userData.originalColor = 0xffffff
    mesh.userData.hasVertexColors = true
    const group = new three.Group()
    group.add(mesh)

    vi.spyOn(stlLoader, 'loadStlSceneAsync').mockResolvedValue({
      root: group,
      source: 'stl',
    })

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: stlPath, extension: 'stl' as const },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    const needsUpdateSpy = vi.spyOn(mat, 'needsUpdate', 'set')

    // First recolor toggles vertexColors to false and triggers needsUpdate once
    const swatches = wrapper.findAll('.filament-swatch')
    const targetSwatch = FILAMENT_PRESETS.find((p) => p.hex.toLowerCase() !== defaultColor.toLowerCase())!
    const targetSwatchEl = swatches.find((s) => s.attributes('title') === targetSwatch.name)!
    await targetSwatchEl.trigger('click')

    expect(needsUpdateSpy).toHaveBeenCalledTimes(1)
    expect(mat.vertexColors).toBe(false)

    // Second recolor does NOT trigger needsUpdate since vertexColors is already false
    needsUpdateSpy.mockClear()
    const colorInput = wrapper.find('.color-picker-input')
    await colorInput.setValue('#112233')
    expect(needsUpdateSpy).not.toHaveBeenCalled()

    // Reset restores vertexColors to true and triggers needsUpdate once
    needsUpdateSpy.mockClear()
    const resetBtn = wrapper.find('.reset-btn')
    await resetBtn.trigger('click')
    expect(needsUpdateSpy).toHaveBeenCalledTimes(1)
    expect(mat.vertexColors).toBe(true)

    wrapper.unmount()
  })

  test('does not highlight preset swatch for models with embedded file colors or multiple colors (Finding 4)', async () => {
    mockWebGLThrow = false
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const threeMfPath = '/models/multi-part.3mf'

    // Multi-mesh model with different part colors
    const mat1 = new three.MeshStandardMaterial({ color: '#FF0000' })
    const mesh1 = new three.Mesh(new three.BufferGeometry(), mat1)
    mesh1.userData.originalColor = '#FF0000'

    const mat2 = new three.MeshStandardMaterial({ color: '#00FF00' })
    const mesh2 = new three.Mesh(new three.BufferGeometry(), mat2)
    mesh2.userData.originalColor = '#00FF00'

    const group = new three.Group()
    group.add(mesh1)
    group.add(mesh2)

    vi.spyOn(threeMfLoader, 'loadThreeMfSceneAsync').mockResolvedValue({
      root: group,
      source: '3mf',
    })

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: threeMfPath, extension: '3mf' as const },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    // No preset swatch should be active
    const activeSwatches = wrapper.findAll('.filament-swatch--active')
    expect(activeSwatches.length).toBe(0)
    expect(wrapper.find('.reset-btn').exists()).toBe(false)

    // User explicitly selects a swatch
    const swatches = wrapper.findAll('.filament-swatch')
    const targetSwatch = FILAMENT_PRESETS[0]
    const targetSwatchEl = swatches.find((s) => s.attributes('title') === targetSwatch.name)!
    await targetSwatchEl.trigger('click')

    // Selected swatch is now active and reset button is shown
    expect(targetSwatchEl.classes()).toContain('filament-swatch--active')
    expect(wrapper.find('.reset-btn').exists()).toBe(true)
    expect('#' + mat1.color.getHexString().toUpperCase()).toBe(targetSwatch.hex.toUpperCase())
    expect('#' + mat2.color.getHexString().toUpperCase()).toBe(targetSwatch.hex.toUpperCase())

    // Reset restores original multi-colors and clears active swatch
    await wrapper.find('.reset-btn').trigger('click')
    expect('#' + mat1.color.getHexString().toUpperCase()).toBe('#FF0000')
    expect('#' + mat2.color.getHexString().toUpperCase()).toBe('#00FF00')
    expect(wrapper.findAll('.filament-swatch--active').length).toBe(0)
    expect(wrapper.find('.reset-btn').exists()).toBe(false)

    wrapper.unmount()
  })

  test('does not highlight preset swatch for models with userData.hasFileColor === true (Finding 4)', async () => {
    mockWebGLThrow = false
    const bytes = new Uint8Array(buildBinaryStl(SPANNING_TRIANGLES))
    window.meshNest = {
      readModelFile: vi.fn().mockResolvedValue(bytes),
    } as unknown as Window['meshNest']

    const threeMfPath = '/models/file-color.3mf'

    const mat = new three.MeshStandardMaterial({ color: '#FF6A00' })
    const mesh = new three.Mesh(new three.BufferGeometry(), mat)
    mesh.userData.originalColor = '#FF6A00'
    mesh.userData.hasFileColor = true

    const group = new three.Group()
    group.add(mesh)

    vi.spyOn(threeMfLoader, 'loadThreeMfSceneAsync').mockResolvedValue({
      root: group,
      source: '3mf',
    })

    const wrapper = mount(ModelPreview3D, {
      props: { filePath: threeMfPath, extension: '3mf' as const },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    // No preset swatch should be active even if file color matches a preset hex
    expect(wrapper.findAll('.filament-swatch--active').length).toBe(0)
    expect(wrapper.find('.reset-btn').exists()).toBe(false)

    wrapper.unmount()
  })
})
