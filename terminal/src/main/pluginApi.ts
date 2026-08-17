import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  api_version: number;
  permissions: PluginPermission[];
  entry_points: PluginEntryPoints;
  config_schema?: Record<string, any>;
}

export type PluginPermission = 
  | 'terminal.read'
  | 'terminal.write'
  | 'settings.read'
  | 'settings.write'
  | 'fs.read'
  | 'fs.write'
  | 'network.fetch'
  | 'crypto.hash';

export interface PluginEntryPoints {
  on_load?: string;
  on_unload?: string;
  command?: string;
  keybinding?: string;
  terminal_data?: string;
  terminal_created?: string;
  terminal_destroyed?: string;
}

export interface PluginContext {
  pluginId: string;
  manifest: PluginManifest;
  module: any; // WebAssembly.Module | JS module
  instance: any; // WebAssembly.Instance | JS module instance
  exports: PluginExports;
  config: Record<string, any>;
}

export interface PluginExports {
  on_load?: (context: PluginRuntimeContext) => void | Promise<void>;
  on_unload?: (context: PluginRuntimeContext) => void | Promise<void>;
  command?: (args: string[], context: PluginRuntimeContext) => Promise<void>;
  keybinding?: (key: string, context: PluginRuntimeContext) => void;
  terminal_data?: (sessionId: string, data: Uint8Array, context: PluginRuntimeContext) => void;
  terminal_created?: (sessionId: string, context: PluginRuntimeContext) => void;
  terminal_destroyed?: (sessionId: string, context: PluginRuntimeContext) => void;
}

export interface PluginRuntimeContext {
  terminal: TerminalAPI;
  settings: SettingsAPI;
  fs: FsAPI;
  http: HttpAPI;
  crypto: CryptoAPI;
  utils: UtilsAPI;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface TerminalAPI {
  getActiveSession(): Promise<string | null>;
  getAllSessions(): Promise<string[]>;
  write(sessionId: string, data: Uint8Array): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  onData(callback: (sessionId: string, data: Uint8Array) => void): () => void;
  onExit(callback: (sessionId: string, exitCode: number) => void): () => void;
}

export interface SettingsAPI {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  onChange(key: string, callback: (value: any) => void): () => void;
}

export interface FsAPI {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
}

export interface HttpAPI {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

export interface CryptoAPI {
  hash(algorithm: string, data: string | Uint8Array): Promise<string>;
  randomBytes(length: number): Promise<Uint8Array>;
}

export interface UtilsAPI {
  generateId(): string;
  sleep(ms: number): Promise<void>;
}

class PluginManager extends EventEmitter {
  private plugins: Map<string, PluginContext> = new Map();
  private pluginDir: string;

  constructor() {
    super();
    this.pluginDir = path.join(app.getPath('userData'), 'plugins');
    this.ensurePluginDir();
  }

  private ensurePluginDir(): void {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  async loadPlugin(pluginPath: string): Promise<PluginContext | null> {
    try {
      const manifestPath = path.join(pluginPath, 'plugin.toml');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('plugin.toml not found');
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = this.parseManifest(manifestContent);

      // Load module (WASM or JS)
      const modulePath = path.join(pluginPath, manifest.main);
      if (!fs.existsSync(modulePath)) {
        throw new Error(`Module file not found: ${manifest.main}`);
      }

      let module: any;
      let instance: any;
      let exports: PluginExports;

      if (modulePath.endsWith('.wasm')) {
        // Load WASM module
        const wasmBytes = fs.readFileSync(modulePath);
        const wasmModule = await (globalThis as any).WebAssembly.compile(wasmBytes);
        const imports = this.createImports(manifest.name);
        const wasmInstance = await (globalThis as any).WebAssembly.instantiate(wasmModule, imports);
        
        module = wasmModule;
        instance = wasmInstance;
        exports = wasmInstance.exports as unknown as PluginExports;
      } else if (modulePath.endsWith('.js')) {
        // Load JS module
        const moduleExports = await import(modulePath);
        module = moduleExports;
        instance = moduleExports;
        exports = moduleExports.default || moduleExports;
      } else {
        throw new Error('Unsupported module type. Use .wasm or .js');
      }

      const context: PluginContext = {
        pluginId: manifest.name,
        manifest,
        module,
        instance,
        exports,
        config: {},
      };

      this.plugins.set(manifest.name, context);

      // Call on_load if present
      if (exports.on_load) {
        const runtimeContext = this.createRuntimeContext(manifest.name);
        await exports.on_load(runtimeContext);
      }

      this.emit('plugin-loaded', { pluginId: manifest.name, manifest });
      return context;
    } catch (error) {
      console.error(`Failed to load plugin ${pluginPath}:`, error);
      this.emit('plugin-error', { pluginPath, error: (error as Error).message });
      return null;
    }
  }

  private parseManifest(content: string): PluginManifest {
    // Simplified TOML parsing
    const manifest: Partial<PluginManifest> = {
      name: '',
      version: '',
      description: '',
      main: '',
      api_version: 1,
      permissions: [],
      entry_points: {},
    };
    
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      if (!key) continue;
      
      const value = valueParts.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      const k = key.trim();
      
      switch (k) {
        case 'name': manifest.name = value; break;
        case 'version': manifest.version = value; break;
        case 'description': manifest.description = value; break;
        case 'main': manifest.main = value; break;
        case 'api_version': manifest.api_version = parseInt(value, 10); break;
        case 'permissions': 
          manifest.permissions = value.replace(/[\[\]"']/g, '').split(',').map(s => s.trim()).filter(Boolean) as PluginPermission[];
          break;
        case 'entry_points':
          manifest.entry_points = this.parseEntryPoints(value);
          break;
      }
    }

    return manifest as PluginManifest;
  }

  private parseEntryPoints(value: string): PluginEntryPoints {
    // Parse entry_points object
    const entryPoints: PluginEntryPoints = {};
    // Simplified parsing
    return entryPoints;
  }

  private createImports(pluginName: string): any {
    const context = this.createRuntimeContext(pluginName);
    
    return {
      env: {
        memory: new (globalThis as any).WebAssembly.Memory({ initial: 10, maximum: 100 }),
        
        log_info: (ptr: number, len: number) => {
          const memory = this.plugins.get(pluginName)?.instance?.exports?.memory;
          if (memory) {
            const bytes = new Uint8Array(memory.buffer, ptr, len);
            const text = new TextDecoder().decode(bytes);
            console.log(`[${pluginName}] ${text}`);
          }
        },
      },
    };
  }

  private createRuntimeContext(pluginId: string): PluginRuntimeContext {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not loaded`);

    return {
      terminal: {
        getActiveSession: async () => null,
        getAllSessions: async () => [],
        write: async () => {},
        resize: async () => {},
        onData: () => () => {},
        onExit: () => () => {},
      },
      settings: {
        get: async () => {},
        set: async () => {},
        onChange: () => () => {},
      },
      fs: {
        readFile: async () => '',
        writeFile: async () => {},
        exists: async () => false,
        listDir: async () => [],
      },
      http: {
        fetch: async () => new Response(),
      },
      crypto: {
        hash: async () => '',
        randomBytes: async () => new Uint8Array(),
      },
      utils: {
        generateId: () => Math.random().toString(36).slice(2),
        sleep: (ms: number) => new Promise(r => setTimeout(r, ms)),
      },
      log: (level, message) => console.log(`[${pluginId}] ${level}: ${message}`),
    };
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.exports.on_unload) {
      const runtimeContext = this.createRuntimeContext(pluginId);
      await plugin.exports.on_unload(runtimeContext);
    }

    this.plugins.delete(pluginId);
    this.emit('plugin-unloaded', { pluginId });
  }

  async loadAllPlugins(): Promise<void> {
    if (!fs.existsSync(this.pluginDir)) return;

    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginDir, entry.name);
        await this.loadPlugin(pluginPath);
      }
    }
  }

  getPlugin(pluginId: string): PluginContext | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): PluginContext[] {
    return Array.from(this.plugins.values());
  }

  onTerminalData(sessionId: string, data: Uint8Array): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.exports.terminal_data) {
        const runtimeContext = this.createRuntimeContext(plugin.pluginId);
        plugin.exports.terminal_data(sessionId, data, runtimeContext);
      }
    }
  }

  onTerminalCreated(sessionId: string): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.exports.terminal_created) {
        const runtimeContext = this.createRuntimeContext(plugin.pluginId);
        plugin.exports.terminal_created(sessionId, runtimeContext);
      }
    }
  }

  onTerminalDestroyed(sessionId: string): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.exports.terminal_destroyed) {
        const runtimeContext = this.createRuntimeContext(plugin.pluginId);
        plugin.exports.terminal_destroyed(sessionId, runtimeContext);
      }
    }
  }
}

export const pluginManager = new PluginManager();