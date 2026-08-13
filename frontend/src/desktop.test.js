import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getProviders } from './llm'
import { isDesktop, fsReadTool, fsGrantTool, grantFolder, getGrantedRoot, clearGrantedFolder } from './tools/localFs'

describe('Ollama provider', () => {
  it('is registered, keyless, and OpenAI-compatible', () => {
    const p = getProviders().ollama
    expect(p).toBeTruthy()
    expect(p.noKey).toBe(true)
    expect(p.publicModels).toBe(true)
    expect(p.baseUrl).toMatch(/\/v1$/)
    expect(p.baseUrl).toContain('11434')
  })
})

describe('local filesystem tools (desktop bridge)', () => {
  afterEach(() => { delete globalThis.window })

  it('reports non-desktop when no Tauri bridge is present', () => {
    expect(isDesktop()).toBe(false)
  })

  it('fs tools return an honest desktop-only note in the browser', async () => {
    const r = await fsReadTool.execute({ path: 'a.txt' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/desktop app/i)
  })

  it('fs_grant is desktop-only too', async () => {
    const r = await fsGrantTool.execute()
    expect(r.success).toBe(false)
  })

  describe('with a mock Tauri bridge', () => {
    beforeEach(() => {
      globalThis.window = {
        __TAURI__: {
          core: {
            invoke: async (cmd, args) => {
              if (cmd === 'fs_read') return `contents-of-${args.path}`
              if (cmd === 'fs_grant') return '/home/user/work'
              return null
            },
          },
        },
      }
    })

    it('detects desktop and routes fs_read through invoke', async () => {
      expect(isDesktop()).toBe(true)
      const r = await fsReadTool.execute({ path: 'note.txt' })
      expect(r.success).toBe(true)
      expect(r.content).toBe('contents-of-note.txt')
    })

    it('fs_grant returns the picked root', async () => {
      const r = await fsGrantTool.execute()
      expect(r.success).toBe(true)
      expect(r.root).toBe('/home/user/work')
    })

    it('UI helpers grant/read/clear the working folder', async () => {
      expect(await grantFolder()).toBe('/home/user/work')
      expect(await getGrantedRoot()).toBeNull() // mock fs_granted_root returns null
      await expect(clearGrantedFolder()).resolves.toBeUndefined()
    })
  })

  it('UI helpers are no-ops (null) without a desktop bridge', async () => {
    expect(await grantFolder()).toBeNull()
    expect(await getGrantedRoot()).toBeNull()
    await expect(clearGrantedFolder()).resolves.toBeUndefined()
  })
})
