import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getProviders } from './llm'
import {
  isDesktop, fsReadTool, fsGrantTool, fsListTool, fsSearchTool,
  fsBatchReadTool, fsFileTreeTool, fsWriteTool, fsEditTool, fsDeleteTool,
  fsMkdirTool, fsMoveTool, grantFolder, getGrantedRoot, clearGrantedFolder,
} from './tools/localFs'

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

  it('fs_batch_read is desktop-only in browser', async () => {
    const r = await fsBatchReadTool.execute({ paths: ['a.txt', 'b.txt'] })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/desktop app/i)
  })

  it('fs_file_tree is desktop-only in browser', async () => {
    const r = await fsFileTreeTool.execute({ path: '.' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/desktop app/i)
  })

  describe('with a mock Tauri bridge', () => {
    beforeEach(() => {
      globalThis.window = {
        __TAURI__: {
          core: {
            invoke: async (cmd, args) => {
              if (cmd === 'fs_read') {
                if (args.startLine && args.endLine) return `line-${args.startLine}-to-${args.endLine}`
                return `contents-of-${args.path}`
              }
              if (cmd === 'fs_grant') return '/home/user/work'
              if (cmd === 'roots_add') return { id: 'r1', path: '/home/user/work', label: 'work' }
              if (cmd === 'fs_list') return [{ name: 'index.js', path: 'index.js', is_dir: false, size: 1024 }]
              if (cmd === 'fs_batch_read') {
                return args.paths.map(p => ({ path: p, success: true, content: `data-${p}`, size: 100 }))
              }
              if (cmd === 'fs_file_tree') return 'src/\n  └── index.js\npackage.json'
              if (cmd === 'fs_search') return [{ path: 'src/index.js', line: 10, text: 'const foo = 42' }]
              if (cmd === 'fs_write') return null
              if (cmd === 'fs_edit') return 1
              if (cmd === 'fs_mkdir') return null
              if (cmd === 'fs_move') return null
              if (cmd === 'fs_delete') return null
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

    it('supports windowed line-range fs_read', async () => {
      const r = await fsReadTool.execute({ path: 'large.txt', start_line: 10, end_line: 20 })
      expect(r.success).toBe(true)
      expect(r.content).toBe('line-10-to-20')
      expect(r.start_line).toBe(10)
      expect(r.end_line).toBe(20)
    })

    it('executes fs_batch_read across multiple workspace files', async () => {
      const r = await fsBatchReadTool.execute({ paths: ['src/a.js', 'src/b.js'] })
      expect(r.success).toBe(true)
      expect(r.count).toBe(2)
      expect(r.files[0].path).toBe('src/a.js')
      expect(r.files[0].content).toBe('data-src/a.js')
    })

    it('generates a compact workspace fs_file_tree', async () => {
      const r = await fsFileTreeTool.execute({ path: '.', max_depth: 3 })
      expect(r.success).toBe(true)
      expect(r.tree).toContain('src/')
      expect(r.tree).toContain('package.json')
    })

    it('lists workspace files with fs_list', async () => {
      const r = await fsListTool.execute({ path: '', recursive: true })
      expect(r.success).toBe(true)
      expect(r.entries.length).toBe(1)
      expect(r.entries[0].name).toBe('index.js')
    })

    it('searches workspace content with fs_search', async () => {
      const r = await fsSearchTool.execute({ query: 'foo', glob: '*.js' })
      expect(r.success).toBe(true)
      expect(r.count).toBe(1)
      expect(r.matches[0].text).toBe('const foo = 42')
    })

    it('fs_grant returns the picked root', async () => {
      const r = await fsGrantTool.execute()
      expect(r.success).toBe(true)
      expect(r.root).toBe('/home/user/work')
    })

    it('handles write, edit, mkdir, move, delete workspace operations', async () => {
      expect((await fsWriteTool.execute({ path: 'test.txt', content: 'hello' })).success).toBe(true)
      expect((await fsEditTool.execute({ path: 'test.txt', old_string: 'h', new_string: 'H' })).success).toBe(true)
      expect((await fsMkdirTool.execute({ path: 'sub' })).success).toBe(true)
      expect((await fsMoveTool.execute({ src: 'a', dest: 'b' })).success).toBe(true)
      expect((await fsDeleteTool.execute({ path: 'test.txt' })).success).toBe(true)
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
