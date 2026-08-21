/**
 * Web Worker for Sandboxed Pyodide & Heavy Math Computations
 * Keeps main thread and UI completely unblocked during simulations
 */

export interface WorkerComputeMessage {
  id: string;
  type: 'execute' | 'init';
  code?: string;
  packages?: string[];
}

export interface WorkerComputeResponse {
  id: string;
  success: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTimeMs?: number;
}

// In standard Web Worker context
const ctx: Worker = self as unknown as Worker;

let pyodideInstance: any = null;

async function initPyodideWorker() {
  if (pyodideInstance) return pyodideInstance;

  try {
    // Dynamically load Pyodide CDN in worker
    const pyodideModule = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.mjs' as any);
    pyodideInstance = await (pyodideModule as any).loadPyodide();
    return pyodideInstance;
  } catch (err: any) {
    console.error('Failed to load Pyodide in worker:', err);
    throw err;
  }
}

ctx.onmessage = async (e: MessageEvent<WorkerComputeMessage>) => {
  const { id, type, code, packages } = e.data;
  const startTime = performance.now();

  try {
    if (type === 'init') {
      await initPyodideWorker();
      ctx.postMessage({ id, success: true, executionTimeMs: performance.now() - startTime });
      return;
    }

    if (type === 'execute' && code) {
      const pyodide = await initPyodideWorker();
      
      if (packages && packages.length > 0) {
        await pyodide.loadPackage(packages);
      }

      // Capture stdout and stderr
      let stdoutBuffer = '';
      let stderrBuffer = '';
      pyodide.setStdout({ batched: (str: string) => { stdoutBuffer += str + '\n'; } });
      pyodide.setStderr({ batched: (str: string) => { stderrBuffer += str + '\n'; } });

      const evalResult = await pyodide.runPythonAsync(code);
      const executionTimeMs = performance.now() - startTime;

      ctx.postMessage({
        id,
        success: true,
        result: evalResult !== undefined ? String(evalResult) : undefined,
        stdout: stdoutBuffer.trim(),
        stderr: stderrBuffer.trim(),
        executionTimeMs,
      } as WorkerComputeResponse);
    }
  } catch (err: any) {
    ctx.postMessage({
      id,
      success: false,
      error: err?.message || String(err),
      executionTimeMs: performance.now() - startTime,
    } as WorkerComputeResponse);
  }
};
