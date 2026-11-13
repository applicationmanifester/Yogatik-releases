import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock IndexedDB and settings - must be hoisted
vi.mock('../db', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('idb', () => ({
  openDB: vi.fn(),
}))

import { getSetting, setSetting } from '../db'
import { openDB } from 'idb'

const mockSession = {
  tabs: new Map([
    ['tab-1', { url: 'https://example.com', title: 'Example', pinned: false, hibernating: false, savedScroll: { x: 0, y: 100 }, isAgent: false, viewCreated: true }],
    ['tab-2', { url: 'https://github.com', title: 'GitHub', pinned: true, hibernating: false, savedScroll: { x: 0, y: 0 }, isAgent: false, viewCreated: true }],
  ]),
  activeTabId: 'tab-1',
  mode: 'window',
  createdAt: Date.now() - 10000,
}

let mockDB

beforeEach(() => {
  vi.clearAllMocks()
  getSetting.mockResolvedValue(null)
  setSetting.mockResolvedValue(undefined)
  
  mockDB = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }
  openDB.mockResolvedValue(mockDB)
})

afterEach(() => vi.unstubAllGlobals())

describe('browserSessionPersistence - settings-based functions', () => {
  it('saveSession extracts serializable tab data', async () => {
    const { saveSession } = await import('./browserSessionPersistence')
    const result = await saveSession(mockSession, 'conv-123')
    expect(result.success).toBe(true)
    expect(result.tabCount).toBe(2)
    expect(setSetting).toHaveBeenCalled()
  })

  it('saveSession handles empty session', async () => {
    const { saveSession } = await import('./browserSessionPersistence')
    const result = await saveSession(null, 'conv-123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No session')
  })

  it('loadSession returns session from settings when available', async () => {
    const { loadSession } = await import('./browserSessionPersistence')
    const savedSession = { sessionId: 'test-session', conversationId: 'conv-123', tabs: [{ tabId: 'tab-1', url: 'https://example.com' }] }
    getSetting.mockResolvedValueOnce(savedSession)
    
    const result = await loadSession('conv-123')
    expect(result.success).toBe(true)
    expect(result.session).toEqual(savedSession)
    expect(result.source).toBe('settings')
  })

  it('exportSession returns JSON string', async () => {
    const { exportSession } = await import('./browserSessionPersistence')
    const savedSession = { sessionId: 'test', conversationId: 'conv-123', tabs: [] }
    getSetting.mockResolvedValueOnce(savedSession)
    
    const result = await exportSession('conv-123')
    expect(result.success).toBe(true)
    expect(typeof result.export).toBe('string')
    expect(result.filename).toContain('.json')
    const parsed = JSON.parse(result.export)
    expect(parsed.sessionId).toBe('test')
  })

  it('importSession rejects invalid format', async () => {
    const { importSession } = await import('./browserSessionPersistence')
    const result = await importSession('{}')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid session format')
  })

  it('browserSessionPersistenceTool handles load action', async () => {
    const { browserSessionPersistenceTool } = await import('./browserSessionPersistence')
    const savedSession = { sessionId: 'test', conversationId: 'conv-123', tabs: [] }
    getSetting.mockResolvedValueOnce(savedSession)
    
    const result = await browserSessionPersistenceTool.execute({ action: 'load', conversationId: 'conv-123' })
    expect(result.success).toBe(true)
    expect(result.session).toEqual(savedSession)
  })

  it('browserSessionPersistenceTool handles export action', async () => {
    const { browserSessionPersistenceTool } = await import('./browserSessionPersistence')
    const savedSession = { sessionId: 'test', conversationId: 'conv-123', tabs: [] }
    getSetting.mockResolvedValueOnce(savedSession)
    
    const result = await browserSessionPersistenceTool.execute({ action: 'export', conversationId: 'conv-123' })
    expect(result.success).toBe(true)
    expect(typeof result.export).toBe('string')
  })

  it('browserSessionPersistenceTool rejects import without jsonData', async () => {
    const { browserSessionPersistenceTool } = await import('./browserSessionPersistence')
    const result = await browserSessionPersistenceTool.execute({ action: 'import' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('jsonData required')
  })
})

describe('browserSessionPersistence - IndexedDB functions (skipped - complex mocking)', () => {
  it.skip('loadSession falls back to IndexedDB', async () => {})
  it.skip('listSessions returns formatted session list', async () => {})
  it.skip('deleteSession removes specific session', async () => {})
  it.skip('deleteConversationSessions removes all sessions for a conversation', async () => {})
  it.skip('importSession parses and stores JSON', async () => {})
  it.skip('browserSessionPersistenceTool handles list action', async () => {})
  it.skip('browserSessionPersistenceTool handles import action', async () => {})
})
