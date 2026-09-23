/**
 * WindowStateManager — Persisted window bounds and state
 */

import { BrowserWindow } from 'electron'
import { join } from 'path'
import { app } from 'electron'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1200,
  height: 820,
  maximized: false,
}

export class WindowStateManager {
  private static statePath: string

  static initialize(): void {
    this.statePath = join(app.getPath('userData'), 'window-state.json')
  }

  static restore(defaults: Partial<WindowState> = {}): WindowState {
    if (!this.statePath) this.initialize()

    try {
      const fs = require('fs')
      if (require('fs').existsSync(this.statePath)) {
        const saved = JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
        return { ...DEFAULT_STATE, ...defaults, ...saved }
      }
    } catch { /* ignore */ }

    return { ...DEFAULT_STATE, ...defaults }
  }

  static track(window: BrowserWindow): void {
    if (!this.statePath) this.initialize()

    const saveState = () => {
      if (window.isDestroyed()) return

      const bounds = window.getBounds()
      const state: WindowState = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: window.isMaximized(),
      }

      try {
        require('fs').writeFileSync(this.statePath, JSON.stringify(state))
      } catch { /* ignore */ }
    }

    window.on('resize', saveState)
    window.on('move', saveState)
    window.on('maximize', saveState)
    window.on('unmaximize', saveState)
  }

  static clear(): void {
    if (!this.statePath) this.initialize()
    try {
      require('fs').unlinkSync(this.statePath)
    } catch { /* ignore */ }
  }
}