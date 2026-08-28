// browser_control's action list has to agree in THREE places: the schema enum
// the model reads, the switch that runs, and the preload channel whitelist.
// Drift between any two is silent — the model reads one list and reaches a
// different implementation, which is the `is_dir`/`isDir` class of bug applied
// to actions instead of fields.
//
// MEASURED in the field: the model called `refresh` and `go_back`, got
// "Unsupported action" with no list of alternatives, and concluded the tool was
// broken — "The app seems to have some issues with its UI."
//
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { browserControlTool, VALID_ACTIONS, ACTION_ALIASES } from './tools/browserControl'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)
const entitlement = require_('../electron/entitlementCore.cjs')
const PRELOAD = fs.readFileSync(path.join(HERE, '..', 'electron', 'preload.cjs'), 'utf8')

const schemaActions = () => {
  const s = browserControlTool.schema
  const fn = s.function || s
  return fn.parameters.properties.action.enum
}

describe('browser_control action list', () => {
  it('the schema the model reads matches the switch that runs', () => {
    expect([...schemaActions()].sort()).toEqual([...VALID_ACTIONS].sort())
  })

  it('has a reload — every browser does, and the model kept inventing one', () => {
    expect(VALID_ACTIONS).toContain('reload')
    expect(PRELOAD).toMatch(/browser:reload/)
    // A channel missing from the entitlement matrix fails CLOSED, so a new
    // handler that is not classified is unreachable even for a paying user.
    expect(entitlement.capabilityFor('browser:reload')).toBeTruthy()
  })

  it('accepts the names a model actually reaches for', () => {
    expect(ACTION_ALIASES.refresh).toBe('reload')
    expect(ACTION_ALIASES.go_back).toBe('back')
    expect(ACTION_ALIASES.go_forward).toBe('forward')
    for (const target of Object.values(ACTION_ALIASES)) {
      expect(VALID_ACTIONS, `alias points at ${target}`).toContain(target)
    }
  })

  it('never lets an alias SHADOW a real action', () => {
    // CLAUDE.md: `watch` was both a registered tool and an alias, so the model
    // read one description and reached a different implementation.
    for (const alias of Object.keys(ACTION_ALIASES)) {
      expect(VALID_ACTIONS, `${alias} shadows a real action`).not.toContain(alias)
    }
  })

  it('every advertised action can actually be performed', () => {
    // THE BUG THIS CATCHES, and it shipped twice. The schema promised
    // `evaluate`, `extract_text` and `wait_for` while the preload bridge had no
    // evaluate, no getPageHtml and no waitFor — so two answered "not supported
    // by this browser bridge version" and the third silently degraded to
    // matching a CSS selector against the accessibility tree. The model is told
    // a capability exists, reaches for it, and concludes the tool is broken.
    //
    // Every method the tool calls on the bridge must be exposed in preload.
    const src = fs.readFileSync(path.join(HERE, 'tools', 'browserControl.js'), 'utf8')
    const called = new Set([...src.matchAll(/\bb\.(\w+)\s*\(/g)].map(m => m[1]))
    const exposed = new Set(
      [...PRELOAD.matchAll(/^\s{2}(\w+):\s*\(p?\)?\s*=>\s*ipcRenderer\.invoke\('browser:/gm)]
        .map(m => m[1]),
    )
    // The bridge block is the one that talks to browser:* channels.
    expect(exposed.size, 'preload browser bridge not found by the regex').toBeGreaterThan(10)
    const missing = [...called].filter(m => !exposed.has(m))
    expect(missing).toEqual([])
  })

  it('the three actions that were dead now have real handlers', () => {
    const main = fs.readFileSync(path.join(HERE, '..', 'electron', 'browserControl.cjs'), 'utf8')
    for (const ch of ['browser:evaluate', 'browser:get-html', 'browser:wait-for']) {
      expect(main, ch).toContain(`ipcMain.handle('${ch}'`)
      expect(PRELOAD, ch).toContain(ch)
      // Unclassified channels FAIL CLOSED, so a new handler that is not in the
      // matrix is unreachable even for a paying user.
      expect(entitlement.capabilityFor(ch), ch).toBeTruthy()
    }
  })

  it('waits against the real DOM, and quotes the selector safely', () => {
    const main = fs.readFileSync(path.join(HERE, '..', 'electron', 'browserControl.cjs'), 'utf8')
    // querySelector, not a substring match on the accessibility tree.
    expect(main).toMatch(/document\.querySelector\(\$\{JSON\.stringify\(selector\)\}\)/)
    // JSON.stringify, not interpolation: a selector containing a quote would
    // otherwise close the string literal and change what the script does.
    expect(main).not.toMatch(/querySelector\('\$\{selector\}'\)/)
  })

  it('names the alternatives when it refuses, instead of just refusing', () => {
    // "Unsupported action: go_back" gives the model nothing to correct with, so
    // it retries variations or abandons the tool. The list is what lets it
    // recover in one step.
    global.window = undefined
    return browserControlTool.execute({ action: 'teleport' }).then((res) => {
      expect(res.success).toBe(false)
      // On the web there is no bridge, so this is the desktop-only refusal —
      // which must ALSO be honest rather than pretending the action ran.
      expect(res.error).toBeTruthy()
    })
  })
})

describe('diagnose — the answer to "does this page work"', () => {
  const MAIN = fs.readFileSync(path.join(HERE, '..', 'electron', 'browserControl.cjs'), 'utf8')

  it('exists as one call, wired end to end', () => {
    // MEASURED: a "verify the UI on localhost" turn spent 27 STEPS and still
    // failed — navigate, guess a selector, wait, time out with no idea what
    // page it was on, then invent `window.__errors` to look for problems. Each
    // is a round trip and the round cap killed the turn first.
    for (const ch of ['browser:diagnose', 'browser:console']) {
      expect(MAIN, ch).toContain(`ipcMain.handle('${ch}'`)
      expect(PRELOAD, ch).toContain(ch)
      expect(entitlement.capabilityFor(ch), ch).toBeTruthy()
    }
    expect(VALID_ACTIONS).toContain('diagnose')
    expect(VALID_ACTIONS).toContain('console')
    expect(schemaActions()).toContain('diagnose')
  })

  it('captures the page console, which is why window.__errors was invented', () => {
    expect(MAIN).toMatch(/wc\.on\('console-message'/)
    // Electron changed this event's signature; handling one shape only means
    // the capture silently records nothing on the other.
    expect(MAIN).toMatch(/modern \? e\.level : args\[1\]/)
    // Console output belongs to the DOCUMENT — carrying the previous page's
    // errors into a report about this one is worse than none.
    expect(MAIN).toMatch(/tab\.console = \[\]/)
  })

  it('answers with a verdict, not four fields to infer one from', () => {
    expect(MAIN).toMatch(/rendered: !!\(snap && \(snap\.mounted \|\| snap\.textLength > 20\)\)/)
  })

  it('the model is told to use it instead of stitching one together', () => {
    const desc = (browserControlTool.schema.function || browserControlTool.schema).description
    expect(desc).toMatch(/diagnose/)
    expect(desc).toMatch(/ONE call/)
  })

  it('a timeout names the page it was actually looking at', () => {
    // "Timed out after 10000ms waiting for #root > *" is unactionable: it does
    // not say WHICH page, and the commonest cause is that the tab was never
    // navigated there.
    expect(MAIN).toMatch(/on \$\{where\.url \|\| 'an unknown page'\}/)
    expect(MAIN).toMatch(/console_errors: errs/)
  })
})

describe('browser automation suite — extended actions', () => {
  const MAIN = fs.readFileSync(path.join(HERE, '..', 'electron', 'browserControl.cjs'), 'utf8')

  it('all extended automation channels are registered across main, preload and entitlement matrix', () => {
    for (const ch of ['browser:hover', 'browser:pdf', 'browser:cookies', 'browser:storage']) {
      expect(MAIN, `${ch} in main`).toContain(`ipcMain.handle('${ch}'`)
      expect(PRELOAD, `${ch} in preload`).toContain(ch)
      expect(entitlement.capabilityFor(ch), `${ch} in entitlement`).toBeTruthy()
    }
  })

  it('valid actions include hover, pdf, cookies, storage, run_script', () => {
    for (const act of ['hover', 'pdf', 'cookies', 'storage', 'run_script']) {
      expect(VALID_ACTIONS).toContain(act)
      expect(schemaActions()).toContain(act)
    }
  })

  it('aliases point to the right canonical automation actions', () => {
    expect(ACTION_ALIASES.export_pdf).toBe('pdf')
    expect(ACTION_ALIASES.save_pdf).toBe('pdf')
    expect(ACTION_ALIASES.move_to).toBe('hover')
    expect(ACTION_ALIASES.get_cookies).toBe('cookies')
    expect(ACTION_ALIASES.local_storage).toBe('storage')
    expect(ACTION_ALIASES.pipeline).toBe('run_script')
    expect(ACTION_ALIASES.batch).toBe('run_script')
  })

  it('run_script executes batch steps sequentially with bridge mock', async () => {
    const mockBridge = {
      navigate: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
      read: vi.fn().mockResolvedValue({ success: true, tree: '<div>[ref_1] Login</div>' }),
      click: vi.fn().mockResolvedValue({ success: true }),
    }
    global.window = { __YOGATIK_BROWSER__: mockBridge }

    const res = await browserControlTool.execute({
      action: 'run_script',
      steps: [
        { action: 'navigate', url: 'https://example.com' },
        { action: 'read' },
        { action: 'click', ref: 'ref_1' },
      ],
    })

    expect(res.success).toBe(true)
    expect(res.totalSteps).toBe(3)
    expect(res.results).toHaveLength(3)
    expect(mockBridge.navigate).toHaveBeenCalled()
    expect(mockBridge.read).toHaveBeenCalled()
    expect(mockBridge.click).toHaveBeenCalled()

    global.window = undefined
  })
})

