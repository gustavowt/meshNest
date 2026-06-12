import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import SearchResultCard from '@/components/search/SearchResultCard.vue'
import type { SearchResult } from '@/types/search'

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    modelFileId: 'id-1',
    filename: 'dragon-stand.stl',
    absolutePath: '/models/dragon-stand.stl',
    extension: 'stl',
    shortName: 'dragon stand',
    description: 'A decorative dragon-shaped phone stand.',
    likelyCategory: 'gadget',
    tags: ['dragon', 'stand'],
    distance: 0.31,
    score: 0.845,
    ...overrides,
  }
}

describe('SearchResultCard', () => {
  test('shows name, filename, category, tags, and description', () => {
    const wrapper = mount(SearchResultCard, { props: { result: result() } })

    expect(wrapper.find('.card-title').text()).toBe('dragon stand')
    expect(wrapper.find('.card-subtitle').text()).toBe('dragon-stand.stl')
    expect(wrapper.findAll('ion-chip').map((chip) => chip.text())).toEqual([
      'gadget',
      'dragon',
      'stand',
    ])
    expect(wrapper.find('.description').text()).toContain('dragon-shaped phone stand')
  })

  test('shows the score as a subtle percentage badge', () => {
    const wrapper = mount(SearchResultCard, { props: { result: result({ score: 0.845 }) } })

    const score = wrapper.find('.score')
    expect(score.text()).toBe('85%')
    expect(score.attributes('title')).toContain('0.310')
  })

  test('falls back to the filename without an AI name', () => {
    const wrapper = mount(SearchResultCard, {
      props: { result: result({ shortName: undefined }) },
    })

    expect(wrapper.find('.card-title').text()).toBe('dragon-stand.stl')
  })

  test('emits select with the result when clicked', async () => {
    const item = result()
    const wrapper = mount(SearchResultCard, { props: { result: item } })

    await wrapper.find('ion-card').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([item])
  })
})
