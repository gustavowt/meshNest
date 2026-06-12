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

describe('ModelCard', () => {
  test('shows the AI short name as title and filename as subtitle', () => {
    const wrapper = mount(ModelCard, {
      props: { entry: entry({ shortName: 'dragon stand' }) },
    })

    expect(wrapper.find('.card-title').text()).toBe('dragon stand')
    expect(wrapper.find('.card-subtitle').text()).toBe('dragon-stand.stl')
  })

  test('falls back to the filename when no AI name exists', () => {
    const wrapper = mount(ModelCard, {
      props: { entry: entry({ status: 'pending' }) },
    })

    expect(wrapper.find('.card-title').text()).toBe('dragon-stand.stl')
  })

  test('shows category and at most three tags with an overflow counter', () => {
    const wrapper = mount(ModelCard, {
      props: {
        entry: entry({
          likelyCategory: 'figurine',
          tags: ['dragon', 'stand', 'phone', 'desk', 'fantasy'],
        }),
      },
    })

    const chips = wrapper.findAll('ion-chip')
    expect(chips.map((chip) => chip.text())).toEqual(['figurine', 'dragon', 'stand', 'phone'])
    expect(wrapper.find('.more-tags').text()).toBe('+2')
  })

  test('shows the indexing status badge', () => {
    const wrapper = mount(ModelCard, {
      props: { entry: entry({ status: 'indexed' }) },
    })

    expect(wrapper.findComponent({ name: 'IndexingStatusBadge' }).exists()).toBe(true)
    expect(wrapper.find('ion-badge').text()).toBe('Indexed')
  })

  test('shows the error message for failed entries', () => {
    const wrapper = mount(ModelCard, {
      props: {
        entry: entry({ status: 'failed', errorMessage: 'Failed to parse STL file' }),
      },
    })

    expect(wrapper.find('.error-message').text()).toBe('Failed to parse STL file')
    expect(wrapper.find('ion-badge').text()).toBe('Failed')
  })

  test('shows a placeholder when there is no thumbnail', () => {
    const wrapper = mount(ModelCard, { props: { entry: entry() } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.placeholder-icon').exists()).toBe(true)
  })

  test('emits select with the entry when clicked', async () => {
    const cardEntry = entry()
    const wrapper = mount(ModelCard, { props: { entry: cardEntry } })

    await wrapper.find('ion-card').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([cardEntry])
  })
})
