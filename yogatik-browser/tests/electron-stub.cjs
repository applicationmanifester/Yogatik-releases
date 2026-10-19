'use strict'
// Minimal Electron main-process stub so main-process modules like
// settings/store.cjs can be unit-tested with plain `node` outside Electron.

const os = require('os')
const path = require('path')

let userDataDir =
  process.env.YOGATIK_TEST_USERDATA ||
  path.join(os.tmpdir(), 'yogatik-browser-test-userdata')

const app = {
  isPackaged: false,
  getPath(name) {
    if (name === 'userData' || name === 'appData') return userDataDir
    throw new Error('[electron-stub] getPath not stubbed for: ' + name)
  },
  setName() {},
  setAppUserModelId() {},
  setPath() {},
  whenReady() { return Promise.resolve() },
  on() {},
  requestSingleInstanceLock() { return true },
  quit() {},
  commandLine: { appendSwitch() {} },
  userAgentFallback: '',
}

// Shared IPC registry — invoke() resolves against the handlers registered via
// ipcMain.handle(), so preload bridges and bounded dispatchers can be tested
// end-to-end without Electron.
const ipcHandlers = new Map()
const ipcMain = {
  on() {},
  emit() {},
  handle(channel, fn) { ipcHandlers.set(channel, fn) },
}
// Persistent sender identity so sender-bound handlers can be tested with the
// SAME object identity semantics Electron uses (chrome webContents === sender).
const rendererSender = { id: 'renderer-stub' }
const ipcRenderer = {
  async invoke(channel, ...args) {
    const handler = ipcHandlers.get(channel)
    if (!handler) return { success: false, error: 'no handler registered for ' + channel }
    return handler({ sender: rendererSender }, ...args)
  },
}

// contextBridge capture — the exposed callbacks land in this map so tests can
// call the REAL preload code paths.
const exposed = {}
const contextBridge = {
  exposeInMainWorld(key, fn) { exposed[key] = fn },
}

// Notification recorder with the isSupported() capability check the real API
// exposes on every supported platform.
const notifications = []
class Notification {
  constructor(options) {
    this.options = options
    this.shown = false
    notifications.push(this)
  }
  show() { this.shown = true }
  static isSupported() { return true }
}

module.exports = {
  app,
  BrowserWindow: class BrowserWindow {},
  ipcMain,
  ipcRenderer,
  contextBridge,
  exposed,
  Notification,
  __notifications: notifications,
  __rendererSender: rendererSender,
  shell: {},
  screen: { getAllDisplays: () => [] },
  session: {},
  __setUserDataDir(p) { userDataDir = p },
  __getUserDataDir() { return userDataDir },
}
