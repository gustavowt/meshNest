import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, Menu, app, nativeImage, shell } from 'electron'
import { registerDatabaseIpc } from './ipc/databaseIpc'
import { registerFilesystemIpc } from './ipc/filesystemIpc'
import { registerModelActionsIpc } from './ipc/modelActionsIpc'
import { registerRenderingIpc } from './ipc/renderingIpc'
import { registerLlmIpc } from './ipc/llmIpc'
import { registerSettingsIpc } from './ipc/settingsIpc'
import { registerWorldSearchIpc } from './ipc/worldSearchIpc'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

function resolveAppIcon(): string {
  return process.env.VITE_DEV_SERVER_URL
    ? path.join(currentDir, '../public/meshNest_logo.png')
    : path.join(currentDir, '../dist/meshNest_logo.png')
}

function resolveAppOrigin(): string | null {
  if (!process.env.VITE_DEV_SERVER_URL) {
    return null
  }
  try {
    return new URL(process.env.VITE_DEV_SERVER_URL).origin
  } catch {
    return null
  }
}

function isExternalHttpNavigation(url: string, appOrigin: string | null): boolean {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return false
    }
    return appOrigin ? parsedUrl.origin !== appOrigin : true
  } catch {
    return false
  }
}

function registerExternalNavigationHandlers(window: BrowserWindow): void {
  const appOrigin = resolveAppOrigin()

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpNavigation(url, appOrigin)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!isExternalHttpNavigation(url, appOrigin)) {
      return
    }
    event.preventDefault()
    void shell.openExternal(url)
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'meshNest',
    icon: resolveAppIcon(),
    webPreferences: {
      preload: path.join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  registerExternalNavigationHandlers(window)

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(currentDir, '../dist/index.html'))
  }
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [mainWindow] = BrowserWindow.getAllWindows()

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }

      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    if (process.platform === 'darwin' && app.dock) {
      const icon = nativeImage.createFromPath(resolveAppIcon())
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon)
      }
    }
    registerFilesystemIpc()
    registerRenderingIpc()
    registerDatabaseIpc()
    registerModelActionsIpc()
    registerSettingsIpc()
    registerLlmIpc()
    registerWorldSearchIpc()
    createWindow()
  })
}

app.on('activate', () => {
  if (gotTheLock && BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  // Single-window app: quit when the main window closes (MAS Guideline 4).
  // The app ships without a menu bar, so there is no Window menu to reopen it.
  app.quit()
})
