"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// apps/desktop-electron/src/main/main.ts
const electron_1 = require("electron");
const path_1 = require("path");
const env_js_1 = require("./utils/env.js");
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: (0, path_1.join)(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false,
    });
    if (env_js_1.isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// IPC handlers
electron_1.ipcMain.handle('app:getVersion', () => electron_1.app.getVersion());
electron_1.ipcMain.handle('app:getPlatform', () => process.platform);
// Example: Native file dialog
electron_1.ipcMain.handle('dialog:openFile', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.filePaths;
});
//# sourceMappingURL=main.js.map