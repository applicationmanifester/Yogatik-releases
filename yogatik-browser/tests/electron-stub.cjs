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

module.exports = {
  app,
  BrowserWindow: class BrowserWindow {},
  ipcMain: { on() {}, emit() {}, handle() {} },
  ipcRenderer: {},
  shell: {},
  screen: { getAllDisplays: () => [] },
  session: {},
  __setUserDataDir(p) { userDataDir = p },
  __getUserDataDir() { return userDataDir },
}
