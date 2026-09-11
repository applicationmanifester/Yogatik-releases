import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  appSettingsTool,
  executeAppSettings,
  maskSensitive,
  sanitizeSettings,
  CONFIGURABLE_SETTINGS,
} from './appSettings'

// Mock the db module
let mockSettings = {}
let mockDocuments = []
let mockProjects = []

vi.mock('../db', () => ({
  db: {
    conversations: { count: vi.fn().mockResolvedValue(42) },
    media: { count: vi.fn().mockResolvedValue(5) },
    traces: { count: vi.fn().mockResolvedValue(12) },
  },
  getSetting: vi.fn((k, fb = null) => Promise.resolve(mockSettings[k] ?? fb)),
  setSetting: vi.fn((k, v) => { mockSettings[k] = v; return Promise.resolve() }),
  getAllSettings: vi.fn(() => Promise.resolve({ ...mockSettings })),
  getDocuments: vi.fn(() => Promise.resolve([...mockDocuments])),
  addDocument: vi.fn(({ name, type, content, projectId }) => {
    const doc = { id: mockDocuments.length + 1, name, type, chars: content.length, projectId, createdAt: Date.now() }
    mockDocuments.push(doc)
    return Promise.resolve(doc)
  }),
  deleteDocument: vi.fn((id) => {
    mockDocuments = mockDocuments.filter(d => d.id !== id)
    return Promise.resolve()
  }),
  getProjects: vi.fn(() => Promise.resolve([...mockProjects])),
  createProject: vi.fn(({ name, persona }) => {
    const p = { id: mockProjects.length + 1, name, persona, createdAt: Date.now() }
    mockProjects.push(p)
    return Promise.resolve(p)
  }),
  getAgentTraces: vi.fn().mockResolvedValue([]),
}))

describe('appSettings tool', () => {
  beforeEach(() => {
    mockSettings = {
      theme: 'dark',
      temperature: 0.7,
      apikey_openai: 'sk-proj-1234567890abcdef1234',
    }
    mockDocuments = [
      { id: 1, name: 'notes.md', type: 'text/markdown', chars: 450, createdAt: Date.now() },
    ]
    mockProjects = [
      { id: 'proj-1', name: 'Main Project', createdAt: Date.now() },
    ]
  })

  it('masks sensitive API keys properly', () => {
    expect(maskSensitive('theme', 'dark')).toBe('dark')
    expect(maskSensitive('apikey_openai', 'sk-proj-1234567890abcdef1234')).toBe('sk-p...1234')
    expect(maskSensitive('apikey_openai', 'short')).toBe('********')
  })

  it('sanitizes full settings dictionary', () => {
    const sanitized = sanitizeSettings(mockSettings)
    expect(sanitized.theme).toBe('dark')
    expect(sanitized.temperature).toBe(0.7)
    expect(sanitized.apikey_openai).toEqual({ configured: true, preview: 'sk-p...1234' })
  })

  it('reads a specific setting', async () => {
    const res = await appSettingsTool.execute({ action: 'get', key: 'theme' })
    expect(res.success).toBe(true)
    expect(res.key).toBe('theme')
    expect(res.value).toBe('dark')
  })

  it('modifies a setting and updates store', async () => {
    const res = await appSettingsTool.execute({ action: 'set', key: 'theme', value: 'light' })
    expect(res.success).toBe(true)
    expect(res.value).toBe('light')
    expect(mockSettings.theme).toBe('light')
  })

  it('lists all resources including documents and projects', async () => {
    const res = await appSettingsTool.execute({ action: 'list_resources' })
    expect(res.success).toBe(true)
    expect(res.resources.conversations_count).toBe(42)
    expect(res.resources.documents_count).toBe(1)
    expect(res.resources.projects_count).toBe(1)
    expect(res.resources.documents[0].name).toBe('notes.md')
  })

  it('creates and manages projects via manage_resource', async () => {
    const res = await appSettingsTool.execute({
      action: 'manage_resource',
      resource_action: 'create_project',
      resource_data: { name: 'New AI App' },
    })
    expect(res.success).toBe(true)
    expect(res.project.name).toBe('New AI App')
    expect(mockProjects.length).toBe(2)
  })

  it('saves new documents to workspace via manage_resource', async () => {
    const res = await appSettingsTool.execute({
      action: 'manage_resource',
      resource_action: 'save_document',
      resource_data: { name: 'spec.md', content: '# System Spec\nDetails here' },
    })
    expect(res.success).toBe(true)
    expect(res.document.name).toBe('spec.md')
    expect(mockDocuments.length).toBe(2)
  })

  it('dispatches open_modal event for UI', async () => {
    const res = await appSettingsTool.execute({
      action: 'open_modal',
      modal_name: 'settings',
      modal_props: { tab: 'appearance' },
    })
    expect(res.success).toBe(true)
    expect(res.modal).toBe('settings')
    expect(res.props.tab).toBe('appearance')
  })
})
