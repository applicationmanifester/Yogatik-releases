// The React seam between treeStore (pure) and the desktop bridge.
//
// Everything that can be reasoned about without a browser lives in treeStore.js;
// this file is only wiring: fetch a listing, subscribe to the watcher, coalesce
// bursts, refresh decorations. Keeping the split means the tree's behaviour is
// covered by fast node-env tests and only the plumbing is untested.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createTree, setRoots, setChildren, setLoading, setError, expand, select,
  setFilter, invalidateDir, applyFsChange, setDecorations, visibleRows,
  revealPath, nodeId, normPath, ROOT_PARENT,
} from './treeStore'
import { listRoots, wsList, gitStatus, listJournal, isDesktop } from '../tools/localFs'

// A `npm install` or a `git checkout` fires hundreds of watcher events in a
// second. Refetching per event would be hundreds of IPC round-trips and a
// tree that visibly thrashes; one coalesced pass per window is indistinguishable
// to the eye and costs one round-trip per affected folder.
const COALESCE_MS = 220
const DECORATION_MS = 1200

export function useWorkspaceTree({ enabled = true, conversationId = null } = {}) {
  const [state, setState] = useState(() => createTree([]))
  const stateRef = useRef(state)
  stateRef.current = state

  const pendingDirs = useRef(new Map())   // `${rootId}\0${dir}` -> {rootId, path}
  const coalesceTimer = useRef(null)
  const decorationTimer = useRef(null)
  const mounted = useRef(true)

  useEffect(() => () => {
    mounted.current = false
    clearTimeout(coalesceTimer.current)
    clearTimeout(decorationTimer.current)
  }, [])

  /* ── listings ─────────────────────────────────────────────────────────── */

  const loadDir = useCallback(async (rootId, dirPath) => {
    const rel = normPath(dirPath)
    setState(s => setLoading(s, rootId, rel, true))
    try {
      const rootAbs = stateRef.current.roots.find(r => r.id === rootId)?.path
      // The bridge takes a path relative to the chat's PRIMARY root. With more
      // than one root bound, a relative path is ambiguous — so a non-primary
      // root is addressed by its absolute path, which resolvePath accepts and
      // still containment-checks against the bindings.
      const primary = stateRef.current.roots.find(r => r.primary)?.id
      const arg = rootId === primary || !rootAbs
        ? rel
        : (rel ? `${rootAbs}/${rel}` : rootAbs)
      const entries = await wsList(arg)
      if (!mounted.current) return
      setState(s => setChildren(s, rootId, rel, entries, rootAbs))
    } catch (e) {
      if (!mounted.current) return
      setState(s => setError(s, rootId, rel, e?.message || String(e)))
    }
  }, [])

  const toggleDir = useCallback((row) => {
    const id = row.id
    const s = stateRef.current
    const willOpen = !s.expanded[id]
    setState(x => expand(x, id, willOpen))
    if (willOpen && !Array.isArray(s.children[id])) loadDir(row.rootId, row.path)
  }, [loadDir])

  const refreshDir = useCallback((rootId, dirPath) => {
    setState(s => invalidateDir(s, rootId, dirPath))
    loadDir(rootId, dirPath)
  }, [loadDir])

  /* ── roots ────────────────────────────────────────────────────────────── */

  const refreshRoots = useCallback(async () => {
    if (!enabled || !isDesktop()) return
    const roots = await listRoots()
    if (!mounted.current) return
    setState(s => {
      const next = setRoots(s, roots)
      // Auto-open the primary root: an explorer that opens showing one
      // collapsed line is a worse first impression than one extra listing.
      const primary = next.roots.find(r => r.primary) || next.roots[0]
      if (!primary) return next
      const rid = nodeId(primary.id, ROOT_PARENT)
      return next.expanded[rid] ? next : expand(next, rid, true)
    })
    const primary = roots.find(r => r.primary) || roots[0]
    if (primary) loadDir(String(primary.id ?? primary.path), ROOT_PARENT)
  }, [enabled, loadDir])

  useEffect(() => { refreshRoots() }, [refreshRoots, conversationId])

  /* ── decorations (git + agent journal) ────────────────────────────────── */

  const refreshDecorations = useCallback(async () => {
    if (!enabled || !isDesktop()) return
    const roots = stateRef.current.roots
    const primary = roots.find(r => r.primary) || roots[0]
    if (!primary) return

    const [git, journal] = await Promise.all([gitStatus(), listJournal()])
    if (!mounted.current) return

    const rootAbs = normPath(primary.path)
    // Journal targets are ABSOLUTE. Only the ones inside this root can be shown
    // against a tree row, and silently mapping the rest to a wrong row would be
    // worse than not decorating them.
    const agentPaths = (journal || [])
      .map(e => normPath(e.target))
      .filter(p => rootAbs && (p === rootAbs || p.startsWith(rootAbs + '/')))
      .map(p => p.slice(rootAbs.length + 1))
      .filter(Boolean)

    setState(s => setDecorations(s, {
      rootId: String(primary.id ?? primary.path),
      gitFiles: git?.success ? git.files : [],
      agentPaths,
    }))
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    refreshDecorations()
    return undefined
  }, [enabled, refreshDecorations, conversationId])

  const scheduleDecorations = useCallback(() => {
    clearTimeout(decorationTimer.current)
    decorationTimer.current = setTimeout(() => { refreshDecorations() }, DECORATION_MS)
  }, [refreshDecorations])

  /* ── watcher ──────────────────────────────────────────────────────────── */

  const flushPending = useCallback(() => {
    const jobs = [...pendingDirs.current.values()]
    pendingDirs.current.clear()
    // Decorations are scheduled by the change handler, which knows whether the
    // repository moved; scheduling them here too ran git status twice per burst.
    for (const job of jobs) loadDir(job.rootId, job.path)
  }, [loadDir])

  useEffect(() => {
    if (!enabled || !isDesktop()) return undefined
    const bridge = typeof window !== 'undefined' ? window.__YOGATIK_WATCHER__ : null
    if (!bridge?.start) return undefined

    let watchId = null
    let cancelled = false
    bridge.start('.', { recursive: true }).then(res => {
      if (cancelled) { if (res?.id) bridge.stop(res.id) ; return }
      watchId = res?.id || null
    }).catch(() => { /* no grant yet — refreshRoots will retry when there is one */ })

    const off = bridge.onChange?.((payload) => {
      const roots = stateRef.current.roots
      const primary = roots.find(r => r.primary) || roots[0]
      if (!primary) return
      const rootId = String(primary.id ?? primary.path)

      // The watcher now sends ONE message per window carrying every change in
      // it; `payload` alone is the first of them, kept for older consumers.
      const batch = Array.isArray(payload?.changes) && payload.changes.length
        ? payload.changes
        : [payload]

      // A `.git` write means the REPOSITORY moved, not that a file in the tree
      // did. Refetching a directory for it is pure waste; refreshing the
      // decorations is the whole point of forwarding it.
      let touchedTree = false
      let touchedGit = false
      let state = stateRef.current
      for (const change of batch) {
        if (change?.type === 'git') { touchedGit = true; continue }
        touchedTree = true
        const { state: next, refetch } = applyFsChange(state, rootId, change)
        state = next
        for (const job of refetch) pendingDirs.current.set(nodeId(job.rootId, job.path), job)
      }
      if (state !== stateRef.current) setState(state)

      if (touchedTree) {
        clearTimeout(coalesceTimer.current)
        coalesceTimer.current = setTimeout(flushPending, COALESCE_MS)
      }
      // git status on a large repo is 100–500ms and used to run after EVERY
      // burst. It runs when the repository actually moved, or when tree
      // content changed — but debounced, and never twice for one window.
      if (touchedGit || touchedTree) scheduleDecorations()
    })

    return () => {
      cancelled = true
      if (watchId) { try { bridge.stop(watchId) } catch { /* window closing */ } }
      if (typeof off === 'function') off()
    }
  }, [enabled, flushPending, scheduleDecorations])

  /* ── selection / reveal / filter ──────────────────────────────────────── */

  const selectNode = useCallback((id) => setState(s => select(s, id)), [])
  const applyFilter = useCallback((v) => setState(s => setFilter(s, v)), [])

  const reveal = useCallback(async (rootId, relPath) => {
    setState(s => revealPath(s, rootId, relPath))
    // Load every ancestor that has never been listed, outermost first, so the
    // revealed row actually exists by the time the list re-renders.
    const parts = normPath(relPath).split('/').filter(Boolean)
    let acc = ''
    await loadDir(rootId, ROOT_PARENT)
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      await loadDir(rootId, acc)
    }
  }, [loadDir])

  const rows = useMemo(() => visibleRows(state), [state])

  return {
    state,
    rows,
    loadDir,
    toggleDir,
    refreshDir,
    refreshRoots,
    refreshDecorations,
    selectNode,
    reveal,
    setFilter: applyFilter,
  }
}
