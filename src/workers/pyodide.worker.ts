/**
 * Web Worker for Sandboxed Pyodide & Heavy Math Computations
 *
 * Implements:
 *  - Capability allowlist (denies os, subprocess, sockets, raw networking)
 *  - Execution timeout watchdog
 *  - Stdout / Stderr capture buffers
 */

export interface WorkerComputeMessage {
  id: string
  type: 'execute' | 'init'
  code?: string
  packages?: string[]
  timeoutMs?: number
}

export interface WorkerComputeResponse {
  id: string
  success: boolean
  result?: unknown
  stdout?: string
  stderr?: string
  error?: string
  executionTimeMs?: number
}

const ctx: Worker = self as unknown as Worker

let pyodideInstance: any = null

const DISALLOWED_MODULE_PATTERNS = [
  /\bimport\s+(os|subprocess|socket|http|urllib|requests|pty|shutil)\b/i,
  /\bfrom\s+(os|subprocess|socket|http|urllib|requests|pty|shutil)\s+import\b/i,
  /\b__import__\s*\(\s*['"](os|subprocess|socket|http|urllib|requests|pty|shutil)['"]\s*\)/i,
]

function validatePythonSandbox(code: string): { safe: boolean; reason?: string } {
  for (const pattern of DISALLOWED_MODULE_PATTERNS) {
    if (pattern.test(code)) {
      return {
        safe: false,
        reason: 'Security Sandbox: Network, OS process, and subprocess imports are strictly disallowed in client Pyodide execution.',
      }
    }
  }
  return { safe: true }
}

async function initPyodideWorker() {
  if (pyodideInstance) return pyodideInstance

  try {
    const pyodideModule = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.mjs' as any)
    pyodideInstance = await (pyodideModule as any).loadPyodide()
    return pyodideInstance
  } catch (err: any) {
    console.error('Failed to load Pyodide in worker:', err)
    throw err
  }
}

ctx.onmessage = async (e: MessageEvent<WorkerComputeMessage>) => {
  const { id, type, code, packages, timeoutMs = 15000 } = e.data
  const startTime = performance.now()

  try {
    if (type === 'init') {
      await initPyodideWorker()
      ctx.postMessage({ id, success: true, executionTimeMs: performance.now() - startTime })
      return
    }

    if (type === 'execute' && code) {
      // 1. Sandbox Validation Guard
      const validation = validatePythonSandbox(code)
      if (!validation.safe) {
        ctx.postMessage({
          id,
          success: false,
          error: validation.reason,
          executionTimeMs: performance.now() - startTime,
        })
        return
      }

      const pyodide = await initPyodideWorker()

      if (packages && packages.length > 0) {
        // Only load safe scientific / math packages
        const allowedPackages = packages.filter((p) => !['requests', 'urllib3'].includes(p))
        if (allowedPackages.length > 0) {
          await pyodide.loadPackage(allowedPackages)
        }
      }

      let stdout = ''
      let stderr = ''
      pyodide.setStdout({ batched: (str: string) => { stdout += str + '\n' } })
      pyodide.setStderr({ batched: (str: string) => { stderr += str + '\n' } })

      // 2. Execution Timeout Race
      let timeoutHandle: any
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`))
        }, timeoutMs)
      })

      const execPromise = pyodide.runPythonAsync(code)
      const rawResult = await Promise.race([execPromise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutHandle)
      })

      let result: any = rawResult
      if (rawResult && typeof rawResult.toJs === 'function') {
        result = rawResult.toJs()
      }

      ctx.postMessage({
        id,
        success: true,
        result,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        executionTimeMs: performance.now() - startTime,
      })
    }
  } catch (err: any) {
    ctx.postMessage({
      id,
      success: false,
      error: err?.message || String(err),
      executionTimeMs: performance.now() - startTime,
    })
  }
}
