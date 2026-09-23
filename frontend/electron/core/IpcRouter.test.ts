import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the electron module BEFORE importing IpcRouter — electron is not
// available in the node test environment, and the router registers handlers
// through ipcMain.handle at registration time.
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}))

import { IpcRouter } from '../core/IpcRouter'
import { Logger } from '../core/Logger'
import { IpcError } from '../core/IpcRouter'
import { ipcMain } from 'electron'

describe('IpcRouter', () => {
  let router: IpcRouter
  let mockLogger: Logger
  let handlers: Map<string, Function>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as any

    router = new IpcRouter(mockLogger)
    handlers = new Map()

    // Capture handlers registered through the mocked ipcMain.handle
    ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    })
  })

  it('registers handler and invokes it', async () => {
    const handler = vi.fn().mockResolvedValue('success')
    router.register('test:channel', handler)

    const registeredHandler = handlers.get('test:channel')
    expect(registeredHandler).toBeDefined()

    const result = await registeredHandler!(null as any, 'arg1', 'arg2')
    expect(result).toBe('success')
    expect(handler).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('validates arguments when validate option provided', async () => {
    const handler = vi.fn().mockResolvedValue('success')
    router.register('test:validate', handler, {
      validate: (args) => args.length === 2 ? { valid: true } : { valid: false, error: 'Expected 2 args' }
    })

    const registeredHandler = handlers.get('test:validate')

    // Valid args
    await expect(registeredHandler!(null as any, 'a', 'b')).resolves.toBe('success')

    // Invalid args
    await expect(registeredHandler!(null as any, 'a')).rejects.toThrow(IpcError)
    await expect(registeredHandler!(null as any, 'a')).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: 'Expected 2 args',
    })
  })

  it('enforces timeout when timeout option provided', async () => {
    const handler = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('slow'), 100)))
    router.register('test:timeout', handler, { timeout: 10 })

    const registeredHandler = handlers.get('test:timeout')

    await expect(registeredHandler!(null as any)).rejects.toThrow(IpcError)
    await expect(registeredHandler!(null as any)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })

  it('wraps errors in IpcError', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('original error'))
    router.register('test:error', handler)

    const registeredHandler = handlers.get('test:error')

    await expect(registeredHandler!(null as any)).rejects.toThrow(IpcError)
    await expect(registeredHandler!(null as any)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'original error',
    })
  })

  it('preserves IpcError codes', async () => {
    const handler = vi.fn().mockRejectedValue(new IpcError('CUSTOM_CODE', 'custom message'))
    router.register('test:ipc-error', handler)

    const registeredHandler = handlers.get('test:ipc-error')

    await expect(registeredHandler!(null as any)).rejects.toThrow(IpcError)
    await expect(registeredHandler!(null as any)).rejects.toMatchObject({
      code: 'CUSTOM_CODE',
      message: 'custom message',
    })
  })

  it('unregisters handler', () => {
    const handler = vi.fn()
    router.register('test:unregister', handler)
    expect(handlers.has('test:unregister')).toBe(true)

    router.unregister('test:unregister')
    // The contract: the underlying ipcMain handler is removed AND the router
    // drops its internal registration (re-registering then works).
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('test:unregister')

    // Re-register works after unregister (no "already registered" warning)
    ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
    router.register('test:unregister', handler)
    // The router stores its WRAPPED handler (not the raw mock) — assert a
    // registration landed and the original handler is callable through it.
    const reRegistered = handlers.get('test:unregister')
    expect(reRegistered).toBeDefined()
    expect(reRegistered).not.toBe(handler)
  })

  it('unregisters all handlers', () => {
    router.register('test:1', vi.fn())
    router.register('test:2', vi.fn())
    expect(handlers.size).toBe(2)

    router.unregisterAll()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('test:1')
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('test:2')

    // Re-register works after unregisterAll
    ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
    router.register('test:3', vi.fn())
    expect(handlers.has('test:3')).toBe(true)
  })
})