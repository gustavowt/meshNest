import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import LibraryPage from '@/views/LibraryPage.vue'
import { resetLibraryStore } from '@/stores/libraryStore'
import { resetSearchStore } from '@/stores/searchStore'
import { resetSettingsStore, useSettingsStore } from '@/stores/settingsStore'
import type { LibraryEntry } from '@/types/library'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

function entry(overrides: Partial<LibraryEntry>): LibraryEntry {
  const filename = overrides.filename ?? 'dragon.stl'
  return {
    id: crypto.randomUUID(),
    filename,
    relativePath: filename,
    absolutePath: `/models/${filename}`,
    extension: 'stl',
    sizeBytes: 100,
    modifiedAt: '2026-06-01T10:00:00.000Z',
    status: 'indexed',
    tags: [],
    ...overrides,
  }
}

beforeEach(() => {
  resetLibraryStore()
  resetSearchStore()
  resetSettingsStore()
  window.meshNest = {
    onDirectoryWatchEvent: () => () => {},
  } as any
})

afterEach(() => {
  delete (window as any).meshNest
  vi.restoreAllMocks()
})

describe('LibraryPage.vue', () => {
  test('renders all items when search is empty', async () => {
    const mockEntries = [
      entry({ filename: 'dragon.stl' }),
      entry({ filename: 'box.stl' }),
    ]
    window.meshNest = {
      listLibraryEntries: async () => mockEntries,
      countEmbeddings: async () => 2,
      onDirectoryWatchEvent: () => () => {},
    } as any

    const settingsStore = useSettingsStore()
    settingsStore.state.draft = { libraryFolder: '/models' } as any

    const wrapper = mount(LibraryPage, {
      global: {
        stubs: {
          'ion-page': { template: '<div><slot /></div>' },
          'ion-header': { template: '<div><slot /></div>' },
          'ion-toolbar': { template: '<div><slot /></div>' },
          'ion-title': { template: '<div><slot /></div>' },
          'ion-buttons': { template: '<div><slot /></div>' },
          'ion-popover': { template: '<div><slot /></div>' },
          'ion-modal': { template: '<div><slot /></div>' },
          'ion-list': { template: '<div><slot /></div>' },
          'ion-item': { template: '<button><slot /></button>' },
          'ion-label': { template: '<span><slot /></span>' },
          'ion-button': { template: '<button><slot /></button>' },
          'ion-select': { template: '<div><slot /></div>' },
          'ion-select-option': { template: '<div><slot /></div>' },
          'ion-icon': { template: '<div><slot /></div>' },
          'ion-progress-bar': { template: '<div><slot /></div>' },
          'ion-content': { template: '<div><slot /></div>' },
          'ion-spinner': { template: '<div><slot /></div>' },
          'ion-searchbar': {
            template: '<input class="search-input" :value="value" @input="$emit(\'ion-input\', { detail: { value: $event.target.value } })" />',
            props: ['value'],
          },
          'model-grid': {
            template: '<div class="mock-grid"><div v-for="e in entries" :key="e.id" class="item">{{ e.filename }}</div></div>',
            props: ['entries'],
          },
        },
      },
    })

    await flushPromises()

    const items = wrapper.findAll('.mock-grid .item')
    expect(items).toHaveLength(2)
    // Alphabetically sorted: box.stl first, then dragon.stl
    expect(items[0].text()).toContain('box.stl')
    expect(items[1].text()).toContain('dragon.stl')
    wrapper.unmount()
  })

  test('triggers debounced semantic search when typing in search bar', async () => {
    vi.useFakeTimers()
    const dragonId = crypto.randomUUID()
    const boxId = crypto.randomUUID()
    const mockEntries = [
      entry({ id: dragonId, filename: 'dragon.stl', tags: ['mythical'] }),
      entry({ id: boxId, filename: 'box.stl', tags: ['storage'] }),
    ]
    window.meshNest = {
      listLibraryEntries: async () => mockEntries,
      countEmbeddings: async () => 2,
      getActiveEmbeddingProvider: async () => ({ name: 'mock', model: 'mock-model', dimensions: 3 }),
      embedText: async () => [0.1, 0.2, 0.3],
      searchByEmbedding: async () => [
        {
          modelFileId: dragonId,
          filename: 'dragon.stl',
          absolutePath: '/models/dragon.stl',
          extension: 'stl',
          tags: ['mythical'],
          distance: 0.1,
          score: 0.95,
        },
        {
          modelFileId: boxId,
          filename: 'box.str',
          absolutePath: '/models/box.stl',
          extension: 'stl',
          tags: ['storage'],
          distance: 0.9,
          score: 0.55, // Should be filtered out because it is < 60% (0.6)
        },
      ],
      onDirectoryWatchEvent: () => () => {},
    } as any

    const settingsStore = useSettingsStore()
    settingsStore.state.draft = { libraryFolder: '/models' } as any

    const wrapper = mount(LibraryPage, {
      global: {
        stubs: {
          'ion-page': { template: '<div><slot /></div>' },
          'ion-header': { template: '<div><slot /></div>' },
          'ion-toolbar': { template: '<div><slot /></div>' },
          'ion-title': { template: '<div><slot /></div>' },
          'ion-buttons': { template: '<div><slot /></div>' },
          'ion-popover': { template: '<div><slot /></div>' },
          'ion-modal': { template: '<div><slot /></div>' },
          'ion-list': { template: '<div><slot /></div>' },
          'ion-item': { template: '<button><slot /></button>' },
          'ion-label': { template: '<span><slot /></span>' },
          'ion-button': { template: '<button><slot /></button>' },
          'ion-select': { template: '<div><slot /></div>' },
          'ion-select-option': { template: '<div><slot /></div>' },
          'ion-icon': { template: '<div><slot /></div>' },
          'ion-progress-bar': { template: '<div><slot /></div>' },
          'ion-content': { template: '<div><slot /></div>' },
          'ion-spinner': { template: '<div><slot /></div>' },
          'ion-searchbar': {
            template: '<input class="search-input" :value="value" @input="$emit(\'ion-input\', { detail: { value: $event.target.value } })" />',
            props: ['value'],
          },
          'model-grid': {
            template: '<div class="mock-grid"><div v-for="e in entries" :key="e.id" class="item">{{ e.filename }} (score: {{ e.score }})</div></div>',
            props: ['entries'],
          },
        },
      },
    })

    await flushPromises()

    // Simulate typing "mythical"
    const input = wrapper.find('.search-input')
    await input.setValue('mythical')
    await flushPromises()

    // Since we have fake timers and it is debounced by 300ms, the semantic search has not run yet.
    // With local filter removed, the items list is empty until semantic search resolves.
    let items = wrapper.findAll('.mock-grid .item')
    expect(items).toHaveLength(0)

    // Fast-forward time
    vi.advanceTimersByTime(300)
    await flushPromises() // resolve the async semanticSearch promises

    // Now it should show the semantic search results with the score >= 60%!
    // The box (55% match) must be filtered out.
    items = wrapper.findAll('.mock-grid .item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('dragon.stl (score: 0.95)')
    expect(items[0].text()).not.toContain('box.stl')

    wrapper.unmount()
    vi.useRealTimers()
  })

  test('shows re-scan failed models action in the hero when failed entries exist', async () => {
    const mockEntries = [
      entry({ filename: 'good.stl', status: 'indexed' }),
      entry({ filename: 'bad.stl', status: 'failed', errorMessage: 'Parse error' }),
    ]
    window.meshNest = {
      listLibraryEntries: async () => mockEntries,
      countEmbeddings: async () => 1,
      onDirectoryWatchEvent: () => () => {},
    } as any

    const settingsStore = useSettingsStore()
    settingsStore.state.draft = { libraryFolder: '/models' } as any

    const wrapper = mount(LibraryPage, {
      global: {
        stubs: {
          'ion-page': { template: '<div><slot /></div>' },
          'ion-header': { template: '<div><slot /></div>' },
          'ion-toolbar': { template: '<div><slot /></div>' },
          'ion-title': { template: '<div><slot /></div>' },
          'ion-buttons': { template: '<div><slot /></div>' },
          'ion-popover': { template: '<div><slot /></div>' },
          'ion-modal': { template: '<div><slot /></div>' },
          'ion-list': { template: '<div><slot /></div>' },
          'ion-item': { template: '<button><slot /></button>' },
          'ion-label': { template: '<span><slot /></span>' },
          'ion-button': { template: '<button><slot /></button>' },
          'ion-select': { template: '<div><slot /></div>' },
          'ion-select-option': { template: '<div><slot /></div>' },
          'ion-icon': { template: '<div><slot /></div>' },
          'ion-progress-bar': { template: '<div><slot /></div>' },
          'ion-content': { template: '<div><slot /></div>' },
          'ion-spinner': { template: '<div><slot /></div>' },
          'model-search-bar': {
            template: '<input class="search-input" />',
          },
          'model-grid': {
            template: '<div class="mock-grid"><div v-for="e in entries" :key="e.id">{{ e.filename }}</div></div>',
            props: ['entries'],
          },
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Re-scan 1 failed model(s)')
    wrapper.unmount()
  })
})

