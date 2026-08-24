import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Files, GitBranch, Search, PanelLeftClose, Sparkles } from 'lucide-react'
import ExplorerPanel from './ExplorerPanel'
import ChangesPanel from './ChangesPanel'
import CodeEditorPane from './CodeEditorPane'
import WorkspaceSearch from './WorkspaceSearch'
import { useWorkspaceTree } from '../workspace/useWorkspaceTree'
import { loadCodeMirror } from '../workspace/codemirror'
import { addRoot, isDesktop } from '../tools/localFs'
import { nodeId, normPath } from '../workspace/treeStore'

/** Absolute path → root-relative, so tree ids and editor tabs agree on one key. */
function toRelative(abs, rootPath) {
  const a = normPath(abs)
  const r = normPath(rootPath)
  if (r && (a === r || a.startsWith(r + '/'))) return a.slice(r.length + 1)
  return a
}

/**
 * WorkspacePanel — the docked workspace: activity rail, one side view, and the
 * editor area.
 *
 * It is a DOCK, not a modal: it sits in the `.app` flex row beside the sidebar
 * and the chat narrows to fit. That is deliberate — the whole point of putting
 * the explorer in this app rather than alongside it is watching the agent work
 * on files while you talk to it, which a modal covering the conversation
 * cannot do.
 *
 * WHOEVER ADDS A PANEL HERE: register it in App's `browserOccluded` set. A
 * WebContentsView composites ABOVE the DOM, so anything not in that set is
 * painted UNDER the docked browser and looks broken for reasons that have
 * nothing to do with this file.
 */

const MIN_W = 220
const MAX_W = 620
const MAX_EDITOR_W = 1400
const STORAGE_KEY = 'yogatik.workspace.width'
const EDITOR_KEY = 'yogatik.workspace.editorWidth'

function storedWidth(key, fallback, max) {
  const n = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : 0)
  return n >= MIN_W && n <= max ? n : fallback
}

const VIEWS = [
  { id: 'explorer', label: 'Explorer', Icon: Files },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'scm', label: 'Source Control', Icon: GitBranch },
]

export function WorkspacePanel({ open, onClose, conversationId, dark = true }) {
  const [view, setView] = useState('explorer')
  const [changesTab, setChangesTab] = useState('git')
  const [width, setWidth] = useState(() => storedWidth(STORAGE_KEY, 300, MAX_W))
  const [editorWidth, setEditorWidth] = useState(() => storedWidth(EDITOR_KEY, 620, MAX_EDITOR_W))
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)
  const dragRef = useRef(null)

  const tree = useWorkspaceTree({ enabled: open, conversationId })

  /* ── resize ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag) return
      // Each column measures from its OWN left edge, so dragging the editor's
      // handle does not silently resize the tree as well.
      const max = drag.kind === 'editor' ? MAX_EDITOR_W : MAX_W
      const next = Math.min(max, Math.max(MIN_W, e.clientX - drag.left))
      if (drag.kind === 'editor') setEditorWidth(next)
      else setWidth(next)
    }
    const onUp = () => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      document.body.classList.remove('ws-resizing')
      try {
        localStorage.setItem(STORAGE_KEY, String(width))
        localStorage.setItem(EDITOR_KEY, String(editorWidth))
      } catch { /* private mode */ }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [width, editorWidth])

  // Warm the editor chunk the moment the dock opens, on idle. Opening a file
  // used to be TWO sequential waits — read the file, then fetch ~350KB of
  // CodeMirror — and the second one is the long, visible half. By the time a
  // file is clicked the module is almost always already resolved.
  useEffect(() => {
    if (!open || !isDesktop()) return undefined
    // A plain call, not a dynamic import: codemirror.js already rides in this
    // panel's chunk (CodeEditorPane imports it statically) and it is a few
    // lines — the ~350KB that matters is behind loadCodeMirror's own imports.
    const warm = () => { loadCodeMirror().catch(() => {}) }
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(warm, { timeout: 2500 })
      : setTimeout(warm, 400)
    return () => {
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number') cancelIdleCallback(idle)
      else clearTimeout(idle)
    }
  }, [open])

  const openFile = useCallback((row) => {
    setTabs((t) => (t.some(x => x.id === row.id)
      ? t
      // A hard cap, because tabs are cheap to open and each holds a full
      // document in memory; 12 open 2MB files is 24MB of renderer heap.
      : [...t.slice(-11), { id: row.id, path: row.path, name: row.name, rootId: row.rootId }]))
    setActiveTab(row.id)
  }, [])

  const closeTab = useCallback((id) => {
    setTabs((t) => {
      const next = t.filter(x => x.id !== id)
      setActiveTab(cur => (cur === id ? (next[next.length - 1]?.id ?? null) : cur))
      return next
    })
  }, [])

  const grant = useCallback(async () => {
    await addRoot()
    tree.refreshRoots()
  }, [tree])

  /* ── the agent just touched a file: show it ───────────────────────────── */
  useEffect(() => {
    if (!open) return undefined
    const onAgentWrite = (e) => {
      const path = e?.detail?.path
      const rootId = tree.state.roots.find(r => r.primary)?.id
      if (!path || !rootId) return
      tree.reveal(rootId, path)
      tree.refreshDecorations()
    }
    window.addEventListener('yogatik:fs-mutated', onAgentWrite)
    return () => window.removeEventListener('yogatik:fs-mutated', onAgentWrite)
  }, [open, tree])

  if (!open) return null

  const primaryRoot = tree.state.roots.find(r => r.primary) || tree.state.roots[0]

  const dock = (
    <div className="ws-dock" style={{ width }} aria-label="Workspace">
      <div className="ws-rail" role="tablist" aria-orientation="vertical">
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            className={`ws-rail-btn ${view === id ? 'active' : ''}`}
            title={label}
            aria-label={label}
            onClick={() => setView(id)}
          >
            <Icon size={17} />
          </button>
        ))}
        <div className="ws-spacer" />
        <button className="ws-rail-btn" title="Close workspace" aria-label="Close workspace" onClick={onClose}>
          <PanelLeftClose size={17} />
        </button>
      </div>

      <div className="ws-body">
        <div className="ws-head">
          <span>{VIEWS.find(v => v.id === view)?.label}</span>
          {primaryRoot && <code title={primaryRoot.path}>{primaryRoot.label}</code>}
        </div>

        <div className="ws-side">
          {view === 'explorer' && (
            <ExplorerPanel
              tree={tree}
              onOpenFile={openFile}
              onAddFolder={grant}
              activePath={activeTab}
            />
          )}
          {view === 'search' && (
            <WorkspaceSearch
              onOpenFile={(absPath, name) => {
                const rootId = primaryRoot?.id
                if (!rootId) return
                // Search results carry ABSOLUTE paths (that is what the index
                // holds). A tab keyed on an absolute path would never match the
                // tree row for the same file, so both the id and the reveal
                // would silently miss.
                const rel = toRelative(absPath, primaryRoot.path)
                openFile({ id: nodeId(rootId, rel), path: rel, name, rootId })
                tree.reveal(rootId, rel)
              }}
            />
          )}
          {view === 'scm' && (
            <ChangesPanel tab={changesTab} onTab={setChangesTab} root={primaryRoot?.path} />
          )}
        </div>

      </div>

      <div
        className="ws-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        tabIndex={0}
        onMouseDown={(e) => {
          dragRef.current = { kind: 'dock', left: e.currentTarget.parentElement.getBoundingClientRect().left }
          document.body.classList.add('ws-resizing')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth(w => Math.max(MIN_W, w - 24))
          if (e.key === 'ArrowRight') setWidth(w => Math.min(MAX_W, w + 24))
        }}
      />
    </div>
  )

  // The editor is its OWN COLUMN to the right of the tree, not a pane stacked
  // under it. Stacked, a 420px dock gave the file ~40% of an already narrow
  // strip — unusable for code, and the reason the first version felt wrong.
  // Side by side, the tree stays a tree and the file gets real width; the chat
  // gives up the space, which is the correct thing to yield.
  const editor = tabs.length > 0 && (
    <div className="ws-editor-dock" style={{ width: editorWidth }}>
      <CodeEditorPane
        tabs={tabs}
        activeId={activeTab}
        onActivate={setActiveTab}
        onClose={closeTab}
        onCloseAll={() => { setTabs([]); setActiveTab(null) }}
        dark={dark}
      />
      <div
        className="ws-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor"
        tabIndex={0}
        onMouseDown={(e) => {
          dragRef.current = { kind: 'editor', left: e.currentTarget.parentElement.getBoundingClientRect().left }
          document.body.classList.add('ws-resizing')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setEditorWidth(w => Math.max(MIN_W, w - 24))
          if (e.key === 'ArrowRight') setEditorWidth(w => Math.min(MAX_EDITOR_W, w + 24))
        }}
      />
    </div>
  )

  return <>{dock}{editor}</>
}

/** The web build has no bridge at all — say so rather than showing an empty tree. */
export function WorkspaceDock(props) {
  if (!isDesktop()) {
    if (!props.open) return null
    return (
      <div className="ws-dock" style={{ width: 320 }}>
        <div className="ws-body">
          <div className="ws-empty">
            <Sparkles size={22} />
            <p>Desktop only</p>
            <span>The file explorer reads real files on this computer, which a browser tab cannot do. Open Yogatik&apos;s desktop app to use it.</span>
            <button className="ws-primary-btn" onClick={props.onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }
  return <WorkspacePanel {...props} />
}

export default WorkspaceDock
