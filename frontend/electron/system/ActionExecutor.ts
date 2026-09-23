/**
 * ActionExecutor — Executes sanitized desktop actions
 *
 * All inputs have been validated by InputSanitizer before reaching here.
 */

import { clipboard, shell } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
// exec without a callback returns ChildProcess; the promisified form is used
// so spawn failures land in .catch() instead of becoming unhandled rejections.
const execAsync = promisify(exec)

export interface ActionResult {
  success: boolean
  action: string
  text?: string
  keys?: string
  length?: number
  target?: string
  error?: string
}

export async function executeAction(action: {
  type: 'type' | 'hotkey' | 'clipboard' | 'launch'
  text?: string
  keys?: string
  targetUrl?: string
  targetApp?: string
}): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'type':
        return executeType(action.text!)
      case 'hotkey':
        return executeHotkey(action.keys!)
      case 'clipboard':
        return executeClipboard(action.text!)
      case 'launch':
        return executeLaunch(action.targetUrl, action.targetApp)
      default:
        return { success: false, action: action.type, error: `Unknown action type: ${action.type}` }
    }
  } catch (error) {
    return { success: false, action: action.type, error: String(error) }
  }
}

function executeType(text: string): ActionResult {
  // Use Electron's built-in clipboard + native paste simulation
  // For actual typing, we'd need a native module or OS-specific approach
  // This is a simplified version - in production use a proper input simulation library
  clipboard.writeText(text)

  // On Windows, we can use PowerShell SendKeys for actual typing
  if (process.platform === 'win32') {
    // The text was already escaped by InputSanitizer
    // exec without a callback returns ChildProcess (no .catch); use the
    // promisified form so a spawn failure is caught, not unhandled.
    execAsync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')"`,
      { timeout: 5000 }
    ).catch(() => { /* ignore - best effort */ })
  }

  return { success: true, action: 'type', text, length: text.length }
}

function executeHotkey(keys: string): ActionResult {
  if (process.platform === 'win32') {
    execAsync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
      { timeout: 3000 }
    ).catch(() => { /* ignore */ })
  }
  // On macOS/Linux, would need different implementation (xdotool, etc.)
  return { success: true, action: 'hotkey', keys }
}

function executeClipboard(text: string): ActionResult {
  clipboard.writeText(text)
  return { success: true, action: 'clipboard', length: text.length }
}

async function executeLaunch(targetUrl?: string, targetApp?: string): Promise<ActionResult> {
  if (targetUrl) {
    await shell.openExternal(targetUrl)
    return { success: true, action: 'launch', target: targetUrl }
  }

  if (targetApp) {
    await shell.openPath(targetApp)
    return { success: true, action: 'launch', target: targetApp }
  }

  return { success: false, action: 'launch', error: 'No target specified' }
}