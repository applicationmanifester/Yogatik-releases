import { app, BrowserWindow, ipcMain, shell, nativeTheme } from 'electron';
import * as path from 'path';
import { setupIpc, setMainWindow } from './ipc';
import { ptyHost } from './ptyHost';
import { loadConfig, getProfile } from './config';
import { loadSessionState, saveSessionState, createSessionFromPersisted, clearSessionState } from './sessionPersistence';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  const config = loadConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Yogatik Terminal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    backgroundColor: config.profiles.default.theme.background,
  });

  setMainWindow(mainWindow.webContents);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  createWindow();

  // Restore session after window is ready
  if (mainWindow) {
    await restoreSession();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

async function restoreSession(): Promise<void> {
  const config = loadConfig();
  const persisted = loadSessionState();
  
  if (!persisted || !config.startupMode || config.startupMode === 'new') {
    if (persisted && config.startupMode !== 'restore') {
      clearSessionState();
    }
    return;
  }

  // Send session restore request to renderer
  if (mainWindow) {
    mainWindow.webContents.send('session:restore', persisted);
  }
}

// Save session state on quit
app.on('before-quit', () => {
  // The renderer will send the current state before quit
  // We'll handle it via IPC
});

app.on('window-all-closed', () => {
  ptyHost.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_e, contents) => {
  (contents as any).on('new-window', (e: any, url: string) => {
    e.preventDefault();
    shell.openExternal(url);
  });
});

// Handle theme changes
nativeTheme.on('updated', () => {
  if (mainWindow) {
    const config = loadConfig();
    mainWindow.webContents.send('theme:system-changed', nativeTheme.shouldUseDarkColors);
  }
});

// IPC for session persistence
ipcMain.handle('session:save', (_e, state: any) => {
  saveSessionState(state);
});

ipcMain.handle('session:load', () => {
  return loadSessionState();
});

ipcMain.handle('session:clear', () => {
  clearSessionState();
});

// Handle session restore from renderer
ipcMain.on('session:restore-request', async (_e, persisted: any) => {
  const config = loadConfig();
  
  for (const tab of persisted.tabs) {
    const profile = getProfile(tab.sessionId.split('_')[0] || 'default');
    if (!profile) continue;

    try {
      const session = await ptyHost.spawnSession({
        profileId: tab.sessionId.split('_')[0] || 'default',
        cols: profile.cols || 120,
        rows: profile.rows || 32,
        cwd: profile.cwd === 'home' ? 'home' : profile.cwd === 'project' ? 'project' : profile.cwd,
        env: profile.env,
        shell: profile.shell === 'auto' ? 'auto' : profile.shell.path,
        args: profile.shell === 'auto' ? [] : profile.shell.args,
      });

      // Notify renderer of restored session
      if (mainWindow) {
        mainWindow.webContents.send('pty:session-restored', {
          tab,
          sessionId: session.id,
        });
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
    }
  }
});