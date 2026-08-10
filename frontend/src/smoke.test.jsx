/**
 * Mount smoke test. lint catches an undefined component; it cannot catch a
 * component that throws on first render, which is how a broken shell ships.
 * Everything that touches IndexedDB / the network is stubbed; this asserts the
 * shell renders and the composer is reachable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('./api', () => {
  const api = {}
  for (const n of [
    'streamMessage', 'stopGeneration', 'uploadDocument', 'removeProvider', 'testProvider',
    'saveProviderApiKey', 'logout', 'getConversation', 'deleteConversation', 'exportConversation',
    'requestTTS', 'stopTTS', 'removeDocument', 'createConversation', 'saveMessage',
    'renameConversation', 'trimConversationFrom', 'setActiveProvider', 'setActiveModel',
    'ensureTested', 'autoPickModel', 'setToolEnabled', 'setToolsEnabledBulk', 'setPref',
    'createProject', 'deleteProject', 'setActiveProject', 'acceptTerms', 'downloadBackup',
    'restoreBackup', 'forgetApiKey', 'enableCloudSync', 'disableCloudSync', 'pruneRetiredModel',
  ]) api[n] = vi.fn(async () => undefined)
  for (const n of [
    'getConversations', 'getTemplates', 'listDocuments', 'getTools', 'getProjects',
    'getMeasuredModels', 'getAllKeyInfo',
  ]) api[n] = vi.fn(async () => [])
  for (const n of ['getModels', 'getAllProviderStatus', 'getPrefs', 'getTodayUsage']) {
    api[n] = vi.fn(async () => ({}))
  }
  api.getVisionStatus = vi.fn(async () => ({ cached: null, guessed: false }))
  api.getSyncMode = vi.fn(async () => 'off')
  api.syncCloudKeys = vi.fn(async () => ({ pulled: 0, pushed: 0 }))
  for (const n of ['getMe', 'getActiveProject', 'getLiveConfig', 'checkGoogleRedirect']) {
    api[n] = vi.fn(async () => null)
  }
  api.getActiveProvider = vi.fn(async () => 'groq')
  api.getStoredProvider = vi.fn(async () => 'groq')   // no zero-key auto-boot in tests
  api.hasAnyProviderKey = vi.fn(async () => true)
  api.getActiveModel = vi.fn(async () => '')
  api.hasAcceptedTerms = vi.fn(async () => true)
  api.isRetiredModelError = vi.fn(() => false)
  return api
})
vi.mock('./localLLM', async (importOriginal) => ({
  ...(await importOriginal()),
  webGpuDetails: vi.fn(async () => ({ available: true, adapter: 'test GPU' })),
  loadLocalModel: vi.fn(async () => ({})),
  streamLocal: vi.fn(),
}))

const api = await import('./api')
const local = await import('./localLLM')

async function mount() {
  const { default: App } = await import('./App')
  const errors = []
  const spy = vi.spyOn(console, 'error').mockImplementation(e => errors.push(String(e)))
  act(() => {
    root = createRoot(container)
    root.render(<App />)
  })
  // Two flushes: the zero-key check is a chain of awaits before any setState.
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  spy.mockRestore()
  return errors.filter(e => !/not wrapped in act/.test(e))
}

let container, root
beforeEach(() => {
  vi.clearAllMocks()          // call counts, not implementations
  api.getStoredProvider.mockResolvedValue('groq')
  api.hasAnyProviderKey.mockResolvedValue(true)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  act(() => root?.unmount())
  container.remove()
})

describe('app shell', () => {
  it('mounts without throwing', async () => {
    const errors = await mount()
    expect(container.querySelector('textarea')).toBeTruthy()
    expect(errors).toEqual([])
  }, 30000)   // App.jsx + react-markdown transform once; that alone can take seconds
})

describe('zero-key start', () => {
  it('loads the on-device model when there is no key and no chosen provider', async () => {
    api.getStoredProvider.mockResolvedValue(null)
    api.hasAnyProviderKey.mockResolvedValue(false)

    await mount()
    expect(local.loadLocalModel).toHaveBeenCalledWith(local.DEFAULT_LOCAL_MODEL, expect.any(Function))
    expect(api.setActiveProvider).toHaveBeenCalledWith('local')
  }, 30000)

  it('leaves a user who already has a key alone', async () => {
    api.getStoredProvider.mockResolvedValue(null)
    api.hasAnyProviderKey.mockResolvedValue(true)

    await mount()
    expect(local.loadLocalModel).not.toHaveBeenCalled()
  }, 30000)

  it('does not override a provider the user chose', async () => {
    api.getStoredProvider.mockResolvedValue('groq')
    api.hasAnyProviderKey.mockResolvedValue(false)

    await mount()
    expect(local.loadLocalModel).not.toHaveBeenCalled()
  }, 30000)
})
