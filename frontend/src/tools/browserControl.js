/**
 * browser_control — a real browser the agent drives and the user watches.
 *
 * The web build cannot do this: cross-origin iframes are refused by
 * X-Frame-Options on most real sites and are opaque to the parent even when
 * allowed. web_extract/web_search fetch static HTML; this runs the page.
 *
 * Elements are addressed by ref from `read`, not by pixel guessing. Refs go
 * stale on navigation and are refused loudly rather than clicking blind.
 *
 * Desktop app only.
 */

import { getWorkspaceCtx } from './localFs'
import { getSetting } from '../db'
import { extractReadable } from './readability'

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Browser control runs only in the Yogatik desktop app.',
}

// The chat owns its browsing session. Supplied here, never a tool parameter —
// the model must not be able to reach into another chat's logged-in tabs.
//
// Surface: an explicit `display` from the model wins; otherwise the user's
// stored default; otherwise a window.
/**
 * The actions this tool really implements. Exported so a test can assert the
 * schema enum and the switch below cannot drift apart — the same field-drift
 * class that has bitten this codebase repeatedly.
 */
export const VALID_ACTIONS = [
  'navigate', 'read', 'click', 'double_click', 'right_click', 'hover', 'type', 'select', 'key',
  'scroll', 'screenshot', 'pdf', 'cookies', 'storage', 'new_tab', 'list_tabs', 'select_tab', 'close_tab',
  'back', 'forward', 'reload', 'set_mode', 'close',
  'wait_for', 'fill_form', 'evaluate', 'extract_text',
  'diagnose', 'console', 'run_script', 'assert', 'audit_a11y',
  'upload_file', 'network',
  'zoom_in', 'zoom_out', 'zoom_reset', 'find_text',
  'wait_for_download', 'list_downloads',
]

/**
 * Names a model reasonably reaches for that are not the canonical ones.
 * An alias must NEVER shadow a real action — CLAUDE.md records `watch` being
 * both a registered tool and an alias, so the model read one description and
 * reached a different implementation.
 */
export const ACTION_ALIASES = {
  refresh: 'reload', reload_page: 'reload',
  go_back: 'back', goback: 'back', navigate_back: 'back',
  go_forward: 'forward', goforward: 'forward', navigate_forward: 'forward',
  goto: 'navigate', open: 'navigate', open_url: 'navigate', visit: 'navigate',
  get_text: 'extract_text', text: 'extract_text',
  snapshot: 'screenshot', capture: 'screenshot', crop_screenshot: 'screenshot',
  export_pdf: 'pdf', save_pdf: 'pdf',
  move_to: 'hover', mouse_over: 'hover',
  get_cookies: 'cookies', cookie: 'cookies',
  local_storage: 'storage', session_storage: 'storage',
  pipeline: 'run_script', batch: 'run_script',
  check: 'diagnose', verify: 'diagnose', test: 'diagnose', health: 'diagnose',
  console_logs: 'console', logs: 'console', errors: 'console', get_logs: 'console',
  tabs: 'list_tabs', newtab: 'new_tab',
  press: 'key', input: 'type', fill: 'type',
  // `select_option`/`choose`/`dropdown` must map to `select`, and `select` must
  // never be confused with `select_tab` — the two are unrelated and a model
  // reaching for one and getting the other would switch tabs mid-form.
  select_option: 'select', choose: 'select', dropdown: 'select', set_select: 'select',
  assert_text: 'assert', assert_element: 'assert', assertion: 'assert', expect: 'assert',
  a11y: 'audit_a11y', accessibility: 'audit_a11y', wcag: 'audit_a11y', audit: 'audit_a11y',
  upload: 'upload_file', set_input_files: 'upload_file', attach_file: 'upload_file', choose_file: 'upload_file',
  network_requests: 'network', requests: 'network', network_log: 'network', network_inspect: 'network',
  zoomin: 'zoom_in', increase_zoom: 'zoom_in',
  zoomout: 'zoom_out', decrease_zoom: 'zoom_out',
  reset_zoom: 'zoom_reset', zoom_100: 'zoom_reset',
  find: 'find_text', search_page: 'find_text', find_in_page: 'find_text', find_on_page: 'find_text',
  downloads: 'list_downloads', list_download: 'list_downloads',
  wait_download: 'wait_for_download', download: 'wait_for_download', wait_for_downloads: 'wait_for_download',
}

// `callerCtx` is the chat that issued the call, threaded from executeTool. It
// must not be read from the ambient slot: browser sessions are keyed by
// conversationId and hold LOGGED-IN tabs, so resolving against whichever chat
// entered last would let one chat drive another chat's authenticated session.
async function ctx(display, callerCtx) {
  const { conversationId } = getWorkspaceCtx(callerCtx) || {}
  let mode = display
  if (!mode) {
    try {
      const prefs = await getSetting('chat_prefs', {})
      mode = prefs?.browser_display_mode === 'panel' ? 'panel' : 'window'
    } catch { mode = 'window' }
  }
  return { conversationId: conversationId || null, display: mode }
}

export const browserControlTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_control',
      description:
        'Open and USE a real web browser the user can watch: navigate, read the page structure, click, type, scroll and manage tabs. ' +
        'Unlike web_extract/web_search (which only fetch static HTML), this runs the page\'s JavaScript, so it works on logged-in pages and apps. ' +
        'TO CHECK WHETHER A PAGE OR DEV SERVER WORKS, use action "diagnose" with the url — ONE call that ' +
        'navigates, waits for the app to actually render, and returns the rendered state, the page\'s own ' +
        'console errors and any failed requests. Do NOT stitch that together from navigate + wait_for + evaluate; ' +
        'that costs many turns and usually runs out of them. Use "console" for the page\'s console log on its own. ' +
        'Use "assert" (with type="text"|"element"|"count"|"url") for automated test assertions. ' +
        'Use "audit_a11y" for full automated WCAG 2.2 accessibility audits. ' +
        'Use "upload_file" to put real files into an <input type=file> — read the page first, pass its ref and an array of absolute file paths (use file_dialog to get real paths from the user). ' +
        'Use "network" to see the requests/responses the page has made (status, method, url) — useful for checking whether an API call actually succeeded. ' +
        'Use "zoom_in"/"zoom_out"/"zoom_reset" to change page zoom (useful before a screenshot of dense text). ' +
        'Use "find_text" (with `text`) to search the page for a string and get a match count back — call it again with the same text to advance to the next match, without scrolling or re-reading the tree. ' +
        'To download a file: click the download link/button as normal, then call "wait_for_download" (optionally with `text` as a filename substring to match, if more than one download might be in flight) — it waits for the download to finish and returns its local file path, which fs_read can then open. "list_downloads" lists what has been downloaded in this browsing session. ' +
        'ALWAYS call action "read" before clicking: it returns the page as a tree where every clickable element has a [ref_N] handle. ' +
        'Then click or type using that ref — do not guess x/y coordinates unless the target is a canvas or custom widget with no ref. ' +
        'Refs go stale when the page changes; if you get a stale-ref error, call "read" again. ' +
        'Ask the user before any action that submits, sends, deletes, buys, or posts anything. Desktop app only.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'navigate', 'read', 'click', 'double_click', 'right_click', 'hover', 'type', 'select', 'key',
              'scroll', 'screenshot', 'pdf', 'cookies', 'storage', 'new_tab', 'list_tabs', 'select_tab', 'close_tab',
              'back', 'forward', 'reload', 'set_mode', 'close',
              'wait_for', 'fill_form', 'evaluate', 'extract_text',
              'diagnose', 'console', 'run_script', 'assert', 'audit_a11y',
              'upload_file', 'network',
              'zoom_in', 'zoom_out', 'zoom_reset', 'find_text',
              'wait_for_download', 'list_downloads',
            ],
            description: 'What to do.',
          },
          url: { type: 'string', description: 'URL for navigate / new_tab, or for diagnose (it navigates there first).' },
          ref: { type: 'string', description: 'Element handle from a previous read, e.g. "ref_3_12". Preferred over x/y.' },
          x: { type: 'number', description: 'Fallback X coordinate, only when no ref exists (canvas/custom widgets).' },
          y: { type: 'number', description: 'Fallback Y coordinate, only when no ref exists.' },
          text: {
            type: 'string',
            description: 'Text to type for action "type". Also: the search string for "find_text", or an optional filename substring filter for "wait_for_download".',
          },
          value: { type: 'string', description: 'Option to choose for action "select" — matches the option\'s value, its visible label, or its index.' },
          submit: { type: 'boolean', description: 'Press Enter after typing. This is blocked until confirmed=true after the user explicitly approves the submission.' },
          confirmed: {
            type: 'boolean',
            description: 'Set true only after the user explicitly approves a submission or pressing Enter on a form. Filling fields is safe without it; submission is not.',
          },
          clear: {
            type: 'boolean',
            description: 'For action "type": replace the field\'s current contents instead of appending. '
              + 'Defaults to true when a ref is given (typing into a named field means filling it).',
          },
          keys: { type: 'string', description: 'Key or combo for action "key": "enter", "tab", "escape", "ctrl+a".' },
          amount: { type: 'number', description: 'Scroll distance in pixels; negative scrolls down (default -400).' },
          tabId: { type: 'string', description: 'Target tab. Defaults to the active tab.' },
          display: {
            type: 'string',
            enum: ['window', 'panel'],
            description: 'Show the browser in a separate window or docked in the app. Omit to use the user\'s preferred surface.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for wait_for, assert, or screenshot element cropping.',
          },
          type: {
            type: 'string',
            enum: ['text', 'element', 'count', 'attribute', 'url', 'title', 'local', 'session'],
            description: 'Assertion type for action "assert"; for action "storage", which store to read ("local" or "session").',
          },
          expected: {
            type: 'string',
            description: 'Expected value for action "assert".',
          },
          target: {
            type: 'string',
            description: 'Target CSS selector for action "assert".',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds for wait_for, assert, or wait_for_download (default 10000; wait_for_download default 30000).',
          },
          fields: {
            type: 'object',
            description: 'For fill_form: an object mapping ref handles to values, e.g. {"ref_3": "hello", "ref_5": "world"}.',
          },
          expression: {
            type: 'string',
            description: 'JavaScript expression to evaluate in the page context for the evaluate action.',
          },
          steps: {
            type: 'array',
            items: { type: 'object' },
            description: 'For run_script: array of action objects to execute in sequence.',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'For upload_file: absolute file paths to set on the file input named by ref. Use file_dialog to get real paths from the user first — do not invent paths.',
          },
          limit: {
            type: 'number',
            description: 'For action "network": how many recent requests to return (default 50, max 200). For "list_downloads": how many recent downloads to return.',
          },
        },
        required: ['action'],
      },
    },
  },

  async execute({ action: rawAction, url, ref, x, y, text, submit, confirmed = false, clear, keys, amount, tabId, display, selector, type, expected, target, timeout, fields, expression, steps, value, files, limit, _depth = 0 } = {}, opts = {}) {
    const b = bridge()
    if (!b) return DESKTOP_ONLY
    const base = await ctx(display, opts?.ctx)
    // MEASURED: the model called `refresh` and `go_back`, got "Unsupported
    // action", and concluded the tool was broken. Both are the obvious names
    // for actions that exist — refusing them teaches nothing and costs a turn.
    // These are ALIASES, and none of them shadows a real action, which is the
    // rule that the `watch` collision established.
    const action = ACTION_ALIASES[rawAction] || rawAction

    /**
     * A stale ref is refused — correctly, because clicking whatever now sits at
     * that index looks exactly like success. But refusing alone costs TWO more
     * turns: one to read again, one to retry. The page is right there, so hand
     * back the fresh tree with the refusal and the model recovers in one.
     *
     * Only for refs. A stale COORDINATE is not a thing, and re-reading after an
     * ordinary failure would spend a page read on every unrelated error.
     */
    const withFreshTree = async (res) => {
      if (!res?.stale || !b.read) return res
      try {
        const page = await b.read({ ...base, tabId })
        const tree = page?.tree || page?.text
        if (!tree) return res
        return { ...res, page_after_reload: tree, note: 'The page was re-read for you — use the refs below and retry.' }
      } catch { return res }
    }

    try {
      switch (action) {
        case 'navigate':
          if (!url) return { success: false, error: 'url is required to navigate' }
          return { tool: 'browser_control', action, ...(await b.navigate({ ...base, url, tabId })) }
        case 'read':
          return { tool: 'browser_control', action, ...(await b.read({ ...base, tabId })) }
        case 'click':
        case 'double_click':
        case 'right_click':
          return {
            tool: 'browser_control', action,
            ...(await withFreshTree(await b.click({
              ...base, tabId, ref, x, y,
              button: action === 'right_click' ? 'right' : 'left',
              double: action === 'double_click',
            }))),
          }
        case 'hover':
          // NEVER fall back to click. Hover is the read-only action — it is how
          // a menu is opened or a tooltip revealed without committing to
          // anything — and clicking instead can navigate, submit or purchase.
          // Substituting a side-effectful action for a safe one and reporting
          // success is the worst possible failure mode for an agent driving a
          // real browser with the user's logged-in sessions.
          if (!b.hover) return { success: false, error: 'hover is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.hover({ ...base, tabId, ref, x, y })) }
        case 'type':
          if (typeof text !== 'string') return { success: false, error: 'text is required to type' }
          if (submit && !confirmed) {
            return {
              success: false,
              requires_confirmation: true,
              error: 'Typing is ready, but pressing Enter can submit this form. Ask the user for confirmation, then retry with confirmed:true.',
            }
          }
          // `clear` defaults to true when a field is named by ref, because
          // "type X into ref_4" means fill that field — and appending to
          // whatever was already there produced values like
          // "londonnew york" with no error anywhere. Pass clear:false for the
          // append-to-existing case.
          return {
            tool: 'browser_control', action,
            ...(await withFreshTree(await b.type({ ...base, tabId, ref, text, submit, clear: clear ?? !!ref }))),
          }
        case 'select': {
          // A <select> cannot be driven by typing: characters go nowhere and
          // the tool reported success, so every form with a country, quantity
          // or date dropdown was silently unfillable. It needs a real
          // value-set plus input/change events, which is what the bridge does.
          if (!b.select) return { success: false, error: 'select is not supported by this browser bridge version' }
          const wanted = value ?? text
          if (!ref && !selector) return { success: false, error: 'ref or selector is required to select an option' }
          if (wanted == null || wanted === '') return { success: false, error: 'value is required — the option value, its visible label, or its index' }
          return { tool: 'browser_control', action, ...(await withFreshTree(await b.select({ ...base, tabId, ref, selector, value: String(wanted) }))) }
        }
        case 'upload_file': {
          // A file input has no settable .value from outside the page (browsers
          // refuse it) — this is not something `type` can be made to cover.
          if (!b.upload) return { success: false, error: 'file upload is not supported by this browser bridge version' }
          if (!ref) return { success: false, error: 'ref is required — read the page first and pass the file input\'s ref' }
          if (!Array.isArray(files) || !files.length) {
            return { success: false, error: 'files is required — an array of absolute file paths. Use file_dialog to let the user pick real files first; do not invent paths.' }
          }
          return { tool: 'browser_control', action, ...(await withFreshTree(await b.upload({ ...base, tabId, ref, files }))) }
        }
        case 'network':
          if (!b.network) return { success: false, error: 'network inspection is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.network({ ...base, tabId, limit })) }
        case 'key':
          if (!keys) return { success: false, error: 'keys is required' }
          if (/^(enter|return)$/i.test(String(keys).trim()) && !confirmed) {
            return {
              success: false,
              requires_confirmation: true,
              error: 'Enter may submit the focused form. Ask the user for confirmation, then retry with confirmed:true.',
            }
          }
          return { tool: 'browser_control', action, ...(await b.key({ ...base, tabId, keys })) }
        case 'scroll':
          return { tool: 'browser_control', action, ...(await b.scroll({ ...base, tabId, ref, amount })) }
        case 'screenshot':
          return { tool: 'browser_control', action, ...(await b.screenshot({ ...base, tabId, ref, selector })) }
        case 'pdf':
          if (!b.pdf) return { success: false, error: 'pdf export is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.pdf({ ...base, tabId })) }
        case 'cookies':
          if (!b.cookies) return { success: false, error: 'cookies management is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.cookies({ ...base, tabId, ...fields })) }
        case 'storage':
          if (!b.storage) return { success: false, error: 'storage inspection is not supported by this browser bridge version' }
          // Read `type` FIRST. This took the store name from `text`, so the
          // obvious call — {action:'storage', type:'session'} — silently
          // returned localStorage and the model reported the wrong data as
          // fact. `text` is still accepted so existing calls keep working.
          return { tool: 'browser_control', action, ...(await b.storage({ ...base, tabId, type: type || text || 'local' })) }
        case 'new_tab':
          return { tool: 'browser_control', action, ...(await b.newTab({ ...base, url })) }
        case 'list_tabs':
          return { tool: 'browser_control', action, ...(await b.listTabs(base)) }
        case 'select_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.selectTab({ ...base, tabId })) }
        case 'close_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.closeTab({ ...base, tabId })) }
        case 'back':
        case 'forward':
          return { tool: 'browser_control', action, ...(await b.history({ ...base, tabId, direction: action })) }
        case 'reload':
          return { tool: 'browser_control', action, ...(await b.reload({ ...base, tabId })) }
        case 'diagnose':
          return { tool: 'browser_control', action, ...(await b.diagnose({ ...base, tabId, url, timeout })) }
        case 'console':
          return { tool: 'browser_control', action, ...(await b.consoleLogs({ ...base, tabId })) }
        case 'assert':
          if (!b.assert) return { success: false, error: 'assert is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.assert({ ...base, tabId, type, target, expected, timeout })) }
        case 'audit_a11y':
          if (!b.auditA11y) return { success: false, error: 'audit_a11y is not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.auditA11y({ ...base, tabId })) }
        case 'run_script': {
          const scriptSteps = Array.isArray(steps) ? steps : []
          if (!scriptSteps.length) return { success: false, error: 'steps array is required for run_script' }
          // A step may itself be a run_script. Without this the tool recurses
          // until the stack blows — and a model that emits a nested pipeline is
          // not doing anything unreasonable, it just wrote the obvious thing.
          if (_depth > 0) {
            return { success: false, error: 'run_script cannot be nested. Flatten the steps into one list.' }
          }
          const stepResults = []
          for (let i = 0; i < scriptSteps.length; i++) {
            const step = scriptSteps[i]
            // opts carries the calling chat's ctx; a nested step that dropped it
            // would fall back to the ambient chat mid-script.
            const stepRes = await browserControlTool.execute({
              ...step,
              display: display || base.display,
              // A confirmed outer pipeline carries the user's explicit
              // approval into its submit step, unless that step says otherwise.
              confirmed: step.confirmed ?? confirmed,
              _depth: _depth + 1,
            }, opts)
            stepResults.push({ step: i + 1, action: step.action, ...stepRes })
            if (stepRes.success === false) {
              return {
                tool: 'browser_control',
                action: 'run_script',
                success: false,
                error: `Step ${i + 1} (${step.action}) failed: ${stepRes.error}`,
                completedSteps: i,
                results: stepResults,
              }
            }
          }
          return { tool: 'browser_control', action: 'run_script', success: true, totalSteps: scriptSteps.length, results: stepResults }
        }
        case 'set_mode':
          if (!display) return { success: false, error: 'display is required: "window" or "panel"' }
          return { tool: 'browser_control', action, ...(await b.setMode(base)) }
        case 'close':
          return { tool: 'browser_control', action, ...(await b.close(base)) }
        case 'wait_for': {
          if (!selector && !ref) return { success: false, error: 'selector or ref is required for wait_for' }
          const waitTimeout = Math.min(Math.max(1000, timeout || 10000), 30000)
          try {
            if (b.waitFor) {
              return { tool: 'browser_control', action, ...(await b.waitFor({ ...base, tabId, selector, ref, timeout: waitTimeout })) }
            }
            // Fallback for a bridge without waitFor. This matches the selector
            // against the ACCESSIBILITY TREE, which is not the DOM — a CSS
            // selector essentially never appears in it, so this used to poll
            // for ten seconds and report a timeout for an element that was
            // right there. `ref` is the only thing it can honestly find.
            const start = Date.now()
            while (Date.now() - start < waitTimeout) {
              const page = await b.read({ ...base, tabId })
              const tree = page?.tree || page?.text || ''
              if (ref && tree.includes(ref)) return { tool: 'browser_control', action, success: true, found: ref }
              await new Promise(r => setTimeout(r, 500))
            }
            return {
              success: false,
              error: ref
                ? `Timed out after ${waitTimeout}ms waiting for ${ref}.`
                : 'This browser build cannot wait on a CSS selector. Use action "read" and wait on a ref instead.',
            }
          } catch (e) {
            return { success: false, error: e?.message || String(e) }
          }
        }
        case 'fill_form': {
          if (!fields || typeof fields !== 'object') return { success: false, error: 'fields object is required for fill_form, e.g. {"ref_3": "value"}' }
          const results = []
          for (const [fieldRef, fieldValue] of Object.entries(fields)) {
            try {
              // clear:true — filling a form means setting each field to the
              // given value, not appending to whatever the page had prefilled.
              const r = await b.type({ ...base, tabId, ref: fieldRef, text: String(fieldValue), submit: false, clear: true })
              results.push({ ref: fieldRef, success: r?.success !== false, error: r?.error })
            } catch (e) {
              results.push({ ref: fieldRef, success: false, error: e?.message })
            }
          }
          // This returned success:true unconditionally, so a form where EVERY
          // field failed reported as filled and the model went on to submit it.
          const failed = results.filter(r => !r.success)
          return {
            tool: 'browser_control', action,
            success: failed.length === 0,
            filled: results,
            ...(failed.length ? {
              error: `${failed.length} of ${results.length} fields could not be filled: ${failed.map(f => f.ref).join(', ')}. `
                + 'Re-read the page — the refs may be stale.',
            } : {}),
          }
        }
        case 'evaluate': {
          if (!expression) return { success: false, error: 'expression is required for evaluate' }
          if (b.evaluate) {
            return { tool: 'browser_control', action, ...(await b.evaluate({ ...base, tabId, expression })) }
          }
          return { success: false, error: 'evaluate is not supported by this browser bridge version' }
        }
        case 'extract_text': {
          // Read the rendered DOM HTML and run readability extraction on it
          try {
            let html = ''
            if (b.getPageHtml) {
              // Returns an OBJECT, not a bare string. Treating the object as
              // the HTML would make `html.length < 100` false and hand
              // "[object Object]" to the extractor.
              const res = await b.getPageHtml({ ...base, tabId })
              if (res?.success === false) return { success: false, error: res.error }
              html = res?.html || ''
            } else if (b.evaluate) {
              const result = await b.evaluate({ ...base, tabId, expression: 'document.documentElement.outerHTML' })
              html = result?.result || result?.value || ''
            } else {
              return { success: false, error: 'extract_text needs getPageHtml or evaluate support in the browser bridge' }
            }
            if (!html || html.length < 100) return { success: false, error: 'No HTML could be read from the page' }
            const page = extractReadable(html, { maxChars: 12000 })
            return {
              tool: 'browser_control', action, success: true,
              title: page.title,
              text: page.text,
              words: page.words,
              tables: page.tables,
              code_blocks: page.code_blocks,
              json_ld: page.json_ld,
              images: page.images,
            }
          } catch (e) {
            return { success: false, error: `extract_text failed: ${e?.message || e}` }
          }
        }
        case 'zoom_in':
        case 'zoom_out':
        case 'zoom_reset': {
          // The action name doubles as the direction — same pattern as
          // 'back'/'forward' above (b.history({direction: action})), rather
          // than a single 'zoom' action with a direction param the model
          // would have to get right on top of picking the action.
          if (!b.zoom) return { success: false, error: 'zoom is not supported by this browser bridge version' }
          const direction = action === 'zoom_in' ? 'in' : action === 'zoom_out' ? 'out' : 'reset'
          return { tool: 'browser_control', action, ...(await b.zoom({ ...base, tabId, direction })) }
        }
        case 'find_text': {
          if (!b.find) return { success: false, error: 'find is not supported by this browser bridge version' }
          if (!text || !text.trim()) return { success: false, error: 'text is required for find_text' }
          // findNext:true on every call (including the first): a search for a
          // DIFFERENT string than the page's current find session starts a
          // fresh search anyway, and it is what lets calling find_text again
          // with the SAME text advance to the next match without a separate
          // "next" action or param the model would have to remember to set.
          return { tool: 'browser_control', action, ...(await b.find({ ...base, tabId, text, forward: true, findNext: true })) }
        }
        case 'list_downloads':
          if (!b.downloads) return { success: false, error: 'downloads are not supported by this browser bridge version' }
          return { tool: 'browser_control', action, ...(await b.downloads({ ...base, limit })) }
        case 'wait_for_download': {
          if (!b.downloads) return { success: false, error: 'downloads are not supported by this browser bridge version' }
          const waitTimeout = Math.min(Math.max(1000, timeout || 30000), 120000)
          const started = Date.now()
          const filter = String(text || '').trim().toLowerCase()
          const matches = (d) => !filter || (d.filename || '').toLowerCase().includes(filter)
          let sawAny = false
          while (Date.now() - started < waitTimeout) {
            const res = await b.downloads({ ...base, limit: 20 })
            // The bridge lists newest-first, so [0] of the filtered set is the
            // download this call almost certainly means.
            const d = (res?.downloads || []).filter(matches)[0]
            if (d) {
              sawAny = true
              if (d.state === 'completed') {
                return {
                  tool: 'browser_control', action, success: true,
                  filename: d.filename, savePath: d.savePath, bytes: d.receivedBytes, state: d.state,
                  note: 'Use fs_read with this savePath to open the downloaded file.',
                }
              }
              if (d.state === 'cancelled' || d.state === 'interrupted') {
                return { success: false, error: `Download ${d.state}: ${d.filename}`, filename: d.filename, state: d.state }
              }
              // 'progressing' — keep polling.
            }
            await new Promise(r => setTimeout(r, 400))
          }
          return {
            success: false,
            error: sawAny
              ? `The download did not finish within ${waitTimeout}ms.`
              : (filter
                ? `No download matching "${text}" was seen. Make sure the click that starts the download already happened.`
                : 'No download was seen. Make sure the click that starts the download already happened.'),
          }
        }
        default:
          // NAME THE ALTERNATIVES. "Unsupported action: go_back" gives the
          // model nothing to correct with, so it retries variations or
          // abandons the tool. The list is what lets it recover in one step.
          return {
            success: false,
            error: `Unsupported action: ${rawAction}. Valid actions are: ${VALID_ACTIONS.join(', ')}.`,
            valid_actions: VALID_ACTIONS,
          }
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
