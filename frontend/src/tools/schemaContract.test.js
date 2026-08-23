/**
 * What the MODEL is shown about our tools.
 *
 * Three different schema shapes live in the registry (bare {description,
 * parameters}, a full {type:'function',function:{…}} envelope, and a flat
 * {name,description,parameters} with no `schema` key). getToolSchemas has to
 * normalise all three; when it did not, a dozen tools — including the real
 * browser_control — reached the model as a bare name with no description and no
 * parameters, and nothing failed loudly.
 */
import { describe, it, expect, vi } from 'vitest'
import ALL_TOOLS, {
  getToolNames, getToolSchemas, prioritizeToolSchemas, executeTool, MAX_TOOLS_PER_REQUEST,
} from './index'

const schemas = () => getToolSchemas([])
const namesOf = (list) => list.map(s => s.function.name)
const RAW_TYPE_ERROR = /cannot read|cannot set prop|is not a function|undefined is not|of undefined|of null/i

describe('tool schema contract', () => {
  it('every registered tool emits a well-formed function schema', () => {
    const problems = []
    for (const s of schemas()) {
      const fn = s.function
      if (s.type !== 'function') problems.push(`${fn?.name}: envelope type is ${s.type}`)
      if (!fn?.name) problems.push('a schema has no name')
      if (!fn?.description) problems.push(`${fn?.name}: no description — the model cannot tell what it does`)
      if (fn?.parameters?.type !== 'object') problems.push(`${fn?.name}: parameters.type is ${fn?.parameters?.type}`)
      // The bug: the tool's own envelope survived inside function{}.
      if (fn?.function || fn?.type) problems.push(`${fn?.name}: nested envelope leaked through`)
      const props = Object.keys(fn?.parameters?.properties || {})
      for (const r of (fn?.parameters?.required || [])) {
        if (!props.includes(r)) problems.push(`${fn?.name}: required "${r}" is not in properties`)
      }
    }
    expect(problems).toEqual([])
  })

  it('the advertised name is the name executeTool resolves', () => {
    const keys = getToolNames()
    expect(namesOf(schemas()).filter(n => !keys.includes(n))).toEqual([])
  })

  it('every registered tool is callable', () => {
    const bad = getToolNames().filter(n => typeof ALL_TOOLS[n]?.execute !== 'function')
    expect(bad).toEqual([])
  })
})

describe('per-request tool budget', () => {
  it('caps the list — the whole registry is ~32k tokens of schemas per turn', () => {
    const all = schemas()
    expect(all.length).toBeGreaterThan(MAX_TOOLS_PER_REQUEST)
    expect(prioritizeToolSchemas(all, 'hello').length).toBe(MAX_TOOLS_PER_REQUEST)
  })

  it('keeps the core tools whatever the wording, including a keyword-free follow-up', () => {
    const core = [
      'fs_read', 'fs_write', 'fs_edit', 'fs_list', 'fs_search',
      'terminal_run', 'browser_control', 'spawn_agents', 'memory', 'doc_search',
      'web_search', 'code_execute',
    ]
    for (const msg of ['hello there', '', 'now do the same for the other one']) {
      const kept = namesOf(prioritizeToolSchemas(schemas(), msg))
      expect(core.filter(c => !kept.includes(c)), `lost for ${JSON.stringify(msg)}`).toEqual([])
    }
  })

  it('still ranks a relevant tool above the floor', () => {
    const kept = namesOf(prioritizeToolSchemas(schemas(), 'summarize this youtube video'))
    expect(kept[0]).toBe('youtube')
  })
})

describe('missing-argument behaviour', () => {
  it('no tool answers a call with no arguments by leaking a raw TypeError', async () => {
    // "Cannot read properties of undefined (reading 'split')" tells the model
    // nothing it can act on, so it retries the same broken call. A named
    // requirement ("text is required") lets it correct itself on the next turn.
    // This also keeps a malformed call from triggering a multi-MB WASM download.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network disabled in test') }))
    const weak = []
    for (const name of getToolNames()) {
      const res = await Promise.race([
        executeTool(name, {}),
        new Promise(r => setTimeout(() => r({ __timedOut: true }), 2000)),
      ])
      if (res?.__timedOut) { weak.push(`${name}: never answered`); continue }
      const err = String(res?.error ?? '')
      if (res?.success === false && RAW_TYPE_ERROR.test(err)) weak.push(`${name}: ${err.slice(0, 80)}`)
    }
    vi.unstubAllGlobals()
    expect(weak).toEqual([])
  }, 120000)
})

describe('alias resolution', () => {
  it('a registered tool always wins over an alias of the same name', async () => {
    // `watch` was both a real tool and an alias for watch_folder, so the model
    // read one description and reached a different tool.
    expect(getToolNames()).toContain('watch')
    const res = await executeTool('watch', { action: 'changes' })
    // Off-desktop both refuse, but with different wording; the real tool's.
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/desktop app/i)
  })
})
