// Native file dialogs — the browser can only show an opaque <input type=file>
// that yields File blobs with no real path. These return actual OS paths so the
// user/AI can pick arbitrary files to read or a location to save to.
//
// Renderer bridge: window.__YOGATIK_DIALOG__.{openFile,openFiles,saveFile,pickFolder,readPicked}

const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const READ_CAP = 2 * 1024 * 1024 // 2MB cap for one-shot reads via the picker

function toFilters(filters) {
  if (!Array.isArray(filters) || !filters.length) return undefined
  return filters
    .filter(f => f && f.name && Array.isArray(f.extensions))
    .map(f => ({ name: f.name, extensions: f.extensions }))
}

function registerDialogs(getWindow) {
  const parent = () => getWindow?.() || BrowserWindow.getFocusedWindow() || undefined

  ipcMain.handle('dialog:open-file', async (_e, { title, filters } = {}) => {
    const r = await dialog.showOpenDialog(parent(), {
      title: title || 'Open file', properties: ['openFile'], filters: toFilters(filters),
    })
    if (r.canceled || !r.filePaths.length) return { success: false, canceled: true }
    return { success: true, path: r.filePaths[0] }
  })

  ipcMain.handle('dialog:open-files', async (_e, { title, filters } = {}) => {
    const r = await dialog.showOpenDialog(parent(), {
      title: title || 'Open files', properties: ['openFile', 'multiSelections'], filters: toFilters(filters),
    })
    if (r.canceled || !r.filePaths.length) return { success: false, canceled: true }
    return { success: true, paths: r.filePaths }
  })

  ipcMain.handle('dialog:pick-folder', async (_e, { title } = {}) => {
    const r = await dialog.showOpenDialog(parent(), {
      title: title || 'Choose folder', properties: ['openDirectory'],
    })
    if (r.canceled || !r.filePaths.length) return { success: false, canceled: true }
    return { success: true, path: r.filePaths[0] }
  })

  ipcMain.handle('dialog:save-file', async (_e, { title, defaultName, content, filters } = {}) => {
    const r = await dialog.showSaveDialog(parent(), {
      title: title || 'Save file', defaultPath: defaultName || undefined, filters: toFilters(filters),
    })
    if (r.canceled || !r.filePath) return { success: false, canceled: true }
    try {
      if (typeof content === 'string') fs.writeFileSync(r.filePath, content, 'utf8')
      return { success: true, path: r.filePath, bytes: content ? Buffer.byteLength(content, 'utf8') : 0 }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Read a file the user explicitly picked (path came from a dialog above).
  ipcMain.handle('dialog:read-picked', async (_e, filePath) => {
    if (typeof filePath !== 'string' || !filePath) return { success: false, error: 'path required' }
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > READ_CAP) return { success: false, error: `File too large (${stat.size} bytes, cap ${READ_CAP})` }
      const content = fs.readFileSync(filePath, 'utf8')
      return { success: true, path: filePath, name: path.basename(filePath), bytes: stat.size, content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerDialogs }
