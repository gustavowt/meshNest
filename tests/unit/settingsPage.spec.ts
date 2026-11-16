import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingsPage from '@/views/SettingsPage.vue'
import { resetLibraryStore } from '@/stores/libraryStore'
import { resetSearchStore } from '@/stores/searchStore'
import { resetSettingsStore } from '@/stores/settingsStore'
import { resetIndexingStore, useIndexingStore } from '@/stores/indexingStore'

const stubs = {
  'ion-page': { template: '<div><slot /></div>' },
  'ion-header': { template: '<div><slot /></div>' },
  'ion-toolbar': { template: '<div><slot /></div>' },
  'ion-title': { template: '<div><slot /></div>' },
  'ion-buttons': { template: '<div><slot /></div>' },
  'ion-back-button': { template: '<button><slot /></button>' },
  'ion-content': { template: '<div><slot /></div>' },
  'ion-segment': { template: '<div><slot /></div>' },
  'ion-segment-button': { template: '<button><slot /></button>' },
  'ion-icon': { template: '<span />' },
  'ion-list': { template: '<div><slot /></div>' },
  'ion-item': { template: '<div><slot /><slot name="end" /></div>' },
  'ion-label': { template: '<span><slot /></span>' },
  'ion-button': { template: '<button><slot /></button>' },
  'ion-spinner': { template: '<span class="test-spinner reset-spinner" />' },
  'ion-text': { template: '<div><slot /></div>' },
}

function installBridge(overrides: Record<string, unknown> = {}) {
  window.meshNest = {
    syncProviderSettings: async () => undefined,
    isBuiltinEmbeddingAvailable: async () => true,
    listLibraryEntries: vi.fn(async () => []),
    countEmbeddings: vi.fn(async () => 0),
    resetDatabase: vi.fn(async () => ({ ok: true, removed: [] })),
    ...overrides,
  } as any
}

function mountPage() {
  return mount(SettingsPage, { global: { stubs } })
}

async function openStorageSection(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.get('[data-testid="storage-nav"]').trigger('click')
  await flushPromises()
}

function resetButton(wrapper: ReturnType<typeof mountPage>) {
  return (
    wrapper.findAll('button').find((button) =>
      /Reset…|Confirm reset\?/.test(button.text()),
    ) ?? wrapper.find('.storage-row button')
  )
}

beforeEach(() => {
  resetLibraryStore()
  resetSearchStore()
  resetSettingsStore()
  resetIndexingStore()
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  delete (window as any).meshNest
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SettingsPage storage section', () => {
  test('arms the confirm state on first press and disarms after 5 seconds', async () => {
    installBridge()
    const wrapper = mountPage()
    await flushPromises()
    await openStorageSection(wrapper)

    vi.useFakeTimers()
    await resetButton(wrapper)!.trigger('click')
    expect(resetButton(wrapper)!.text()).toContain('Confirm reset?')

    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()

    expect(resetButton(wrapper)!.text()).toContain('Reset…')
    expect(window.meshNest.resetDatabase).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  test('executes the reset on second press and shows the success count', async () => {
    installBridge({
      resetDatabase: vi.fn(async () => ({ ok: true, removed: ['/a', '/b'] })),
    })
    const wrapper = mountPage()
    await flushPromises()
    await openStorageSection(wrapper)

    await resetButton(wrapper)!.trigger('click')
    await resetButton(wrapper)!.trigger('click')
    await flushPromises()
    console.log('WRAPPER_HTML:', wrapper.html())

    expect(wrapper.find('.reset-result').text()).toContain('2')
    expect(window.meshNest.resetDatabase).toHaveBeenCalledTimes(1)
    expect(window.meshNest.listLibraryEntries).toHaveBeenCalled()
    wrapper.unmount()
  })

  test('shows the error message when the reset fails', async () => {
    installBridge({
      resetDatabase: vi.fn(async () => ({ ok: false, error: 'boom' })),
    })
    const wrapper = mountPage()
    await flushPromises()
    await openStorageSection(wrapper)

    await resetButton(wrapper)!.trigger('click')
    await resetButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.reset-result').text()).toContain('boom')
    wrapper.unmount()
  })

  test('shows a spinner and disables the button while resetting', async () => {
    let resolveReset: (value: { ok: boolean; removed?: string[] }) => void = () => {}
    const pending = new Promise<{ ok: boolean; removed?: string[] }>((resolve) => {
      resolveReset = resolve
    })
    installBridge({ resetDatabase: vi.fn(() => pending) })
    const wrapper = mountPage()
    await flushPromises()
    await openStorageSection(wrapper)

    await resetButton(wrapper)!.trigger('click')
    await resetButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(resetButton(wrapper)!.attributes()).toHaveProperty('disabled')
    expect(wrapper.find('.test-spinner, .reset-spinner').exists()).toBe(true)

    resolveReset({ ok: true, removed: [] })
    await flushPromises()

    expect(resetButton(wrapper)!.attributes()).not.toHaveProperty('disabled')
    wrapper.unmount()
  })

  test('disables the reset button and disarms if indexing starts while armed', async () => {
    installBridge()
    const indexing = useIndexingStore()
    const wrapper = mountPage()
    await flushPromises()
    await openStorageSection(wrapper)

    await resetButton(wrapper)!.trigger('click')
    expect(resetButton(wrapper)!.text()).toContain('Confirm reset?')

    indexing.state.running = true
    await nextTick()

    expect(resetButton(wrapper)!.attributes()).toHaveProperty('disabled')
    expect(resetButton(wrapper)!.text()).toContain('Reset…')

    indexing.state.running = false
    await nextTick()

    expect(resetButton(wrapper)!.attributes()).not.toHaveProperty('disabled')
    expect(resetButton(wrapper)!.text()).toContain('Reset…')
    wrapper.unmount()
  })
})
