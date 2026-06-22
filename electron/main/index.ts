import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, nativeImage } from 'electron'
import { registerDatabaseIpc } from './ipc/databaseIpc'
import { registerFilesystemIpc } from './ipc/filesystemIpc'
import { registerModelActionsIpc } from './ipc/modelActionsIpc'
import { registerRenderingIpc } from './ipc/renderingIpc'
import { registerLlmIpc } from './ipc/llmIpc'
import { registerSettingsIpc } from './ipc/settingsIpc'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

function resolveAppIcon(): string {
  return process.env.VITE_DEV_SERVER_URL
    ? path.join(currentDir, '../public/meshNest_logo.png')
    : path.join(currentDir, '../dist/meshNest_logo.png')
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

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(currentDir, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
