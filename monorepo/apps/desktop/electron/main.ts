import { app, BrowserWindow, ipcMain, Menu, Tray, shell, nativeImage } from "electron";
import { autoUpdater } from "electron-updater";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/** Single-instance lock: focus the existing window instead of opening a second. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // security: renderer cannot touch Node
      nodeIntegration: false, // security: no Node in the renderer
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Open external links in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: "New Note", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("menu", "new-note") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Help",
      submenu: [{ label: "Check for Updates…", click: () => void autoUpdater.checkForUpdatesAndNotify() }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  // A real app ships an icon; use an empty image so this runs without an asset.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Acme");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => mainWindow?.show() },
      { role: "quit" },
    ]),
  );
}

// ── Secure IPC: renderer → main, all through named, validated channels ──
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("dialog:openExternal", (_e, url: string) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) return shell.openExternal(url);
  throw new Error("Blocked non-http(s) URL");
});

// Deep linking (acme://…) + file associations are registered in electron-builder.yml.
app.setAsDefaultProtocolClient("acme");
app.on("open-url", (_e, url) => mainWindow?.webContents.send("deep-link", url));

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  createTray();
  if (!isDev) void autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
