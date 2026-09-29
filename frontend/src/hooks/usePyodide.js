/**
 * usePyodide — Hook for running Python code in a Web Worker
 * Keeps heavy computation off the main thread
 */
import { useRef, useCallback, useEffect, useState } from 'react'

let workerRef = null
let pendingCalls = new Map()
let isInitialized = false

function getWorker() {
  if (workerRef) return workerRef
  
  workerRef = new Worker('/worker-pyodide.js', { type: 'module' })
  
  workerRef.onmessage = (e) => {
    const { id, type, success, result, error, traceback, data, packages } = e.data
    
    if (type === 'worker-loaded' || type === 'ready') {
      isInitialized = true
      return
    }
    
    const pending = pendingCalls.get(id)
    if (pending) {
      pendingCalls.delete(id)
      if (type === 'error' || success === false) {
        pending.reject(new Error(error || 'Pyodide execution failed'))
      } else {
        pending.resolve({ success: true, result, data, packages })
      }
    }
  }
  
  workerRef.onerror = (error) => {
    console.error('Pyodide worker error:', error)
    pendingCalls.forEach(({ reject }) => reject(error))
    pendingCalls.clear()
  }
  
  return workerRef
}

function generateId() {
  return `py_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// Initialize worker on module load
if (typeof window !== 'undefined') {
  getWorker()
}

export function usePyodide() {
  const [isReady, setIsReady] = useState(isInitialized)
  const [isRunning, setIsRunning] = useState(false)
  const initPromiseRef = useRef(null)

  useEffect(() => {
    if (!isInitialized) {
      const checkReady = setInterval(() => {
        if (isInitialized) {
          setIsReady(true)
          clearInterval(checkReady)
        }
      }, 100)
      return () => clearInterval(checkReady)
    } else {
      setIsReady(true)
    }
  }, [])

  const run = useCallback(async (code, packages = []) => {
    if (!isReady) {
      throw new Error('Pyodide worker not ready yet')
    }
    
    setIsRunning(true)
    const id = generateId()
    
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject })
      
      const worker = getWorker()
      worker.postMessage({ id, type: 'run', code, packages })
      
      // Timeout after 2 minutes
      setTimeout(() => {
        if (pendingCalls.has(id)) {
          pendingCalls.delete(id)
          reject(new Error('Pyodide execution timed out'))
        }
      }, 120000)
    })
      .finally(() => setIsRunning(false))
  }, [isReady])

  const installPackages = useCallback(async (packages) => {
    if (!isReady) throw new Error('Pyodide worker not ready yet')
    
    const id = generateId()
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject })
      getWorker().postMessage({ id, type: 'install', packages })
      setTimeout(() => {
        if (pendingCalls.has(id)) {
          pendingCalls.delete(id)
          reject(new Error('Package install timed out'))
        }
      }, 180000)
    })
  }, [isReady])

  const terminate = useCallback(() => {
    if (workerRef) {
      workerRef.postMessage({ type: 'terminate' })
      workerRef.terminate()
      workerRef = null
      isInitialized = false
      setIsReady(false)
      pendingCalls.clear()
    }
  }, [])

  return { run, installPackages, terminate, isReady, isRunning }
}

export default usePyodide
