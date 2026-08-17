import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { ptyHost } from './ptyHost';
import { loadConfig, saveConfig, watchConfig, updateProfile, getProfile, resetConfig } from './config';
import type { CoreConfig, TerminalProfile } from './config';
import { detectShell, getShellIntegrationScript } from './shell';
import { sessionRecorder } from './sessionRecorder';
import { pluginManager } from './pluginApi';
import type {
  PtySpawnOptions,
  PtyDataEvent,
  PtyExitEvent,
  PtyErrorEvent,
  TerminalAction,
} from '../shared/types';

let mainWindow: WebContents | null = null;

export function setMainWindow(window: WebContents): void {
  mainWindow = window;
}

export function setupIpc(): void {
  // Config
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:save', (_e, config: CoreConfig) => saveConfig(config));
  ipcMain.handle('config:reset', () => resetConfig());
  ipcMain.handle('config:updateProfile', (_e, profileId: string, updates: Partial<TerminalProfile>) => 
    updateProfile(profileId, updates)
  );
  ipcMain.handle('config:getProfile', (_e, profileId: string) => getProfile(profileId));

  // Shell detection
  ipcMain.handle('shell:detect', async (_e, profileId: string) => {
    const profile = getProfile(profileId);
    return detectShell(profile as TerminalProfile);
  });
  ipcMain.handle('shell:getIntegrationScript', async (_e, profileId: string) => {
    const profile = getProfile(profileId);
    const shell = await detectShell(profile as TerminalProfile);
    return getShellIntegrationScript(shell);
  });

  // PTY Session Management
  ipcMain.handle('pty:spawn', async (_e, options: PtySpawnOptions) => {
    const session = await ptyHost.spawnSession(options);
    return {
      id: session.id,
      profileId: session.profileId,
      cols: session.cols,
      rows: session.rows,
      cwd: session.cwd,
      shell: session.shell,
      state: session.state,
      title: session.title,
    };
  });

  ipcMain.handle('pty:write', (_e, sessionId: string, data: number[]) => {
    const buffer = new Uint8Array(data);
    ptyHost.write(sessionId, buffer);
  });

  ipcMain.handle('pty:resize', (_e, sessionId: string, cols: number, rows: number) => {
    ptyHost.resize(sessionId, cols, rows);
  });

  ipcMain.handle('pty:kill', (_e, sessionId: string, signal?: string) => {
    ptyHost.kill(sessionId, signal);
  });

  ipcMain.handle('pty:getSession', (_e, sessionId: string) => {
    return ptyHost.getSession(sessionId);
  });

  ipcMain.handle('pty:getAllSessions', () => {
    return ptyHost.getAllSessions().map(s => ({
      id: s.id,
      profileId: s.profileId,
      cols: s.cols,
      rows: s.rows,
      cwd: s.cwd,
      shell: s.shell,
      state: s.state,
      exitCode: s.exitCode,
      title: s.title,
      marks: s.marks,
    }));
  });

  // User gesture tracking for OSC 52
  ipcMain.handle('pty:recordGesture', () => {
    ptyHost.recordUserGesture();
  });

  // Session Recording
  ipcMain.handle('recording:start', (_e, sessionId: string) => {
    const session = ptyHost.getSession(sessionId);
    if (!session) return { error: 'Session not found' };
    
    const recordingId = sessionRecorder.startRecording(session);
    return { recordingId };
  });

  ipcMain.handle('recording:stop', (_e, recordingId: string) => {
    const recording = sessionRecorder.stopRecording(recordingId);
    return recording || { error: 'Recording not found' };
  });

  ipcMain.handle('recording:get', (_e, recordingId: string) => {
    return sessionRecorder.getRecording(recordingId);
  });

  ipcMain.handle('recording:list', () => {
    return sessionRecorder.getAllRecordings();
  });

  ipcMain.handle('recording:delete', (_e, recordingId: string) => {
    return { success: sessionRecorder.deleteRecording(recordingId) };
  });

  ipcMain.handle('recording:export', (_e, recordingId: string, format: 'asciicast' | 'json' = 'asciicast') => {
    const recording = sessionRecorder.getRecording(recordingId);
    if (!recording) return { error: 'Recording not found' };
    
    if (format === 'asciicast') {
      return { data: sessionRecorder.exportAsAsciicast(recordingId) };
    }
    return { data: JSON.stringify(recording, null, 2) };
  });

  ipcMain.handle('recording:replay', async (_e, recordingId: string, sessionId: string) => {
    const session = ptyHost.getSession(sessionId);
    const recording = sessionRecorder.getRecording(recordingId);
    if (!session || !recording) return { error: 'Session or recording not found' };

    try {
      await sessionRecorder.replay(recordingId, async (data, delay) => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        session.pty.write(new TextDecoder().decode(data));
      });
      return { success: true };
    } catch (error) {
      return { error: (error as Error).message };
    }
  });

  // Forward PTY events to renderer
  ptyHost.on('data', (event: PtyDataEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:data', {
        sessionId: event.sessionId,
        data: Array.from(event.data),
      });
    }
  });

  ptyHost.on('exit', (event: PtyExitEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:exit', event);
    }
  });

  ptyHost.on('error', (event: PtyErrorEvent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:error', event);
    }
  });

  ptyHost.on('cwd-changed', (event: { sessionId: string; cwd: string }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:cwd-changed', event);
    }
  });

  ptyHost.on('session-created', (session: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:session-created', {
        id: session.id,
        profileId: session.profileId,
        cols: session.cols,
        rows: session.rows,
        cwd: session.cwd,
        shell: session.shell,
        state: session.state,
        title: session.title,
      });
    }
  });

  ptyHost.on('session-destroyed', (sessionId: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('pty:session-destroyed', sessionId);
    }
  });

  // Config hot reload
  watchConfig((config) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('config:changed', config);
    }
  });

  // Graphics protocol events
  ptyHost.on('graphics:kitty', (event: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('graphics:kitty', event);
    }
  });

  ptyHost.on('graphics:sixel', (event: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('graphics:sixel', event);
    }
  });

  ptyHost.on('graphics:iterm2', (event: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.send('graphics:iterm2', event);
    }
  });

  // Plugin API
  ipcMain.handle('plugin:load', async (_e, pluginPath: string) => {
    return pluginManager.loadPlugin(pluginPath);
  });

  ipcMain.handle('plugin:unload', async (_e, pluginId: string) => {
    await pluginManager.unloadPlugin(pluginId);
    return { success: true };
  });

  ipcMain.handle('plugin:list', () => {
    return pluginManager.getAllPlugins().map(p => ({
      pluginId: p.pluginId,
      manifest: p.manifest,
      config: p.config,
    }));
  });

  ipcMain.handle('plugin:get', (_e, pluginId: string) => {
    const plugin = pluginManager.getPlugin(pluginId);
    if (!plugin) return null;
    return {
      pluginId: plugin.pluginId,
      manifest: plugin.manifest,
      config: plugin.config,
    };
  });

  // Load all plugins on startup
  pluginManager.loadAllPlugins().catch(console.error);

  // Forward terminal events to plugins
  ptyHost.on('data', (event: any) => {
    pluginManager.onTerminalData(event.sessionId, new Uint8Array(event.data));
  });

  ptyHost.on('session-created', (session: any) => {
    pluginManager.onTerminalCreated(session.id);
  });

  ptyHost.on('session-destroyed', (sessionId: string) => {
    pluginManager.onTerminalDestroyed(sessionId);
  });
}

export function sendToRenderer(channel: string, ...args: any[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.send(channel, ...args);
  }
}