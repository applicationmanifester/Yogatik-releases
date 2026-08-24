import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, File as FileIcon, FileCode, FileJson,
  FileText, Image as ImageIcon, RefreshCw, FolderPlus, FilePlus, Search, X, Loader2,
  Sparkles, ExternalLink, Trash2, Pencil, Copy,
} from 'lucide-react'
import { humanSize, extOf } from '../workspace/treeStore'
import { wsMkdir, wsWrite, wsDelete, wsMove } from '../tools/localFs'

/**
 * ExplorerPanel — the file tree.
 *
 * VIRTUALIZED, and not optionally: a granted root is routinely a repository
 * whose expanded tree is tens of thousands of rows, and React will happily
 * mount every one of them and then drop frames on every keystroke elsewhere in
 * the app. Only the visible slice is rendered; the rest is a spacer div.
 *
 * The rows come from treeStore.visibleRows, which is already flat — that is the
 * whole reason the store flattens instead of handing back a nested structure.
 */

const ROW_H = 22
const OVERSCAN = 12

const ICON_BY_EXT = {
  js: FileCode, jsx: FileCode, ts: FileCode, tsx: FileCode, mjs: FileCode, cjs: FileCode,
  py: FileCode, rs: FileCode, go: FileCode, java: FileCode, c: FileCode, h: FileCode,
  cpp: FileCode, cs: FileCode, rb: FileCode, php: FileCode, sh: FileCode, bat: FileCode,
  css: FileCode, scss: FileCode, html: FileCode, vue: FileCode, svelte: FileCode,
  json: FileJson, jsonc: FileJson, lock: FileJson,
  md: FileText, mdx: FileText, txt: FileText, log: FileText, csv: FileText,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon, gif: ImageIcon, svg: ImageIcon,
  webp: ImageIcon, ico: ImageIcon, avif: ImageIcon,
}

function iconFor(row) {
  if (row.kind !== 'file') return row.expanded ? FolderOpen : Folder
  return ICON_BY_EXT[extOf(row.name)] || FileIcon
}

const GIT_LABEL = { M: 'Modified', A: 'Added / staged', D: 'Deleted', R: 'Renamed', U: 'Untracked' }

export function ExplorerPanel({
  tree,                 // useWorkspaceTree() return value
  onOpenFile,           // (row) => void
  onAddFolder,          // () => void
  activePath = null,    // node id of the file open in the editor
}) {
  const { state, rows, toggleDir, refreshDir, refreshRoots, selectNode, setFilter } = tree
  const scrollerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)
  const [menu, setMenu] = useState(null)          // { x, y, row }
  const [draft, setDraft] = useState(null)        // { kind:'file'|'folder'|'rename', row, value }
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  /* ── viewport measurement ─────────────────────────────────────────────── */
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 480))
    ro.observe(el)
    setViewportH(el.clientHeight || 480)
    return () => ro.disconnect()
  }, [])

  const total = rows.length
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const count = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2
  const slice = useMemo(() => rows.slice(first, first + count), [rows, first, count])

  /* ── close the context menu on any outside interaction ────────────────── */
  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  const say = useCallback((text, tone = 'info') => {
    setNotice({ text, tone })
    setTimeout(() => setNotice(n => (n?.text === text ? null : n)), 4000)
  }, [])

  /* ── row activation ───────────────────────────────────────────────────── */
  const activate = useCallback((row) => {
    selectNode(row.id)
    if (row.kind === 'file') onOpenFile?.(row)
    else toggleDir(row)
  }, [onOpenFile, selectNode, toggleDir])

  /* ── keyboard: the tree is a real listbox, not a pile of divs ─────────── */
  const onKeyDown = useCallback((e) => {
    const idx = rows.findIndex(r => r.id === state.selectedId)
    const move = (delta) => {
      const next = rows[Math.min(rows.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta))]
      if (!next) return
      selectNode(next.id)
      const target = rows.indexOf(next) * ROW_H
      const el = scrollerRef.current
      if (!el) return
      if (target < el.scrollTop) el.scrollTop = target
      else if (target + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = target + ROW_H - el.clientHeight
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); activate(rows[idx]) }
    else if (e.key === 'ArrowRight' && idx >= 0 && rows[idx].kind !== 'file' && !rows[idx].expanded) {
      e.preventDefault(); toggleDir(rows[idx])
    } else if (e.key === 'ArrowLeft' && idx >= 0 && rows[idx].kind !== 'file' && rows[idx].expanded) {
      e.preventDefault(); toggleDir(rows[idx])
    }
  }, [rows, state.selectedId, selectNode, activate, toggleDir])

  /* ── mutations ────────────────────────────────────────────────────────── */

  const dirOf = (row) => (row.kind === 'file'
    ? row.path.split('/').slice(0, -1).join('/')
    : row.path)

  const commitDraft = useCallback(async () => {
    if (!draft) return
    const name = draft.value.trim()
    if (!name) { setDraft(null); return }
    setBusy(true)
    try {
      if (draft.kind === 'rename') {
        const parent = draft.row.path.split('/').slice(0, -1).join('/')
        const dest = parent ? `${parent}/${name}` : name
        await wsMove(draft.row.path, dest)
        say(`Renamed to ${name}`)
        refreshDir(draft.row.rootId, parent)
      } else {
        const base = dirOf(draft.row)
        const target = base ? `${base}/${name}` : name
        if (draft.kind === 'folder') await wsMkdir(target)
        else await wsWrite(target, '')
        say(`Created ${name}`)
        refreshDir(draft.row.rootId, base)
      }
    } catch (e) {
      say(e?.message || String(e), 'error')
    } finally {
      setBusy(false)
      setDraft(null)
    }
  }, [draft, refreshDir, say])

  const remove = useCallback(async (row) => {
    // Deliberately a plain confirm and not a bespoke modal: this is destructive,
    // it is rare, and the undo journal snapshots the target first — so the
    // recovery path is `fs_undo` / the Journal tab, not a prettier dialog.
    const label = row.kind === 'file' ? 'file' : 'folder and everything in it'
    if (!window.confirm(`Delete the ${label} "${row.name}"?\n\nIt is snapshotted first, so it can be restored from the Journal tab.`)) return
    setBusy(true)
    try {
      await wsDelete(row.path, { recursive: row.kind !== 'file' })
      say(`Deleted ${row.name}`)
      refreshDir(row.rootId, row.path.split('/').slice(0, -1).join('/'))
    } catch (e) {
      say(e?.message || String(e), 'error')
    } finally { setBusy(false) }
  }, [refreshDir, say])

  const revealInOs = useCallback((row) => {
    const abs = row.absPath || row.path
    try { window.__YOGATIK_DESKTOP__?.showItemInFolder?.(abs) } catch { /* not desktop */ }
  }, [])

  const copyPath = useCallback((row) => {
    const abs = row.absPath || row.path
    try { navigator.clipboard?.writeText(abs) ; say('Path copied') } catch { /* denied */ }
  }, [say])

  /* ── render ───────────────────────────────────────────────────────────── */

  if (!state.roots.length) {
    return (
      <div className="ws-empty">
        <Folder size={26} />
        <p>No folder open</p>
        <span>Grant a working folder and this chat — and the agent — can read, edit and track it.</span>
        <button className="ws-primary-btn" onClick={onAddFolder}>Open Folder</button>
      </div>
    )
  }

  return (
    <div className="ws-explorer">
      <div className="ws-toolbar">
        <div className="ws-search">
          <Search size={12} />
          <input
            value={state.filter}
            placeholder="Filter open folders…"
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter files"
          />
          {state.filter && (
            <button className="icon-btn" onClick={() => setFilter('')} aria-label="Clear filter"><X size={11} /></button>
          )}
        </div>
        <button className="icon-btn" title="New file" aria-label="New file"
          onClick={() => setDraft({ kind: 'file', row: rows.find(r => r.id === state.selectedId) || rows[0], value: '' })}>
          <FilePlus size={13} />
        </button>
        <button className="icon-btn" title="New folder" aria-label="New folder"
          onClick={() => setDraft({ kind: 'folder', row: rows.find(r => r.id === state.selectedId) || rows[0], value: '' })}>
          <FolderPlus size={13} />
        </button>
        <button className="icon-btn" title="Refresh" aria-label="Refresh" onClick={refreshRoots}><RefreshCw size={13} /></button>
        <button className="icon-btn" title="Add folder" aria-label="Add folder" onClick={onAddFolder}><Folder size={13} /></button>
      </div>

      {state.filter && (
        <div className="ws-hint">
          Filtering folders already opened. Ask the agent to <code>fs_find_files</code> to search the whole tree.
        </div>
      )}

      <div
        className="ws-tree"
        ref={scrollerRef}
        role="tree"
        tabIndex={0}
        aria-label="Workspace files"
        onKeyDown={onKeyDown}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: total * ROW_H, position: 'relative' }}>
          <div style={{ position: 'absolute', top: first * ROW_H, left: 0, right: 0 }}>
            {slice.map(row => {
              const Icon = iconFor(row)
              const dec = row.decoration
              const badge = dec?.git
              const rolled = !badge && (dec?.gitDescendants || 0) > 0
              const agent = dec?.agent || (dec?.agentDescendants || 0) > 0
              const isActive = activePath && activePath === row.id
              return (
                <div
                  key={row.id}
                  role="treeitem"
                  aria-selected={!!row.selected}
                  aria-expanded={row.kind === 'file' ? undefined : !!row.expanded}
                  aria-level={row.depth + 1}
                  className={[
                    'ws-row',
                    row.selected ? 'selected' : '',
                    isActive ? 'active' : '',
                    badge ? `git-${badge}` : (rolled ? 'git-roll' : ''),
                  ].filter(Boolean).join(' ')}
                  style={{ height: ROW_H, paddingLeft: 4 + row.depth * 12 }}
                  onClick={() => activate(row)}
                  onDoubleClick={() => row.kind !== 'file' && toggleDir(row)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    selectNode(row.id)
                    setMenu({ x: e.clientX, y: e.clientY, row })
                  }}
                  title={row.absPath || row.path}
                >
                  <span className="ws-chev">
                    {row.kind === 'file' ? null
                      : row.loading ? <Loader2 size={11} className="ws-spin" />
                        : row.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <Icon size={13} className="ws-icon" />
                  <span className="ws-name">{row.name}</span>
                  {agent && <Sparkles size={10} className="ws-agent-mark" title="Changed by the agent this session" />}
                  {badge && <span className="ws-badge" title={GIT_LABEL[badge] || badge}>{badge}</span>}
                  {rolled && <span className="ws-badge dot" title={`${dec.gitDescendants} changed inside`}>•</span>}
                  {row.kind === 'file' && row.size > 0 && (
                    <span className="ws-size">{humanSize(row.size)}</span>
                  )}
                  {row.error && <span className="ws-badge err" title={row.error}>!</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {draft && (
        <div className="ws-draft">
          <span>{draft.kind === 'rename' ? 'Rename to' : draft.kind === 'folder' ? 'New folder in' : 'New file in'}</span>
          <code>{draft.kind === 'rename' ? draft.row?.name : (dirOf(draft.row || {}) || '/')}</code>
          <input
            autoFocus
            value={draft.value}
            disabled={busy}
            onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDraft()
              if (e.key === 'Escape') setDraft(null)
            }}
          />
          <button className="ws-primary-btn sm" onClick={commitDraft} disabled={busy}>Create</button>
          <button className="icon-btn" onClick={() => setDraft(null)} aria-label="Cancel"><X size={12} /></button>
        </div>
      )}

      {notice && <div className={`ws-notice ${notice.tone}`}>{notice.text}</div>}

      {menu && (
        <div
          className="ws-menu"
          style={{ left: Math.min(menu.x, (window.innerWidth || 900) - 210), top: menu.y }}
          onClick={e => e.stopPropagation()}
          role="menu"
        >
          {menu.row.kind === 'file' && (
            <button role="menuitem" onClick={() => { onOpenFile?.(menu.row); setMenu(null) }}>
              <FileCode size={12} /> Open in editor
            </button>
          )}
          <button role="menuitem" onClick={() => { setDraft({ kind: 'file', row: menu.row, value: '' }); setMenu(null) }}>
            <FilePlus size={12} /> New file
          </button>
          <button role="menuitem" onClick={() => { setDraft({ kind: 'folder', row: menu.row, value: '' }); setMenu(null) }}>
            <FolderPlus size={12} /> New folder
          </button>
          <div className="ws-menu-sep" />
          {menu.row.kind !== 'root' && (
            <button role="menuitem" onClick={() => { setDraft({ kind: 'rename', row: menu.row, value: menu.row.name }); setMenu(null) }}>
              <Pencil size={12} /> Rename
            </button>
          )}
          <button role="menuitem" onClick={() => { copyPath(menu.row); setMenu(null) }}>
            <Copy size={12} /> Copy path
          </button>
          <button role="menuitem" onClick={() => { revealInOs(menu.row); setMenu(null) }}>
            <ExternalLink size={12} /> Reveal in file manager
          </button>
          <button role="menuitem" onClick={() => { refreshDir(menu.row.rootId, menu.row.kind === 'file' ? dirOf(menu.row) : menu.row.path); setMenu(null) }}>
            <RefreshCw size={12} /> Refresh
          </button>
          {menu.row.kind !== 'root' && (
            <>
              <div className="ws-menu-sep" />
              <button role="menuitem" className="danger" onClick={() => { remove(menu.row); setMenu(null) }}>
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ExplorerPanel
