import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Map as MapIcon, Loader2, Copy, FolderTree } from 'lucide-react'
import { wsCodebaseMap } from '../tools/localFs'

/**
 * CodebaseMapPanel — the human-facing half of fs_codebase_map.
 *
 * Before this the map existed only as a tool: real, tested, useful to the
 * agent, and invisible to the person sitting in front of it — exactly the
 * "finished capability nothing renders" gap this codebase has hit before
 * (StreamingMessage behind a comment, Tour behind a button label, five whole
 * panels that were never wired into the command palette). This shows the
 * SAME map the model gets, so it doubles as a way to see what the agent
 * currently believes the codebase looks like, and as a fast way for a human
 * to skim an unfamiliar repo's exports without opening every file.
 *
 * Auto-loads on mount from cache (cheap — the backing IPC returns instantly
 * if a map was already built, and this panel is usually opened AFTER the
 * agent already asked for one). It does not auto-BUILD on a folder that has
 * never been mapped — that would spend real disk/CPU on a tab a person
 * opened out of curiosity; the "Build map" button is the explicit ask.
 */
export function CodebaseMapPanel({ root }) {
  const [state, setState] = useState('idle') // idle | loading | ready | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const attemptedAutoLoad = useRef(false)

  const load = useCallback(async ({ forceRefresh = false } = {}) => {
    setState('loading')
    setError(null)
    try {
      const res = await wsCodebaseMap({ forceRefresh })
      setResult(res)
      setState('ready')
    } catch (e) {
      setError(e?.message || String(e))
      setState('error')
    }
  }, [])

  // One quiet, cache-only attempt per mount — a forceRefresh:false call costs
  // nothing when nothing is cached yet (it just builds once, same as the
  // agent's own first call would), so this is not a second class of "opened
  // this tab and it did expensive work with no ask" — it is the SAME cost the
  // agent already pays the first time anyone asks about this codebase.
  useEffect(() => {
    if (attemptedAutoLoad.current) return
    attemptedAutoLoad.current = true
    load()
  }, [load])

  const copyMap = useCallback(() => {
    if (!result?.map) return
    try {
      navigator.clipboard?.writeText(result.map)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard denied */ }
  }, [result])

  return (
    <div className="ws-codemap">
      <div className="ws-codemap-toolbar">
        <FolderTree size={12} />
        <span className="ws-codemap-title" title={root || ''}>
          {root ? root.split(/[/\\]/).filter(Boolean).pop() : 'Codebase map'}
        </span>
        <div className="ws-spacer" />
        {result && (
          <button className="icon-btn" title="Copy map" aria-label="Copy map" onClick={copyMap}>
            <Copy size={13} />
          </button>
        )}
        <button
          className="icon-btn"
          title="Rebuild (ignores the cache)"
          aria-label="Rebuild map"
          disabled={state === 'loading'}
          onClick={() => load({ forceRefresh: true })}
        >
          <RefreshCw size={13} className={state === 'loading' ? 'ws-spin' : ''} />
        </button>
      </div>

      {state === 'loading' && (
        <div className="ws-empty">
          <Loader2 size={22} className="ws-spin" />
          <p>Mapping the codebase…</p>
          <span>Reading top-level exports across the workspace. Cached after this, so this only takes a moment on repeat visits.</span>
        </div>
      )}

      {state === 'error' && (
        <div className="ws-empty">
          <MapIcon size={22} />
          <p>Could not build a map</p>
          <span>{error}</span>
          <button className="ws-primary-btn" onClick={() => load({ forceRefresh: true })}>Try again</button>
        </div>
      )}

      {state === 'ready' && result && (
        <>
          <div className="ws-codemap-stats">
            <span>{result.mappedFiles} of {result.totalSourceFiles} source file{result.totalSourceFiles === 1 ? '' : 's'} mapped</span>
            {result.cached && <span className="ws-badge dot" title="Served from cache">cached</span>}
            {result.partial && <span className="ws-badge err" title="Truncated — see the note at the end of the map">truncated</span>}
          </div>
          <pre className="ws-codemap-body">{result.map || '(no source files found)'}</pre>
          {copied && <div className="ws-notice info">Copied</div>}
        </>
      )}
    </div>
  )
}

export default CodebaseMapPanel
