import { config } from '@vue/test-utils'
import { vi } from 'vitest'
import enMessages from '../../src/i18n/locales/en.json'

function translate(key: string, params?: any): string {
  const parts = key.split('.')
  let current: any = enMessages
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      current = undefined
      break
    }
  }

  let text = typeof current === 'string' ? current : key
  if (params) {
    Object.keys(params).forEach((p) => {
      text = text.replace(`{${p}}`, String(params[p]))
    })
  }
  return text
}

// Mock $t globally in template renders
config.global.mocks = {
  $t: translate,
}

// Mock useI18n composable globally
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: translate,
    locale: {
      value: 'en',
    },
  }),
  createI18n: () => ({
    global: {
      locale: {
        value: 'en',
      },
      t: translate,
    },
    install: () => {},
  }),
}))
