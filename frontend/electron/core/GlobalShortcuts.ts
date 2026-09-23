/**
 * GlobalShortcuts — Centralized global shortcut registration
 */

import { globalShortcut, BrowserWindow } from 'electron'
import { Logger } from './Logger'

export interface GlobalShortcutsConfig {
  getWindow: () => BrowserWindow | null
  logger: Logger
  toggleCompanion: () => void
  isCompanionVisible: () => boolean
  sendToCompanion: (channel: string, data: unknown) => boolean
}

export class GlobalShortcuts {
  private registered = false

  constructor(private readonly config: GlobalShortcutsConfig) {}

  registerAll(): void {
    if (this.registered) return
    this.registered = true

    // Show/hide main window
    globalShortcut.register('CommandOrControl+Shift+Y', () => {
      this.toggleMainWindow()
    })

    // Toggle companion mode
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      this.config.toggleCompanion()
    })

    // Act on selection (copy + send to app)
    globalShortcut.register('CommandOrControl+Alt+C', () => {
      this.handleSelectionHotkey()
    })

    // Quick search
    globalShortcut.register('CommandOrControl+Alt+K', () => {
      this.openSearchPalette()
    })

    this.config.logger.info('Global shortcuts registered')
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registered = false
    this.config.logger.info('Global shortcuts unregistered')
  }

  private toggleMainWindow(): void {
    const window = this.config.getWindow()
    if (!window || window.isDestroyed()) return

    try {
      if (window.isVisible() && window.isFocused()) {
        window.hide()
      } else {
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
      }
    } catch (e) {
      this.config.logger.error('Failed to toggle main window', { error: String(e) })
    }
  }

  private handleSelectionHotkey(): void {
    const { clipboard } = require('electron')
    const relay = () => {
      try {
        const text = clipboard.readText() || ''

        // If companion is visible, send there
        if (this.config.isCompanionVisible() && this.config.sendToCompanion('clipboard-selection-hotkey', { text, at: Date.now() })) {
          return
        }

        const window = this.config.getWindow()
        if (!window || window.isDestroyed()) return

        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
        window.webContents.send('clipboard-selection-hotkey', { text, at: Date.now() })
      } catch (e) {
        this.config.logger.error('Selection hotkey failed', { error: String(e) })
      }
    }

    if (process.platform === 'win32') {
      // Send Ctrl+C to foreground app first
      const { exec } = require('child_process')
      exec(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"`,
        () => setTimeout(relay, 250))
    } else {
      relay()
    }
  }

  private openSearchPalette(): void {
    const window = this.config.getWindow()
    if (!window || window.isDestroyed()) return

    try {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      window.webContents.send('menu', 'open-palette')
    } catch (e) {
      this.config.logger.error('Failed to open search palette', { error: String(e) })
    }
  }
}