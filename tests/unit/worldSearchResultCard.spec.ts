import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import WorldSearchResultCard from '@/components/world-search/WorldSearchResultCard.vue'

describe('WorldSearchResultCard', () => {
  test('renders provider label and emits open', async () => {
    const wrapper = mount(WorldSearchResultCard, {
      props: {
        result: {
          id: 'sketchfab:abc',
          providerId: 'sketchfab',
          sourceId: 'abc',
          title: 'Phone Stand',
          sourceUrl: 'https://sketchfab.com/3d-models/phone-stand',
          score: 0.8,
          formats: ['glb'],
        },
      },
    })

    expect(wrapper.text()).toContain('Phone Stand')
    expect(wrapper.text()).toContain('Sketchfab')
    await wrapper.trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  test('renders Creality Cloud provider label without experimental badge', () => {
    const wrapper = mount(WorldSearchResultCard, {
      props: {
        result: {
          id: 'crealitycloud:benchy-duck',
          providerId: 'crealitycloud',
          sourceId: 'benchy-duck',
          title: 'Duck Benchy',
          sourceUrl: 'https://www.crealitycloud.com/model-detail/benchy-duck',
          score: 0.7,
          formats: ['stl', '3mf'],
        },
      },
    })

    expect(wrapper.text()).toContain('Creality Cloud')
    expect(wrapper.text()).not.toContain('Experimental')
  })
})
