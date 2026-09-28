/**
 * Yogatik TUI — Terminal User Interface for OpenCode-like experience
 * Runs inside the terminal using blessed, reusing the existing agent loop
 */

const blessed = require('blessed')
const { spawn } = require('child_process')
const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('path')

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// Disable GPU for TUI mode
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('headless', 'new')

let screen = null
let messagesBox = null
let inputBox = null
let statusBar = null
let currentConversationId = null
let isStreaming = false
let streamingContent = ''

function createTUI() {
  screen = blessed.screen({
    smartCSR: true,
    title: 'Yogatik TUI',
    dockBorders: true,
    fullUnicode: true,
    autoPadding: true,
  })

  // Messages area (scrollable)
  messagesBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: '100%-3',
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      track: { bg: 'cyan' },
      style: { bg: 'blue' }
    },
    style: {
      border: { fg: 'cyan' },
      fg: 'white',
      bg: 'black'
    },
    tags: true,
    keys: true,
    vi: true,
    mouse: true
  })

  // Input area
  inputBox = blessed.textbox({
    parent: screen,
    bottom: 1,
    left: 0,
    right: 0,
    height: 3,
    border: { type: 'line' },
    style: {
      border: { fg: 'green' },
      fg: 'white',
      bg: 'black'
    },
    keys: true,
    vi: true,
    mouse: true,
    inputOnFocus: true,
    placeholder: 'Type your message... (Ctrl+Enter to send, Esc to cancel)'
  })

  // Status bar
  statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    style: { bg: 'blue', fg: 'white', bold: true },
    content: ' Yogatik TUI | Ctrl+Enter: Send | Ctrl+C: Quit | /help: Commands '
  })

  // Key bindings
  screen.key(['C-c', 'q'], () => {
    cleanup()
    process.exit(0)
  })

  inputBox.key(['C-enter'], () => {
    const text = inputBox.getValue().trim()
    if (text) {
      inputBox.clearValue()
      screen.render()
      sendMessage(text)
    }
  })

  inputBox.key(['escape'], () => {
    inputBox.clearValue()
    screen.render()
  })

  // Focus input by default
  inputBox.focus()
  screen.render()

  return screen
}

function appendMessage(role, content, isStreaming = false) {
  const timestamp = new Date().toLocaleTimeString()
  const prefix = role === 'user' ? '{green-fg}You{/green-fg}' : '{cyan-fg}Yogatik{/cyan-fg}'
  const marker = isStreaming ? '{yellow-fg}▌{/yellow-fg}' : ''
  
  const existing = messagesBox.getContent()
  const newContent = `${existing}${existing ? '\n\n' : ''}{bold}${prefix} {gray-fg}(${timestamp}){/gray-fg}{/bold}\n${content}${marker}`
  
  messagesBox.setContent(newContent)
  messagesBox.setScrollPerc(100)
  screen.render()
}

function updateStreamingMessage(content) {
  streamingContent = content
  const existing = messagesBox.getContent()
  // Replace last assistant message
  const lines = existing.split('\n')
  // Find last assistant message start
  let lastAssistantIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('Yogatik')) {
      lastAssistantIdx = i
      break
    }
  }
  if (lastAssistantIdx >= 0) {
    const before = lines.slice(0, lastAssistantIdx).join('\n')
    const header = lines[lastAssistantIdx]
    messagesBox.setContent(`${before}\n\n${header}\n${content}{yellow-fg}▌{/yellow-fg}`)
  } else {
    appendMessage('assistant', content, true)
  }
  messagesBox.setScrollPerc(100)
  screen.render()
}

async function sendMessage(text) {
  if (isStreaming) return
  
  appendMessage('user', text)
  isStreaming = true
  streamingContent = ''
  
  // Send to main process via IPC
  // We'll use a hidden BrowserWindow to access the renderer's sendRef
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  try {
    if (process.env.NODE_ENV === 'development') {
      await win.loadURL('http://localhost:5173')
    } else {
      await win.loadFile(path.join(__dirname, '..', 'dist-electron', 'index.html'))
    }

    // Wait for load then send prompt
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
    
    // Use the existing yogatik:submit-prompt event
    win.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('yogatik:submit-prompt', {
        detail: { prompt: ${JSON.stringify(text)} }
      }))
    `)

    // Listen for streaming updates from renderer
    ipcMain.on('tui:stream-token', (_, token) => {
      streamingContent += token
      updateStreamingMessage(streamingContent)
    })

    ipcMain.once('tui:stream-done', (_, fullContent) => {
      isStreaming = false
      streamingContent = fullContent
      updateStreamingMessage(fullContent)
      win.close()
    })

    ipcMain.once('tui:stream-error', (_, error) => {
      isStreaming = false
      appendMessage('system', `{red-fg}Error: ${error}{/red-fg}`)
      win.close()
    })

  } catch (err) {
    isStreaming = false
    appendMessage('system', `{red-fg}Error: ${err.message}{/red-fg}`)
    win.close()
  }
}

function cleanup() {
  if (screen) {
    screen.destroy()
  }
}

// IPC handlers for renderer to send streaming updates
ipcMain.on('tui:register', (event) => {
  // Renderer registers itself for TUI streaming
  event.sender.on('tui-stream-token', (_, token) => {
    // Forward to TUI
  })
})

// Main entry
app.whenReady().then(() => {
  createTUI()
  
  // Show welcome
  appendMessage('system', '{bold}Yogatik TUI{/bold} — OpenCode-compatible coding agent\nType your task and press Ctrl+Enter to send.')
  appendMessage('system', '{gray-fg}Commands: /help, /model <name>, /tools, /clear, /exit{/gray-fg}')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})