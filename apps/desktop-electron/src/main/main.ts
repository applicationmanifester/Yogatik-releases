// apps/desktop-electron/src/main/main.ts
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { isDev } from './utils/env.js'

let mainWindow: BrowserWindow | null = null
const ipcHandlers = new Map<string, () => void>()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    // Production: block cert errors
    mainWindow.webContents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
      event.preventDefault()
      callback(false)
    })
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function registerIpcHandlers() {
  const handlers: Record<string, (...args: any[]) => Promise<any>> = {
    'app:getVersion': () => Promise.resolve(app.getVersion()),
    'app:getPlatform': () => Promise.resolve(process.platform),
    'dialog:openFile': async () => {
      if (!mainWindow) return []
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'All Files', extensions: ['*'] }],
      })
      return result.filePaths
    },
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
    ipcHandlers.set(channel, () => ipcMain.removeHandler(channel))
  }

  // Window control handlers (called from preload via ipcRenderer.send)
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
}

function unregisterIpcHandlers() {
  for (const cleanup of ipcHandlers.values()) cleanup()
  ipcHandlers.clear()
  ipcMain.removeAllListeners('window:minimize')
  ipcMain.removeAllListeners('window:maximize')
  ipcMain.removeAllListeners('window:close')
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', unregisterIpcHandlers)