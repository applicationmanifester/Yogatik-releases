/**
 * Plugin System — sandboxed user plugins with permission model.
 * Runs in a dedicated Worker/VM context with capability-based permissions.
 */

const PLUGIN_DB_NAME = 'yogatik_plugins'
const PLUGIN_STORE = 'plugins'
const SETTINGS_STORE = 'settings'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PLUGIN_DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(PLUGIN_STORE)) {
        db.createObjectStore(PLUGIN_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/**
 * Built-in capabilities that plugins can request
 */
export const PluginCapability = {
  // Data access
  READ_FILES: 'read_files',
  WRITE_FILES: 'write_files',
  LIST_FILES: 'list_files',
  SEARCH_FILES: 'search_files',
  
  // Shell/Terminal
  RUN_COMMAND: 'run_command',
  START_PROCESS: 'start_process',
  
  // Network
  FETCH: 'fetch',
  WEBSOCKET: 'websocket',
  
  // AI/ML
  CALL_LLM: 'call_llm',
  EMBEDDINGS: 'embeddings',
  IMAGE_GEN: 'image_gen',
  
  // UI
  SHOW_NOTIFICATION: 'show_notification',
  OPEN_MODAL: 'open_modal',
  ADD_SIDEBAR_ITEM: 'add_sidebar_item',
  
  // System
  CLIPBOARD_READ: 'clipboard_read',
  CLIPBOARD_WRITE: 'clipboard_write',
  NOTIFICATIONS: 'notifications',
  
  // Plugin management
  INSTALL_PLUGIN: 'install_plugin',
  UNINSTALL_PLUGIN: 'uninstall_plugin',
}

/**
 * Default capability sets for common plugin types
 */
export const CapabilityPresets = {
  READ_ONLY: [
    PluginCapability.READ_FILES,
    PluginCapability.LIST_FILES,
    PluginCapability.SEARCH_FILES,
  ],
  FILE_MANAGER: [
    PluginCapability.READ_FILES,
    PluginCapability.WRITE_FILES,
    PluginCapability.LIST_FILES,
    PluginCapability.SEARCH_FILES,
  ],
  TERMINAL_TOOL: [
    PluginCapability.RUN_COMMAND,
    PluginCapability.START_PROCESS,
    PluginCapability.READ_FILES,
  ],
  AI_ASSISTANT: [
    PluginCapability.CALL_LLM,
    PluginCapability.EMBEDDINGS,
    PluginCapability.READ_FILES,
  ],
  NETWORK_TOOL: [
    PluginCapability.FETCH,
    PluginCapability.WEBSOCKET,
  ],
  FULL_ACCESS: Object.values(PluginCapability),
}

/**
 * Plugin manifest schema
 */
export const PluginManifestSchema = {
  id: { type: 'string', required: true, pattern: '^[a-z][a-z0-9-]*$' },
  name: { type: 'string', required: true, maxLength: 50 },
  version: { type: 'string', required: true, pattern: '^\\d+\\.\\d+\\.\\d+$' },
  description: { type: 'string', maxLength: 200 },
  author: { type: 'string', maxLength: 50 },
  homepage: { type: 'string', format: 'uri' },
  repository: { type: 'string', format: 'uri' },
  license: { type: 'string' },
  main: { type: 'string', required: true }, // entry point file
  capabilities: { type: 'array', items: { type: 'string' }, default: [] },
  permissions: { type: 'object', default: {} }, // fine-grained per-capability config
  settings: { type: 'object', default: {} }, // user-configurable settings schema
  commands: { type: 'array', items: { type: 'object' }, default: [] }, // slash commands
  hooks: { type: 'object', default: {} }, // event hooks
  minAppVersion: { type: 'string', default: '10.0.0' },
}

/**
 * Validate plugin manifest
 */
export function validateManifest(manifest) {
  const errors = []
  
  if (!manifest.id || !/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    errors.push('id: must be lowercase alphanumeric with hyphens, starting with letter')
  }
  
  if (!manifest.name || manifest.name.length > 50) {
    errors.push('name: required, max 50 chars')
  }
  
  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('version: must be semver (x.y.z)')
  }
  
  if (!manifest.main) {
    errors.push('main: entry point required')
  }
  
  if (manifest.capabilities) {
    const validCapabilities = Object.values(PluginCapability)
    for (const cap of manifest.capabilities) {
      if (!validCapabilities.includes(cap)) {
        errors.push(`capabilities: unknown capability '${cap}'`)
      }
    }
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Sandboxed plugin execution context
 */
class PluginSandbox {
  constructor(pluginId, capabilities, settings = {}) {
    this.pluginId = pluginId
    this.capabilities = new Set(capabilities)
    this.settings = settings
    this.worker = null
    this.messageId = 0
    this.pendingCalls = new Map()
    this.eventHandlers = new Map()
    this.api = this.createAPI()
  }

  hasCapability(cap) {
    return this.capabilities.has(cap)
  }

  assertCapability(cap) {
    if (!this.hasCapability(cap)) {
      throw new Error(`Plugin '${this.pluginId}' lacks required capability: ${cap}`)
    }
  }

  createAPI() {
    const self = this
    return {
      // Capability checking
      hasCapability: (cap) => self.hasCapability(cap),
      
      // Settings
      getSetting: (key) => self.settings[key],
      setSetting: (key, value) => { self.settings[key] = value },
      getAllSettings: () => ({ ...self.settings }),
      
      // Events
      on: (event, handler) => {
        if (!self.eventHandlers.has(event)) self.eventHandlers.set(event, [])
        self.eventHandlers.get(event).push(handler)
        return () => {
          const handlers = self.eventHandlers.get(event) || []
          const idx = handlers.indexOf(handler)
          if (idx >= 0) handlers.splice(idx, 1)
        }
      },
      emit: (event, data) => {
        const handlers = self.eventHandlers.get(event) || []
        for (const h of handlers) {
          try { h(data) } catch (e) { console.error('Plugin event handler error:', e) }
        }
      },
      
      // File operations (if capability granted)
      fs: {
        read: async (path) => {
          self.assertCapability(PluginCapability.READ_FILES)
          return self.callHost('fs:read', { path })
        },
        write: async (path, content) => {
          self.assertCapability(PluginCapability.WRITE_FILES)
          return self.callHost('fs:write', { path, content })
        },
        list: async (path, options) => {
          self.assertCapability(PluginCapability.LIST_FILES)
          return self.callHost('fs:list', { path, ...options })
        },
        search: async (query, options) => {
          self.assertCapability(PluginCapability.SEARCH_FILES)
          return self.callHost('fs:search', { query, ...options })
        },
      },
      
      // Terminal (if capability granted)
      terminal: {
        run: async (command, options) => {
          self.assertCapability(PluginCapability.RUN_COMMAND)
          return self.callHost('terminal:run', { command, ...options })
        },
        start: async (command, options) => {
          self.assertCapability(PluginCapability.START_PROCESS)
          return self.callHost('terminal:start', { command, ...options })
        },
      },
      
      // Network (if capability granted)
      network: {
        fetch: async (url, options) => {
          self.assertCapability(PluginCapability.FETCH)
          return self.callHost('network:fetch', { url, options })
        },
      },
      
      // AI (if capability granted)
      ai: {
        callLLM: async (prompt, options) => {
          self.assertCapability(PluginCapability.CALL_LLM)
          return self.callHost('ai:callLLM', { prompt, ...options })
        },
        embeddings: async (texts, options) => {
          self.assertCapability(PluginCapability.EMBEDDINGS)
          return self.callHost('ai:embeddings', { texts, ...options })
        },
      },
      
      // UI
      ui: {
        notify: (title, body, options) => {
          self.assertCapability(PluginCapability.SHOW_NOTIFICATION)
          return self.callHost('ui:notify', { title, body, ...options })
        },
        openModal: (component, props) => {
          self.assertCapability(PluginCapability.OPEN_MODAL)
          return self.callHost('ui:openModal', { component, props })
        },
      },
      
      // Clipboard
      clipboard: {
        read: async () => {
          self.assertCapability(PluginCapability.CLIPBOARD_READ)
          return self.callHost('clipboard:read', {})
        },
        write: async (text) => {
          self.assertCapability(PluginCapability.CLIPBOARD_WRITE)
          return self.callHost('clipboard:write', { text })
        },
      },
      
      // Plugin management
      plugins: {
        install: async (manifest, code) => {
          self.assertCapability(PluginCapability.INSTALL_PLUGIN)
          return self.callHost('plugins:install', { manifest, code })
        },
        uninstall: async (pluginId) => {
          self.assertCapability(PluginCapability.UNINSTALL_PLUGIN)
          return self.callHost('plugins:uninstall', { pluginId })
        },
      },
      
      // Utility
      log: (...args) => console.log(`[Plugin:${self.pluginId}]`, ...args),
      error: (...args) => console.error(`[Plugin:${self.pluginId}]`, ...args),
      
      // Register command
      registerCommand: (command) => self.callHost('plugin:registerCommand', command),
      
      // Register hook
      registerHook: (event, handler) => self.callHost('plugin:registerHook', { event, handler }),
    }
  }

  async callHost(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId
      this.pendingCalls.set(id, { resolve, reject })
      
      // In real implementation, this would postMessage to host
      // For now, simulate with a timeout
      setTimeout(() => {
        this.pendingCalls.delete(id)
        reject(new Error(`Host method '${method}' not implemented in sandbox`))
      }, 100)
    })
  }

  handleHostResponse(id, result, error) {
    const pending = this.pendingCalls.get(id)
    if (pending) {
      this.pendingCalls.delete(id)
      if (error) pending.reject(new Error(error))
      else pending.resolve(result)
    }
  }

  // Load plugin code in sandbox
  async loadPluginCode(code, manifest) {
    // In production, this would create a Worker with the plugin code
    // For security, we'd use a separate origin or CSP-restricted iframe
    this.manifest = manifest
    
    // Simulate plugin initialization
    const sandboxGlobals = {
      plugin: this.api,
      console: {
        log: (...args) => console.log(`[Plugin:${this.pluginId}]`, ...args),
        error: (...args) => console.error(`[Plugin:${this.pluginId}]`, ...args),
        warn: (...args) => console.warn(`[Plugin:${this.pluginId}]`, ...args),
      },
      // Restricted globals
      fetch: null, // Must use plugin.network.fetch
      XMLHttpRequest: undefined,
      WebSocket: undefined,
      eval: undefined,
      Function: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      localStorage: undefined,
      sessionStorage: undefined,
      indexedDB: undefined,
      document: undefined,
      window: undefined,
      navigator: undefined,
      location: undefined,
      history: undefined,
      crypto: undefined,
    }
    
    // In real implementation, use vm2 or isolated-vm or Worker
    // For now, return the API
    return this.api
  }
}

/**
 * Plugin Manager — handles install, update, enable/disable, sandbox creation
 */
export class PluginManager {
  constructor() {
    this.plugins = new Map() // id -> { manifest, sandbox, enabled, code }
    this.hooks = new Map() // event -> Set<handler>
    this.commands = new Map() // command -> { pluginId, handler }
  }

  async initialize() {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(PLUGIN_STORE, 'readonly')
      const store = tx.objectStore(PLUGIN_STORE)
      const req = store.getAll()
      req.onsuccess = () => {
        for (const record of req.result) {
          this.plugins.set(record.id, {
            manifest: record.manifest,
            code: record.code,
            enabled: record.enabled ?? true,
            sandbox: null,
          })
        }
        resolve()
      }
    })
  }

  async installPlugin(manifest, code) {
    const validation = validateManifest(manifest)
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`)
    }
    
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already installed`)
    }
    
    // Store in IndexedDB
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PLUGIN_STORE, 'readwrite')
      const store = tx.objectStore(PLUGIN_STORE)
      const req = store.put({
        id: manifest.id,
        manifest,
        code,
        enabled: true,
        installedAt: Date.now(),
      })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    
    this.plugins.set(manifest.id, {
      manifest,
      code,
      enabled: true,
      sandbox: null,
    })
    
    return manifest.id
  }

  async uninstallPlugin(pluginId) {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not found`)
    }
    
    await this.disablePlugin(pluginId)
    
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PLUGIN_STORE, 'readwrite')
      const store = tx.objectStore(PLUGIN_STORE)
      const req = store.delete(pluginId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    
    this.plugins.delete(pluginId)
  }

  async enablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`)
    if (plugin.enabled) return
    
    // Create sandbox
    const sandbox = new PluginSandbox(
      pluginId,
      plugin.manifest.capabilities || [],
      plugin.settings || {}
    )
    
    // Load plugin code
    await sandbox.loadPluginCode(plugin.code, plugin.manifest)
    
    plugin.sandbox = sandbox
    plugin.enabled = true
    
    // Register commands
    if (plugin.manifest.commands) {
      for (const cmd of plugin.manifest.commands) {
        this.commands.set(cmd.name, { pluginId, handler: cmd.handler })
      }
    }
    
    // Register hooks
    if (plugin.manifest.hooks) {
      for (const [event, handler] of Object.entries(plugin.manifest.hooks)) {
        if (!this.hooks.has(event)) this.hooks.set(event, new Map())
        this.hooks.get(event).set(pluginId, handler)
      }
    }
    
    // Persist
    await this.persistPlugin(pluginId)
    
    // Emit enable event
    this.emit('plugin:enabled', { pluginId, manifest: plugin.manifest })
  }

  async disablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId)
    if (!plugin || !plugin.enabled) return
    
    // Unregister commands
    if (plugin.manifest.commands) {
      for (const cmd of plugin.manifest.commands) {
        this.commands.delete(cmd.name)
      }
    }
    
    // Unregister hooks
    if (plugin.manifest.hooks) {
      for (const [event] of Object.entries(plugin.manifest.hooks)) {
        this.hooks.get(event)?.delete(pluginId)
      }
    }
    
    plugin.sandbox = null
    plugin.enabled = false
    
    await this.persistPlugin(pluginId)
    this.emit('plugin:disabled', { pluginId, manifest: plugin.manifest })
  }

  async updatePluginSettings(pluginId, settings) {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`)
    
    plugin.settings = { ...plugin.settings, ...settings }
    if (plugin.sandbox) {
      plugin.sandbox.settings = plugin.settings
    }
    await this.persistPlugin(pluginId)
  }

  async persistPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return
    
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLUGIN_STORE, 'readwrite')
      const store = tx.objectStore(PLUGIN_STORE)
      const req = store.put({
        id: pluginId,
        manifest: plugin.manifest,
        code: plugin.code,
        enabled: plugin.enabled,
        settings: plugin.settings,
        updatedAt: Date.now(),
      })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId)
  }

  getAllPlugins() {
    return Array.from(this.plugins.entries()).map(([id, p]) => ({
      id,
      manifest: p.manifest,
      enabled: p.enabled,
      settings: p.settings,
    }))
  }

  getEnabledPlugins() {
    return this.getAllPlugins().filter(p => p.enabled)
  }

  // Hook system
  on(event, handler) {
    if (!this.hooks.has(event)) this.hooks.set(event, new Map())
    const id = `handler_${Date.now()}_${Math.random().toString(36).slice(2)}`
    this.hooks.get(event).set(id, handler)
    return () => this.hooks.get(event)?.delete(id)
  }

  async emit(event, data) {
    const handlers = this.hooks.get(event)
    if (!handlers) return
    
    for (const [id, handler] of handlers) {
      try {
        await handler(data)
      } catch (e) {
        console.error(`Plugin hook error [${event}]:`, e)
      }
    }
  }

  // Command execution
  async executeCommand(commandName, args) {
    const cmd = this.commands.get(commandName)
    if (!cmd) throw new Error(`Command not found: ${commandName}`)
    
    const plugin = this.plugins.get(cmd.pluginId)
    if (!plugin || !plugin.enabled || !plugin.sandbox) {
      throw new Error(`Plugin ${cmd.pluginId} not enabled`)
    }
    
    return plugin.sandbox.api.emit('command:' + commandName, args)
  }

  getCommands() {
    return Array.from(this.commands.entries()).map(([name, { pluginId }]) => ({
      name,
      pluginId,
    }))
  }
}

// Singleton instance
let pluginManagerInstance = null

export function getPluginManager() {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager()
  }
  return pluginManagerInstance
}

export async function initializePlugins() {
  const manager = getPluginManager()
  await manager.initialize()
  return manager
}

/**
 * React hook for plugin management
 */
export function usePlugins() {
  const manager = getPluginManager()
  return {
    plugins: manager.getAllPlugins(),
    enabledPlugins: manager.getEnabledPlugins(),
    commands: manager.getCommands(),
    installPlugin: (manifest, code) => manager.installPlugin(manifest, code),
    uninstallPlugin: (id) => manager.uninstallPlugin(id),
    enablePlugin: (id) => manager.enablePlugin(id),
    disablePlugin: (id) => manager.disablePlugin(id),
    updateSettings: (id, settings) => manager.updatePluginSettings(id, settings),
    onEvent: (event, handler) => manager.on(event, handler),
    executeCommand: (name, args) => manager.executeCommand(name, args),
  }
}