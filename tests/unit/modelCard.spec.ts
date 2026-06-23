import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import ModelCard from '@/components/library/ModelCard.vue'
import type { LibraryEntry } from '@/types/library'

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'id-1',
    filename: 'dragon-stand.stl',
    relativePath: 'dragon-stand.stl',
    absolutePath: '/models/dragon-stand.stl',
    extension: 'stl',
    sizeBytes: 2048,
    modifiedAt: '2026-06-01T10:00:00.000Z',
    status: 'indexed',
    tags: [],
    ...overrides,
  }
}

function mountCard(cardEntry: LibraryEntry) {
  return mount(ModelCard, {
    props: { entry: cardEntry },
    global: {
      mocks: {
        $t: (key: string) => key,
      },
    },
  })
}

describe('ModelCard', () => {
  test('shows the AI short name as title and filename as subtitle', () => {
    const wrapper = mountCard(entry({ shortName: 'dragon stand' }))

    expect(wrapper.find('.card-title').text()).toBe('dragon stand')
    expect(wrapper.find('.card-subtitle').text()).toBe('dragon-stand.stl')
  })

  test('falls back to the filename when no AI name exists', () => {
    const wrapper = mountCard(entry({ status: 'pending' }))

    expect(wrapper.find('.card-title').text()).toBe('dragon-stand.stl')
  })

  test('shows category and at most three tags with an overflow counter', () => {
    const wrapper = mountCard(entry({
      likelyCategory: 'figurine',
      tags: ['dragon', 'stand', 'phone', 'desk', 'fantasy'],
    }))

    const chips = wrapper.findAll('ion-chip')
    expect(chips.map((chip) => chip.text())).toEqual(['figurine', 'dragon', 'stand', 'phone'])
    expect(wrapper.find('.more-tags').text()).toBe('+2')
  })

  test('shows the indexing status icon', () => {
    const wrapper = mountCard(entry({ status: 'indexed' }))

    expect(wrapper.findComponent({ name: 'IndexingStatusBadge' }).exists()).toBe(true)
    const statusIcon = wrapper.find('.status-icon')
    expect(statusIcon.exists()).toBe(true)
    expect(statusIcon.classes()).toContain('indexed')
    expect(statusIcon.attributes('title')).toBe('Indexed')
  })

  test('shows the failed error message on the status icon hover', () => {
    const wrapper = mountCard(entry({ status: 'failed', errorMessage: 'Failed to parse STL file' }))

    const statusIcon = wrapper.find('.status-icon')
    expect(wrapper.find('.error-message').exists()).toBe(false)
    expect(statusIcon.classes()).toContain('failed')
    expect(statusIcon.attributes('title')).toBe('Failed to parse STL file')
    expect(statusIcon.attributes('aria-label')).toBe('Failed: Failed to parse STL file')
  })

  test('shows a placeholder when there is no thumbnail', () => {
    const wrapper = mountCard(entry())

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.placeholder-icon').exists()).toBe(true)
  })

  test('emits select with the entry when clicked', async () => {
    const cardEntry = entry()
    const wrapper = mountCard(cardEntry)

    await wrapper.find('ion-card').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([cardEntry])
  })

  test('emits openDefault without selecting when the open icon is clicked', async () => {
    const cardEntry = entry()
    const wrapper = mountCard(cardEntry)

    const openButton = wrapper.find('.open-default-btn')
    expect(openButton.attributes('aria-label')).toBe('library.openDefaultProgram')
    await openButton.trigger('click')

    expect(wrapper.emitted('openDefault')?.[0]).toEqual([cardEntry])
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
