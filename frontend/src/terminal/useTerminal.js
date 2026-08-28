// The React seam between terminalStore (module state) and the desktop bridge.
// Wiring only — everything decidable without a browser lives in the store.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as store from './terminalStore'
import { getWorkspaceCtx, isDesktop } from '../tools/localFs'

const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_TERMINAL__) || null

let streamStarted = false

/**
 * Subscribe to the terminal stream for the WHOLE APP LIFETIME, once.
 *
 * This deliberately does not live in the hook. The hook mounts with the drawer,
 * and an agent command that runs while the drawer is CLOSED is exactly the case
 * this feature exists for — with the subscription inside the hook, the header's
 * live indicator could never light up and opening the drawer afterwards would
 * show an empty timeline. App calls this on mount.
 */
export function startTerminalStream() {
  const b = bridge()
  if (streamStarted || !b?.onBlock) return () => {}
  streamStarted = true
  const offBlock = b.onBlock(({ chatId, block }) => {
    if (block) store.upsertBlock(String(chatId ?? ''), block)
  })
  const offOut = b.onOutput(({ chatId, blockId, chunk }) => {
    store.appendOutput(String(chatId ?? ''), blockId, chunk)
  })
  return () => { streamStarted = false; offBlock?.(); offOut?.() }
}

export function useTerminal({ conversationId, enabled = true } = {}) {
  const chatId = String(conversationId ?? '')
  const [ptyAvailable, setPtyAvailable] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const historyRef = useRef([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const getSnapshot = useCallback(() => store.getBlocks(chatId), [chatId])
  const getServerSnapshot = useCallback(() => store.getBlocks(chatId), [chatId])

  // useSyncExternalStore is the correct primitive here: the store is external,
  // mutable and notified imperatively, and this is what keeps React from
  // tearing between a render and a chunk that arrives mid-render.
  const blocks = useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  /**
   * Load the whole timeline, INCLUDING everything the agent ran before the
   * drawer was opened. That backlog is the entire point — the previous panel
   * spawned a fresh shell on open and could never show what had already
   * happened.
   */
  const load = useCallback(async () => {
    const b = bridge()
    if (!enabled || !isDesktop() || !b?.session) return
    try {
      const res = await b.session(getWorkspaceCtx())
      if (!res?.success) { setError(res?.error || null); return }
      store.setSession(chatId, res.blocks || [])
      setPtyAvailable(!!res.ptyAvailable)
      setError(null)
    } catch (e) { setError(e?.message || String(e)) }
  }, [chatId, enabled])

  useEffect(() => { load() }, [load])

  // The stream itself is started once by App, not here — see
  // startTerminalStream. Calling it again is a no-op and keeps the hook usable
  // on its own in a test.
  useEffect(() => { startTerminalStream() }, [])

  const run = useCallback(async (command) => {
    const b = bridge()
    const cmd = String(command || '').trim()
    if (!cmd || !b?.run) return
    historyRef.current = [cmd, ...historyRef.current.filter(c => c !== cmd)].slice(0, 100)
    setHistoryIndex(-1)
    setBusy(true)
    try {
      const res = await b.run({ ctx: getWorkspaceCtx(), command: cmd })
      // The block already arrived over the stream; only a hard refusal (no
      // folder granted, locked capability) needs surfacing here.
      if (res?.error && !res.block) setError(res.error)
    } catch (e) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }, [])

  /** Interrupt a running block — the agent's included. */
  const stop = useCallback(async (id) => {
    const b = bridge()
    if (!b?.stop) return
    try { await b.stop(id) } catch { /* it finished between render and click */ }
  }, [])

  const clear = useCallback(async () => {
    const b = bridge()
    if (!b?.clear) return
    try {
      const res = await b.clear(getWorkspaceCtx())
      // Running blocks survive a clear, so trust main's answer rather than
      // emptying locally and losing the Stop button for a live command.
      store.setSession(chatId, res?.blocks || [])
    } catch { /* ignore */ }
  }, [chatId])

  /** Shell history on ↑/↓, scoped to what the HUMAN typed. */
  const recall = useCallback((direction) => {
    const h = historyRef.current
    if (!h.length) return null
    const next = direction === 'up'
      ? Math.min(historyIndex + 1, h.length - 1)
      : Math.max(historyIndex - 1, -1)
    setHistoryIndex(next)
    return next === -1 ? '' : h[next]
  }, [historyIndex])

  return {
    blocks,
    ptyAvailable,
    error,
    busy,
    agentBusy: store.agentIsBusy(chatId),
    run,
    stop,
    clear,
    recall,
    reload: load,
  }
}
