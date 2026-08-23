/**
 * Stand-in for the `electron` module under vitest.
 *
 * The real package exports a PATH STRING outside an Electron runtime, so
 * `const { ipcMain } = require('electron')` yields undefined and every
 * main-process module explodes on import. Aliasing the specifier here (see
 * vitest.config.js) is what lets the fs_* handlers, the watcher and the PTY be
 * tested at all — before this they were reachable only through the Electron
 * browser harness, which is how fs_find_files shipped with no handler behind it.
 *
 * Handlers are recorded on globalThis so a test can invoke them directly.
 */
const os = require('os')
const path = require('path')

const handlers = new Map()
globalThis.__IPC_HANDLERS__ = handlers

// One temp root per process, used for app.getPath so nothing writes to a real
// user directory.
const base = path.join(os.tmpdir(), 'yogatik-electron-stub')

module.exports = {
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel),
    on: () => {},
  },
  app: {
    getPath: (name) => path.join(base, name),
    getName: () => 'yogatik-test',
    setAppUserModelId: () => {},
    whenReady: () => Promise.resolve(),
    on: () => {},
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => '', openExternal: async () => {} },
  BrowserWindow: class BrowserWindow {},
  Notification: class Notification { show() {} },
  clipboard: { readText: () => '', writeText: () => {} },
  nativeImage: { createFromDataURL: () => ({}) },
  safeStorage: { isEncryptionAvailable: () => false },
  powerMonitor: { on: () => {}, getSystemIdleTime: () => 0 },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  session: { defaultSession: { webRequest: { onHeadersReceived: () => {}, onBeforeSendHeaders: () => {} } } },
  webUtils: { getPathForFile: () => '' },
}
