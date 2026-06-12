import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import ModelPreview3D from '@/components/model/ModelPreview3D.vue'
import { buildBinaryStl, SPANNING_TRIANGLES } from './helpers/stlFixtures'

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
})
