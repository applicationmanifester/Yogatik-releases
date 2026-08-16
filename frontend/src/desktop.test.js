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
              if (cmd === 'roots_add') return { id: 'r1', path: '/home/user/work', label: 'work' }
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

    it('fs_add_folder returns the picked root', async () => {
      const r = await fsGrantTool.execute()
      expect(r.success).toBe(true)
      expect(r.root).toBe('/home/user/work')
    })

    it('falls back to the Tauri single-root command when roots_* is unsupported', async () => {
      // The Tauri shell REJECTS unknown commands; without a fallback, adding a
      // folder would be dead on that build.
      globalThis.window = {
        __TAURI__: {
          core: {
            invoke: async (cmd) => {
              if (cmd === 'roots_add' || cmd === 'roots_list') throw new Error(`Unknown command: ${cmd}`)
              if (cmd === 'fs_grant') return '/tauri/only'
              if (cmd === 'fs_granted_root') return '/tauri/only'
              return null
            },
          },
        },
      }
      const { addRoot, listRoots } = await import('./tools/localFs')
      expect((await addRoot()).path).toBe('/tauri/only')
      const roots = await listRoots()
      expect(roots).toHaveLength(1)
      expect(roots[0].label).toBe('only')
    })

    it('UI helpers grant/read/clear the working folder', async () => {
      expect(await grantFolder()).toBe('/home/user/work')
      expect(await getGrantedRoot()).toBeNull() // mock fs_granted_root returns null
      await expect(clearGrantedFolder()).resolves.toBeUndefined()
    })
  })

  describe('workspace context injection', () => {
    let seen

    beforeEach(() => {
      seen = []
      globalThis.window = {
        __TAURI__: {
          core: {
            invoke: async (cmd, args) => {
              seen.push({ cmd, args })
              if (cmd === 'fs_read') return 'ok'
              if (cmd === 'roots_list') return [{ id: 'r1', path: '/w/repo', label: 'repo', primary: true, source: 'chat' }]
              return null
            },
          },
        },
      }
    })

    it('injects the active chat context into every fs call', async () => {
      const { setWorkspaceContext } = await import('./tools/localFs')
      setWorkspaceContext(() => ({ conversationId: 7, projectId: 3 }))
      await fsReadTool.execute({ path: 'a.txt' })
      expect(seen[0].args.ctx).toEqual({ conversationId: 7, projectId: 3 })
    })

    it('never exposes ctx as a tool parameter the model can set', () => {
      expect(Object.keys(fsReadTool.schema.parameters.properties)).not.toContain('ctx')
    })

    it('listRoots returns the folders bound to the chat', async () => {
      const { listRoots, setWorkspaceContext } = await import('./tools/localFs')
      setWorkspaceContext(() => ({ conversationId: 7, projectId: null }))
      const roots = await listRoots()
      expect(roots).toHaveLength(1)
      expect(roots[0].path).toBe('/w/repo')
    })
  })

  it('UI helpers are no-ops (null) without a desktop bridge', async () => {
    expect(await grantFolder()).toBeNull()
    expect(await getGrantedRoot()).toBeNull()
    await expect(clearGrantedFolder()).resolves.toBeUndefined()
  })
})
