import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

type WindowOpenHandler = (details: { url: string }) => { action: 'allow' | 'deny' }
type WillNavigateHandler = (event: { preventDefault: () => void }, url: string) => void

const createdWindows: MockBrowserWindow[] = []
const openExternal = vi.fn()

class MockBrowserWindow {
  readonly webContents = {
    setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
      this.windowOpenHandler = handler
    }),
    on: vi.fn((eventName: string, handler: WillNavigateHandler) => {
      if (eventName === 'will-navigate') {
        this.willNavigateHandler = handler
      }
    }),
  }

  windowOpenHandler?: WindowOpenHandler
  willNavigateHandler?: WillNavigateHandler
  loadURL = vi.fn()
  loadFile = vi.fn()

  constructor() {
    createdWindows.push(this)
  }
}

vi.mock('electron', () => ({
  app: {
    dock: {
      setIcon: vi.fn(),
    },
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: MockBrowserWindow,
  Menu: {
    setApplicationMenu: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => true,
    })),
  },
  shell: {
    openExternal,
  },
}))

vi.mock('../../electron/main/ipc/databaseIpc', () => ({ registerDatabaseIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/filesystemIpc', () => ({ registerFilesystemIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/llmIpc', () => ({ registerLlmIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/modelActionsIpc', () => ({ registerModelActionsIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/renderingIpc', () => ({ registerRenderingIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/settingsIpc', () => ({ registerSettingsIpc: vi.fn() }))
vi.mock('../../electron/main/ipc/worldSearchIpc', () => ({ registerWorldSearchIpc: vi.fn() }))

describe('Electron external navigation', () => {
  beforeEach(() => {
    vi.resetModules()
    createdWindows.length = 0
    openExternal.mockReset()
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173/'
  })

  afterEach(() => {
    delete process.env.VITE_DEV_SERVER_URL
  })

  test('opens external page links in the system browser instead of the app window', async () => {
    await import('../../electron/main/index')
    await vi.dynamicImportSettled()

    const window = createdWindows[0]
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalled()
    expect(window.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))

    const newWindowDecision = window.windowOpenHandler?.({
      url: 'https://www.printables.com/model/123-phone-stand',
    })
    expect(newWindowDecision).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://www.printables.com/model/123-phone-stand')

    const event = { preventDefault: vi.fn() }
    window.willNavigateHandler?.(event, 'https://makerworld.com/en/models/456')

    expect(event.preventDefault).toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith('https://makerworld.com/en/models/456')
  })
})
