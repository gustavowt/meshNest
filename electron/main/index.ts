import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app } from 'electron'
import { registerDatabaseIpc } from './ipc/databaseIpc'
import { registerFilesystemIpc } from './ipc/filesystemIpc'
import { registerRenderingIpc } from './ipc/renderingIpc'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'meshNest',
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
  registerFilesystemIpc()
  registerRenderingIpc()
  registerDatabaseIpc()
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
