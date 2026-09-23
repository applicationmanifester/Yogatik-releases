/**
 * ConfigManager — Centralized configuration with validation
 */

export interface AppConfig {
  // Window
  window: {
    defaultWidth: number
    defaultHeight: number
    minWidth: number
    minHeight: number
  }
  // Search sidecar
  search: {
    enabled: boolean
    startupTimeoutMs: number
    port: number
  }
  // Timeouts
  timeouts: {
    auth: number
    terminal: number
    evalJs: number
    powershell: number
  }
  // Security
  security: {
    allowedActionTypes: string[]
    maxCommandLength: number
    evalJsMaxTimeout: number
  }
  // Features
  features: {
    companionMode: boolean
    terminal: boolean
    browserControl: boolean
    ollama: boolean
    comfyUI: boolean
    torrents: boolean
    cast: boolean
  }
}

const DEFAULT_CONFIG: AppConfig = {
  window: {
    defaultWidth: 1200,
    defaultHeight: 820,
    minWidth: 380,
    minHeight: 560,
  },
  search: {
    enabled: true,
    startupTimeoutMs: 10000,
    port: 0, // Auto-assign
  },
  timeouts: {
    auth: 120000,
    terminal: 300000,
    evalJs: 5000,
    powershell: 3000,
  },
  security: {
    allowedActionTypes: ['type', 'hotkey', 'clipboard', 'launch'],
    maxCommandLength: 10000,
    evalJsMaxTimeout: 30000,
  },
  features: {
    companionMode: true,
    terminal: true,
    browserControl: true,
    ollama: true,
    comfyUI: true,
    torrents: true,
    cast: true,
  },
}

export class ConfigManager {
  private config: AppConfig = DEFAULT_CONFIG
  private overrides: Partial<AppConfig> = {}

  constructor(overrides?: Partial<AppConfig>) {
    if (overrides) {
      this.overrides = overrides
      this.config = this.deepMerge(DEFAULT_CONFIG, overrides)
    }
    // Load from file if exists
    this.loadFromFile()
  }

  private loadFromFile(): void {
    try {
      const fs = require('fs')
      const path = require('path')
      const configPath = path.join(require('electron').app.getPath('userData'), 'config.json')
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        this.config = this.deepMerge(this.config, fileConfig)
      }
    } catch { /* ignore - use defaults */ }
  }

  saveToFile(): void {
    try {
      const fs = require('fs')
      const path = require('path')
      const configPath = path.join(require('electron').app.getPath('userData'), 'config.json')
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2))
    } catch (e) {
      console.error('Failed to save config:', e)
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value
    this.saveToFile()
  }

  getAll(): Readonly<AppConfig> {
    return this.config
  }

  isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
    return this.config.features[feature] === true
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }
}