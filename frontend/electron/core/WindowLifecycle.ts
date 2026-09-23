/**
 * WindowLifecycle — Window creation, state, and navigation guards
 */

import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import { Logger } from './Logger'
import { ConfigManager } from './ConfigManager'
import { WindowStateManager } from './WindowStateManager'

export class WindowLifecycle {
  private mainWindow: BrowserWindow | null = null

  constructor(
    private readonly config: ConfigManager,
    private readonly logger: Logger,
  ) {}

  getWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  createWindow(): void {
    const windowConfig = this.config.get('window')
    const state = WindowStateManager.restore({
      width: windowConfig.defaultWidth,
      height: windowConfig.defaultHeight,
    })

    this.mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      minWidth: windowConfig.minWidth,
      minHeight: windowConfig.minHeight,
      show: false,
      icon: join(__dirname, 'icon.ico'),
      backgroundColor: '#0a0e14',
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // CSP headers on the new window
    const { applyCSP } = require('./security')
    applyCSP(this.mainWindow)

    if (state.maximized) this.mainWindow.maximize()
    WindowStateManager.track(this.mainWindow)

    // `mainWindow` is nulled by the 'closed' handler below, so a window
    // destroyed before it is ready would call .show() on null here.
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
    })

    const isDev = !app.isPackaged
    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173')
    } else {
      this.mainWindow.loadFile(join(__dirname, '..', 'dist-electron', 'index.html'))
    }

    this.setupNavigationGuards()
    this.setupCloseBehaviour()
  }

  private setupNavigationGuards(): void {
    if (!this.mainWindow) return

    // External links open in the user's default browser, not inside Electron.
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
      if (url.startsWith('file://')) {
        shell.openExternal(this.fileUrlToSiteUrl(url))
        return { action: 'deny' }
      }
      return { action: 'deny' }
    })

    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      if (/^https?:/.test(url) && !url.startsWith('http://localhost:5173')) {
        event.preventDefault()
        shell.openExternal(url)
      } else if (url.startsWith('file://') && !url.includes('index.html')) {
        event.preventDefault()
        shell.openExternal(this.fileUrlToSiteUrl(url))
      }
    })
  }

  /**
   * Map a local file:// URL to its hosted equivalent on yogik.web.app.
   * e.g. file:///C:/app/dist-electron/privacy.html → https://yogatik.web.app/privacy
   */
  private fileUrlToSiteUrl(fileUrl: string): string {
    const parts = fileUrl.split(/[/\\]/).filter(Boolean)
    const lastPart = parts[parts.length - 1] || ''
    const cleanPath = lastPart.replace(/\.html$/i, '')
    return `https://yogatik.web.app/${cleanPath}`
  }

  private setupCloseBehaviour(): void {
    if (!this.mainWindow) return

    // Closing hides to the tray (background) instead of quitting; real quit
    // sets app.isQuitting (tray menu / Cmd+Q).
    this.mainWindow.on('close', (e) => {
      if (!(app as unknown as { isQuitting: boolean }).isQuitting) {
        e.preventDefault()
        this.mainWindow?.hide()
      }
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }

  handleSecondInstance(argv: string[]): void {
    try {
      // A yogatik:// link launched this second process; the URL is in its argv.
      const { handleSecondInstance } = require('./deepLink')
      handleSecondInstance(argv)
    } catch { /* still focus the window below */ }

    try {
      const window = this.getWindow()
      if (window) {
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
      } else {
        this.createWindow()
      }
    } catch {
      this.createWindow()
    }
  }
}