import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import ModelMetadataPanel from '@/components/model/ModelMetadataPanel.vue'
import type { ModelDetail } from '@/types/modelDetail'

function detail(overrides: Partial<ModelDetail> = {}): ModelDetail {
  return {
    file: {
      id: 'id-1',
      projectId: 'default',
      absolutePath: '/models/dragon-stand.stl',
      relativePath: 'dragon-stand.stl',
      filename: 'dragon-stand.stl',
      extension: 'stl',
      sizeBytes: 4096,
      modifiedAt: '2026-06-01T10:00:00.000Z',
      contentHash: 'hash',
      status: 'indexed',
      indexedAt: '2026-06-02T10:00:00.000Z',
    },
    renderAssets: [],
    ...overrides,
  }
}

describe('ModelMetadataPanel', () => {
  test('shows filename, path, and file facts', () => {
    const wrapper = mount(ModelMetadataPanel, { props: { detail: detail() } })

    expect(wrapper.text()).toContain('dragon-stand.stl')
    expect(wrapper.find('.path').text()).toBe('/models/dragon-stand.stl')
    expect(wrapper.text()).toContain('4.0 KB')
    expect(wrapper.text()).toContain('STL')
  })

  test('shows geometry dimensions and counts', () => {
    const wrapper = mount(ModelMetadataPanel, {
      props: {
        detail: detail({
          geometry: {
            widthMm: 10,
            heightMm: 20.5,
            depthMm: 30,
            triangleCount: 1234,
            vertexCount: 3702,
            meshCount: 1,
            objectCount: 1,
          },
        }),
      },
    })

    expect(wrapper.text()).toContain('10.0 × 20.5 × 30.0 mm')
    expect(wrapper.text()).toContain('1,234')
    expect(wrapper.text()).toContain('3,702')
  })

  test('shows the AI description with tags and search phrases', () => {
    const wrapper = mount(ModelMetadataPanel, {
      props: {
        detail: detail({
          description: {
            shortName: 'dragon stand',
            description: 'A decorative dragon-shaped phone stand.',
            likelyCategory: 'gadget',
            tags: ['dragon', 'stand'],
            objectsDetected: ['dragon'],
            confidence: 0.87,
            searchPhrases: ['dragon phone stand', 'fantasy desk holder'],
          },
        }),
      },
    })

    expect(wrapper.text()).toContain('A decorative dragon-shaped phone stand.')
    expect(wrapper.findAll('ion-chip').map((chip) => chip.text())).toEqual([
      'gadget',
      'dragon',
      'stand',
    ])
    expect(wrapper.text()).toContain('87%')
    const phrases = wrapper.findAll('.search-phrases li').map((item) => item.text())
    expect(phrases).toEqual(['dragon phone stand', 'fantasy desk holder'])
  })

  test('shows 3MF package metadata when present', () => {
    const wrapper = mount(ModelMetadataPanel, {
      props: {
        detail: detail({
          threeMf: {
            objectNames: ['Box', 'Lid'],
            materialNames: ['Red PLA'],
            colorValues: ['#FF0000'],
            hasThumbnail: true,
            rawMetadataJson: '{}',
          },
        }),
      },
    })

    expect(wrapper.text()).toContain('Box, Lid')
    expect(wrapper.text()).toContain('Red PLA')
    expect(wrapper.text()).toContain('#FF0000')
  })

  test('hides AI and 3MF sections when data is missing', () => {
    const wrapper = mount(ModelMetadataPanel, { props: { detail: detail() } })

    expect(wrapper.text()).not.toContain('AI description')
    expect(wrapper.text()).not.toContain('3MF package')
  })

  test('shows the raw indexing error for failed files', () => {
    const failed = detail()
    failed.file.status = 'failed'
    failed.file.errorMessage = 'Failed to parse STL file: empty geometry'

    const wrapper = mount(ModelMetadataPanel, { props: { detail: failed } })

    expect(wrapper.find('.error-output').text()).toBe('Failed to parse STL file: empty geometry')
  })
})
