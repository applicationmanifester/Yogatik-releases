import { ipcMain, BrowserWindow } from 'electron'
import { spawnSafe, ProcOptions, ProcResult } from './utils'
import { procRateLimiter } from './utils'
import { bgProcesses, startProcess, killProcess, listProcesses, getProcess, subscribeToOutput, unsubscribeFromOutput, type BgProcess } from './bgProcesses'

// ============================================================================
// Types
// ============================================================================

export interface StartProcRequest {
  command: string
  args?: string[]
  options?: ProcOptions
  name?: string
  autoRestart?: boolean
  env?: Record<string, string>
}

export interface StartProcResponse {
  pid: number
  name: string
  command: string
  args: string[]
}

export interface ProcOutputEvent {
  pid: number
  stream: 'stdout' | 'stderr'
  data: string
}

export interface ProcExitEvent {
  pid: number
  exitCode: number | null
  signal: string | null
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerProcBridge(): void {
  // ---- Spawn a one-shot command (non-background) ----
  ipcMain.handle('proc:spawn', async (_event, request: StartProcRequest): Promise<ProcResult> => {
    if (!procRateLimiter.tryConsume('proc:spawn')) {
      throw new Error('Rate limit exceeded for proc:spawn')
    }
    
    const { command, args = [], options = {} } = request
    return spawnSafe(command, args, options)
  })

  // ---- Start a managed background process ----
  ipcMain.handle('proc:start', async (_event, request: StartProcRequest): Promise<StartProcResponse> => {
    if (!procRateLimiter.tryConsume('proc:start')) {
      throw new Error('Rate limit exceeded for proc:start')
    }
    
    const { command, args = [], options = {}, name, autoRestart = false, env } = request
    const proc = startProcess(command, args, {
      ...options,
      env: { ...options.env, ...env },
      name,
      autoRestart
    })
    
    return {
      pid: proc.pid,
      name: proc.name,
      command: proc.command,
      args: proc.args
    }
  })

  // ---- Kill a background process ----
  ipcMain.handle('proc:kill', async (_event, pid: number, signal?: string): Promise<boolean> => {
    if (!procRateLimiter.tryConsume('proc:kill')) {
      throw new Error('Rate limit exceeded for proc:kill')
    }
    return killProcess(pid, signal)
  })

  // ---- Kill all background processes ----
  ipcMain.handle('proc:killAll', async (): Promise<number> => {
    if (!procRateLimiter.tryConsume('proc:killAll')) {
      throw new Error('Rate limit exceeded for proc:killAll')
    }
    let count = 0
    for (const proc of bgProcesses.values()) {
      if (killProcess(proc.pid)) count++
    }
    return count
  })

  // ---- List all background processes ----
  ipcMain.handle('proc:list', async (): Promise<BgProcess[]> => {
    return listProcesses()
  })

  // ---- Get a single background process ----
  ipcMain.handle('proc:get', async (_event, pid: number): Promise<BgProcess | null> => {
    return getProcess(pid)
  })

  // ---- Get recent output for a process ----
  ipcMain.handle('proc:output', async (_event, pid: number, lines = 200): Promise<string> => {
    const proc = getProcess(pid)
    if (!proc) throw new Error(`Process ${pid} not found`)
    return proc.outputBuffer.toString().split('\n').slice(-lines).join('\n')
  })

  // ---- Subscribe to live output (renderer -> main) ----
  ipcMain.on('proc:subscribe', (_event, pid: number) => {
    const proc = getProcess(pid)
    if (!proc) return
    
    const webContents = _event.sender
    const handler = (data: ProcOutputEvent) => {
      if (data.pid === pid) {
        webContents.send('proc:output', data)
      }
    }
    
    subscribeToOutput(pid, handler)
    
    // Cleanup on renderer disconnect
    webContents.once('destroyed', () => {
      unsubscribeFromOutput(pid, handler)
    })
  })

  // ---- Unsubscribe from live output ----
  ipcMain.on('proc:unsubscribe', (_event, pid: number) => {
    // Handled via destroyed event above, but allow explicit
  })

  // ---- Restart a background process ----
  ipcMain.handle('proc:restart', async (_event, pid: number): Promise<StartProcResponse | null> => {
    if (!procRateLimiter.tryConsume('proc:restart')) {
      throw new Error('Rate limit exceeded for proc:restart')
    }
    
    const proc = getProcess(pid)
    if (!proc) return null
    
    const { command, args, options, name, autoRestart } = proc
    killProcess(pid)
    
    const newProc = startProcess(command, args, { ...options, name, autoRestart })
    return {
      pid: newProc.pid,
      name: newProc.name,
      command: newProc.command,
      args: newProc.args
    }
  })

  // ---- Send stdin to a background process ----
  ipcMain.handle('proc:stdin', async (_event, pid: number, data: string): Promise<boolean> => {
    const proc = getProcess(pid)
    if (!proc || !proc.child.stdin?.writable) return false
    
    try {
      proc.child.stdin.write(data)
      return true
    } catch {
      return false
    }
  })

  // ---- Get process tree (children) ----
  ipcMain.handle('proc:tree', async (_event, pid: number): Promise<any> => {
    const proc = getProcess(pid)
    if (!proc) return null
    
    // On Windows, use tasklist; on Unix, use ps
    const isWin = process.platform === 'win32'
    const { stdout } = await spawnSafe(
      isWin ? 'tasklist' : 'ps',
      isWin ? ['/FI', `PID eq ${pid}`, '/FO', 'CSV'] : ['-o', 'pid,ppid,command', '-p', String(pid)],
      { timeout: 5000 }
    )
    
    return { pid, stdout }
  })
}

// ============================================================================
// Event Forwarding (called from bgProcesses when process emits output/exit)
// ============================================================================

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function forwardProcOutput(pid: number, stream: 'stdout' | 'stderr', data: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('proc:output', { pid, stream, data })
}

export function forwardProcExit(pid: number, exitCode: number | null, signal: string | null): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('proc:exit', { pid, exitCode, signal })
}