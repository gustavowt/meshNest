import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

type AppEventHandler = () => void

const createdWindows: MockBrowserWindow[] = []
const appOn = vi.fn()
const appQuit = vi.fn()
const requestSingleInstanceLockFn = vi.fn(() => true)
const whenReady = vi.fn(() => Promise.resolve())
const dockSetIcon = vi.fn()
const openExternal = vi.fn()
const registerDatabaseIpc = vi.fn()
const registerFilesystemIpc = vi.fn()
const registerLlmIpc = vi.fn()
const registerModelActionsIpc = vi.fn()
const registerRenderingIpc = vi.fn()
const registerSettingsIpc = vi.fn()
const registerWorldSearchIpc = vi.fn()

class MockBrowserWindow {
  static getAllWindows = (): MockBrowserWindow[] => createdWindows

  readonly webContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
  }

  isMinimized = vi.fn(() => false)
  restore = vi.fn()
  focus = vi.fn()
  loadURL = vi.fn()
  loadFile = vi.fn()

  constructor() {
    createdWindows.push(this)
  }
}

vi.mock('electron', () => ({
  app: {
    dock: {
      setIcon: dockSetIcon,
    },
    on: appOn,
    quit: appQuit,
    requestSingleInstanceLock: requestSingleInstanceLockFn,
    whenReady,
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

vi.mock('../../electron/main/ipc/databaseIpc', () => ({ registerDatabaseIpc }))
vi.mock('../../electron/main/ipc/filesystemIpc', () => ({ registerFilesystemIpc }))
vi.mock('../../electron/main/ipc/llmIpc', () => ({ registerLlmIpc }))
vi.mock('../../electron/main/ipc/modelActionsIpc', () => ({ registerModelActionsIpc }))
vi.mock('../../electron/main/ipc/renderingIpc', () => ({ registerRenderingIpc }))
vi.mock('../../electron/main/ipc/settingsIpc', () => ({ registerSettingsIpc }))
vi.mock('../../electron/main/ipc/worldSearchIpc', () => ({ registerWorldSearchIpc }))

function findAppEventHandler(eventName: string): AppEventHandler | undefined {
  const call = appOn.mock.calls.find(([name]) => name === eventName)
  return call?.[1] as AppEventHandler | undefined
}

describe('Electron single-instance lock', () => {
  beforeEach(() => {
    vi.resetModules()
    createdWindows.length = 0
    appOn.mockReset()
    appQuit.mockReset()
    requestSingleInstanceLockFn.mockReset()
    requestSingleInstanceLockFn.mockReturnValue(true)
    whenReady.mockReset()
    whenReady.mockReturnValue(Promise.resolve())
    dockSetIcon.mockReset()
    openExternal.mockReset()
    registerDatabaseIpc.mockReset()
    registerFilesystemIpc.mockReset()
    registerLlmIpc.mockReset()
    registerModelActionsIpc.mockReset()
    registerRenderingIpc.mockReset()
    registerSettingsIpc.mockReset()
    registerWorldSearchIpc.mockReset()
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173/'
  })

  afterEach(() => {
    delete process.env.VITE_DEV_SERVER_URL
  })

  test('boots normally when the lock is acquired', async () => {
    await import('../../electron/main/index')
    await vi.dynamicImportSettled()

    expect(requestSingleInstanceLockFn).toHaveBeenCalledTimes(1)
    expect(appQuit).not.toHaveBeenCalled()
    expect(createdWindows.length).toBeGreaterThanOrEqual(1)
    expect(registerDatabaseIpc).toHaveBeenCalledTimes(1)
    expect(findAppEventHandler('second-instance')).toBeTypeOf('function')
  })

  test('second-instance focuses the main window without restoring it', async () => {
    await import('../../electron/main/index')
    await vi.dynamicImportSettled()

    const window = createdWindows[0]
    window.isMinimized.mockReturnValue(false)

    findAppEventHandler('second-instance')?.()

    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(window.restore).not.toHaveBeenCalled()
  })

  test('second-instance restores a minimized window then focuses it', async () => {
    await import('../../electron/main/index')
    await vi.dynamicImportSettled()

    const window = createdWindows[0]
    window.isMinimized.mockReturnValue(true)

    findAppEventHandler('second-instance')?.()

    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(window.restore.mock.invocationCallOrder[0]).toBeLessThan(
      window.focus.mock.invocationCallOrder[0],
    )
  })

  test('quits without booting when the lock is denied', async () => {
    requestSingleInstanceLockFn.mockReturnValue(false)
    whenReady.mockReturnValue(new Promise(() => {}))

    await import('../../electron/main/index')
    await vi.dynamicImportSettled()

    expect(appQuit).toHaveBeenCalledTimes(1)
    expect(createdWindows).toHaveLength(0)
    expect(findAppEventHandler('second-instance')).toBeUndefined()
    expect(whenReady).not.toHaveBeenCalled()
  })
})
