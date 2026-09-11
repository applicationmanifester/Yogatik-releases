import { describe, it, expect, beforeEach } from 'vitest'
import {
  getUiContext,
  setUiContext,
  subscribeUiContext,
  resetUiContext,
  buildUiTelemetryBlock,
} from './uiContext'

describe('uiContext', () => {
  beforeEach(() => {
    resetUiContext()
  })

  it('provides default initial context', () => {
    const ctx = getUiContext()
    expect(ctx.activeModal).toBeNull()
    expect(ctx.activeTab).toBe('chat')
    expect(ctx.theme).toBe('dark')
    expect(ctx.viewport.width).toBeGreaterThan(0)
  })

  it('updates state via setUiContext patch', () => {
    setUiContext({ activeModal: 'settings', theme: 'light' })
    const ctx = getUiContext()
    expect(ctx.activeModal).toBe('settings')
    expect(ctx.theme).toBe('light')
    expect(ctx.activeTab).toBe('chat') // preserved
  })

  it('notifies subscribers of changes', () => {
    let notified = null
    const unsubscribe = subscribeUiContext(newCtx => {
      notified = newCtx
    })

    setUiContext({ activeTab: 'agents' })
    expect(notified).not.toBeNull()
    expect(notified.activeTab).toBe('agents')

    unsubscribe()
    setUiContext({ activeTab: 'live' })
    expect(notified.activeTab).toBe('agents') // did not update after unsubscribe
  })

  it('builds concise telemetry block for system prompt', () => {
    setUiContext({
      activeModal: 'file_editor',
      activeTab: 'workspace',
      activeDocument: { name: 'App.jsx', path: 'src/App.jsx', language: 'javascript' },
      selectedText: 'const [state, setState] = useState()',
    })

    const block = buildUiTelemetryBlock()
    expect(block).toContain('AMBIENT UI CONTEXT')
    expect(block).toContain('file_editor')
    expect(block).toContain('App.jsx')
    expect(block).toContain('const [state, setState]')
  })
})
