// apps/desktop-electron/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Dialogs
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Window controls (if needed)
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Event listeners
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu:action', (_event, action) => callback(action));
    return () => ipcRenderer.removeAllListeners('menu:action');
  },
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      openFile: () => Promise<string[]>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onMenuAction: (callback: (action: string) => void) => () => void;
    };
  }
}