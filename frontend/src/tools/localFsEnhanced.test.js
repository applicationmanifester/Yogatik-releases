import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fsReplaceContentTool,
  fsMultiReplaceTool,
  fsFileInfoTool,
  fsBatchWriteTool,
  fsFindFilesTool,
  fsSearchTool,
  fsAddFolderTool,
  stripAnsi,
} from './localFs'
import { terminalRunTool } from './terminalRun'

describe('Enhanced Filesystem & Terminal Execution Suite', () => {
  it('defines fsReplaceContentTool with correct schema and parameters', () => {
    expect(fsReplaceContentTool.schema.name).toBe('fs_replace_content')
    expect(fsReplaceContentTool.schema.parameters.required).toContain('path')
    expect(fsReplaceContentTool.schema.parameters.required).toContain('target_content')
    expect(fsReplaceContentTool.schema.parameters.required).toContain('replacement_content')
    expect(fsReplaceContentTool.schema.parameters.properties.start_line).toBeDefined()
    expect(fsReplaceContentTool.schema.parameters.properties.end_line).toBeDefined()
  })

  it('defines fsMultiReplaceTool with atomic chunk replacement schema', () => {
    expect(fsMultiReplaceTool.schema.name).toBe('fs_multi_replace')
    expect(fsMultiReplaceTool.schema.parameters.required).toContain('chunks')
    expect(fsMultiReplaceTool.schema.parameters.properties.chunks.items.properties.start_line).toBeDefined()
    expect(fsMultiReplaceTool.schema.parameters.properties.chunks.items.properties.end_line).toBeDefined()
  })

  it('defines fsFileInfoTool and returns file structure metrics', () => {
    expect(fsFileInfoTool.schema.name).toBe('fs_file_info')
    expect(fsFileInfoTool.schema.parameters.properties.path).toBeDefined()
  })

  it('defines fsBatchWriteTool for multi-file workspace deployment', () => {
    expect(fsBatchWriteTool.schema.name).toBe('fs_batch_write')
    expect(fsBatchWriteTool.schema.parameters.required).toContain('files')
  })

  it('defines fsFindFilesTool for glob path discovery', () => {
    expect(fsFindFilesTool.schema.name).toBe('fs_find_files')
    expect(fsFindFilesTool.schema.parameters.properties.pattern).toBeDefined()
    expect(fsFindFilesTool.schema.parameters.properties.extension).toBeDefined()
  })

  it('defines fsSearchTool with context_lines support', () => {
    expect(fsSearchTool.schema.parameters.properties.context_lines).toBeDefined()
  })

  it('strips ANSI color codes and escape sequences', () => {
    const colored = '\u001b[32mPASS\u001b[39m \u001b[2msrc/index.test.js\u001b[22m'
    expect(stripAnsi(colored)).toBe('PASS src/index.test.js')
  })

  it('exposes ONE shell tool that keeps the non-interactive env option', () => {
    // terminal_exec was a duplicate of terminal_run competing for the same job;
    // it is an alias now and its env/ANSI/duration extras live in terminal_run.
    expect(terminalRunTool.schema.parameters.required).toContain('command')
    expect(terminalRunTool.schema.parameters.properties.env).toBeDefined()
    expect(terminalRunTool.schema.parameters.properties.timeout_ms).toBeDefined()
  })
})

describe('bridge wiring', () => {
  afterEach(() => {
    delete window.__TAURI__
    delete window.__YOGATIK_TERMINAL__
  })

  it('fs_find_files calls the real IPC command, not a whitelist-rejected name', async () => {
    const invoke = vi.fn(async (cmd) => (cmd === 'fs_find_files' ? ['/root/src/a.jsx'] : []))
    window.__TAURI__ = { core: { invoke } }
    const res = await fsFindFilesTool.execute({ pattern: '*.jsx' })
    expect(invoke).toHaveBeenCalledWith('fs_find_files', expect.objectContaining({ pattern: '*.jsx' }))
    expect(res.success).toBe(true)
  })

  it('the fs_list fallback drops directories (fs_list returns is_dir, not isDir)', async () => {
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'fs_find_files') throw new Error('Unknown command: fs_find_files')
      return [
        { path: '/root/src', is_dir: true },
        { path: '/root/src/app.jsx', is_dir: false },
      ]
    })
    window.__TAURI__ = { core: { invoke } }
    const res = await fsFindFilesTool.execute({ pattern: '*.jsx' })
    expect(res.success).toBe(true)
    const found = JSON.stringify(res)
    expect(found).toContain('app.jsx')
    expect(found).not.toContain('"/root/src"')
  })

  it('the shell tool goes through the terminal bridge, which is not an fs_* command', async () => {
    const exec = vi.fn(async () => ({ success: true, exitCode: 0, stdout: 'ok', stderr: '' }))
    window.__TAURI__ = { core: { invoke: vi.fn(async () => { throw new Error('Unknown command') }) } }
    window.__YOGATIK_TERMINAL__ = { exec }
    const res = await terminalRunTool.execute({ command: 'echo ok' })
    expect(exec).toHaveBeenCalled()
    expect(res.success).toBe(true)
    expect(res.stdout).toBe('ok')
    // Non-interactive flags must reach the shell or a prompt hangs it.
    expect(exec.mock.calls[0][1].env).toMatchObject({ CI: 'true', GIT_TERMINAL_PROMPT: '0' })
  })

  it('fs_add_folder pre-warms the codebase map — the tool tells the model to call it FIRST', async () => {
    let resolveMap
    const mapPromise = new Promise((r) => { resolveMap = r })
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'roots_add') return { path: '/root', label: 'root' }
      if (cmd === 'fs_codebase_map') { await mapPromise; return { text: '' } }
      throw new Error(`unexpected command: ${cmd}`)
    })
    window.__TAURI__ = { core: { invoke } }
    const res = await fsAddFolderTool.execute()
    expect(res.success).toBe(true)
    expect(res.root).toBe('/root')
    // The grant already returned — the pre-warm was never awaited.
    expect(invoke).toHaveBeenCalledWith('fs_codebase_map', expect.any(Object))
    resolveMap() // let the pending call settle so it cannot leak into another test
  })

  it('a pre-warm that fails (Tauri has no fs_codebase_map yet) never fails the grant', async () => {
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'roots_add') return { path: '/root', label: 'root' }
      if (cmd === 'fs_codebase_map') throw new Error('Unknown command: fs_codebase_map')
      throw new Error(`unexpected command: ${cmd}`)
    })
    window.__TAURI__ = { core: { invoke } }
    const res = await fsAddFolderTool.execute()
    expect(res.success).toBe(true)
    expect(res.root).toBe('/root')
  })
})
