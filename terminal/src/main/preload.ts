import { contextBridge, ipcRenderer } from 'electron';
import type {
  CoreConfig,
  TerminalProfile,
  TerminalSession,
  TerminalAction,
  PtySpawnOptions,
  PtyDataEvent,
  PtyExitEvent,
  PtyErrorEvent,
  TabState,
  SplitPane,
  SessionRecording,
} from '../shared/types';

// Type-safe API exposure
const terminalAPI = {
  // Config
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: CoreConfig) => ipcRenderer.invoke('config:save', config),
    reset: () => ipcRenderer.invoke('config:reset'),
    updateProfile: (profileId: string, updates: Partial<TerminalProfile>) =>
      ipcRenderer.invoke('config:updateProfile', profileId, updates),
    getProfile: (profileId: string) => ipcRenderer.invoke('config:getProfile', profileId),
    onChanged: (callback: (config: CoreConfig) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, config: CoreConfig) => callback(config);
      ipcRenderer.on('config:changed', handler);
      return () => ipcRenderer.off('config:changed', handler);
    },
  },

  // Shell
  shell: {
    detect: (profileId: string) => ipcRenderer.invoke('shell:detect', profileId),
    getIntegrationScript: (profileId: string) => ipcRenderer.invoke('shell:getIntegrationScript', profileId),
  },

  // PTY
  pty: {
    spawn: (options: PtySpawnOptions) => ipcRenderer.invoke('pty:spawn', options),
    write: (sessionId: string, data: Uint8Array) =>
      ipcRenderer.invoke('pty:write', sessionId, Array.from(data)),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
    kill: (sessionId: string, signal?: string) =>
      ipcRenderer.invoke('pty:kill', sessionId, signal),
    getSession: (sessionId: string) => ipcRenderer.invoke('pty:getSession', sessionId),
    getAllSessions: () => ipcRenderer.invoke('pty:getAllSessions'),
    recordGesture: () => ipcRenderer.invoke('pty:recordGesture'),
    onData: (callback: (event: PtyDataEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: PtyDataEvent) => callback(event);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.off('pty:data', handler);
    },
    onExit: (callback: (event: PtyExitEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: PtyExitEvent) => callback(event);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.off('pty:exit', handler);
    },
    onError: (callback: (event: PtyErrorEvent) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: PtyErrorEvent) => callback(event);
      ipcRenderer.on('pty:error', handler);
      return () => ipcRenderer.off('pty:error', handler);
    },
    onCwdChanged: (callback: (event: { sessionId: string; cwd: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: { sessionId: string; cwd: string }) => callback(event);
      ipcRenderer.on('pty:cwd-changed', handler);
      return () => ipcRenderer.off('pty:cwd-changed', handler);
    },
    onSessionCreated: (callback: (session: TerminalSession) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, session: TerminalSession) => callback(session);
      ipcRenderer.on('pty:session-created', handler);
      return () => ipcRenderer.off('pty:session-created', handler);
    },
    onSessionDestroyed: (callback: (sessionId: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId);
      ipcRenderer.on('pty:session-destroyed', handler);
      return () => ipcRenderer.off('pty:session-destroyed', handler);
    },
    onSessionRestored: (callback: (data: { tab: TabState; sessionId: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { tab: TabState; sessionId: string }) => callback(data);
      ipcRenderer.on('pty:session-restored', handler);
      return () => ipcRenderer.off('pty:session-restored', handler);
    },
  },

  // Session Persistence
  session: {
    save: (state: { tabs: TabState[]; splitPanes: SplitPane[]; activeTabId: string | null }) =>
      ipcRenderer.invoke('session:save', state),
    load: () => ipcRenderer.invoke('session:load'),
    clear: () => ipcRenderer.invoke('session:clear'),
    requestRestore: (persisted: any) => ipcRenderer.send('session:restore-request', persisted),
  },

  // Session Recording
  recording: {
    start: (sessionId: string) => ipcRenderer.invoke('recording:start', sessionId),
    stop: (recordingId: string) => ipcRenderer.invoke('recording:stop', recordingId),
    get: (recordingId: string) => ipcRenderer.invoke('recording:get', recordingId),
    list: () => ipcRenderer.invoke('recording:list'),
    delete: (recordingId: string) => ipcRenderer.invoke('recording:delete', recordingId),
    export: (recordingId: string, format?: 'asciicast' | 'json') => ipcRenderer.invoke('recording:export', recordingId, format),
    replay: (recordingId: string, sessionId: string) => ipcRenderer.invoke('recording:replay', recordingId, sessionId),
  },

  // Graphics Protocol
  graphics: {
    onKittyImage: (callback: (event: { sessionId: string; id: number; data: string; width?: number; height?: number; cells?: { w: number; h: number }; pixels?: { w: number; h: number }; placement?: { x: number; y: number }; zIndex?: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: any) => callback(event);
      ipcRenderer.on('graphics:kitty', handler);
      return () => ipcRenderer.off('graphics:kitty', handler);
    },
    onSixelImage: (callback: (event: { sessionId: string; data: string; width: number; height: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: any) => callback(event);
      ipcRenderer.on('graphics:sixel', handler);
      return () => ipcRenderer.off('graphics:sixel', handler);
    },
    onIterm2Image: (callback: (event: { sessionId: string; data: string; width: number; height: number; name?: string; size?: number; preserveAspectRatio?: boolean }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, event: any) => callback(event);
      ipcRenderer.on('graphics:iterm2', handler);
      return () => ipcRenderer.off('graphics:iterm2', handler);
    },
  },

  // Plugin API
  plugin: {
    load: (pluginPath: string) => ipcRenderer.invoke('plugin:load', pluginPath),
    unload: (pluginId: string) => ipcRenderer.invoke('plugin:unload', pluginId),
    list: () => ipcRenderer.invoke('plugin:list'),
    get: (pluginId: string) => ipcRenderer.invoke('plugin:get', pluginId),
  },

  // Theme
  theme: {
    onSystemChanged: (callback: (isDark: boolean) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark);
      ipcRenderer.on('theme:system-changed', handler);
      return () => ipcRenderer.off('theme:system-changed', handler);
    },
  },
};

contextBridge.exposeInMainWorld('terminalAPI', terminalAPI);

// Type declarations for the exposed API
declare global {
  interface Window {
    terminalAPI: typeof terminalAPI;
  }
}