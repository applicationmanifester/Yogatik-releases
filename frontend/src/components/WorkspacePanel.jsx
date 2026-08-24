import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Files, GitBranch, Search, PanelLeftClose, Sparkles } from 'lucide-react'
import ExplorerPanel from './ExplorerPanel'
import ChangesPanel from './ChangesPanel'
import CodeEditorPane from './CodeEditorPane'
import WorkspaceSearch from './WorkspaceSearch'
import { useWorkspaceTree } from '../workspace/useWorkspaceTree'
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

const MIN_W = 260
const MAX_W = 900
const STORAGE_KEY = 'yogatik.workspace.width'

const VIEWS = [
  { id: 'explorer', label: 'Explorer', Icon: Files },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'scm', label: 'Source Control', Icon: GitBranch },
]

export function WorkspacePanel({ open, onClose, conversationId, dark = true }) {
  const [view, setView] = useState('explorer')
  const [changesTab, setChangesTab] = useState('git')
  const [width, setWidth] = useState(() => {
    const n = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : 0)
    return n >= MIN_W && n <= MAX_W ? n : 420
  })
  const [tabs, setTabs] = useState([])
  const [activeTab, setActiveTab] = useState(null)
  const dragRef = useRef(null)

  const tree = useWorkspaceTree({ enabled: open, conversationId })

  /* ── resize ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      const next = Math.min(MAX_W, Math.max(MIN_W, e.clientX - dragRef.current.left))
      setWidth(next)
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.classList.remove('ws-resizing')
      try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* private mode */ }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [width])

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

  return (
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

        <div className="ws-editor-area">
          <CodeEditorPane
            tabs={tabs}
            activeId={activeTab}
            onActivate={setActiveTab}
            onClose={closeTab}
            dark={dark}
          />
        </div>
      </div>

      <div
        className="ws-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        tabIndex={0}
        onMouseDown={(e) => {
          dragRef.current = { left: e.currentTarget.parentElement.getBoundingClientRect().left }
          document.body.classList.add('ws-resizing')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth(w => Math.max(MIN_W, w - 24))
          if (e.key === 'ArrowRight') setWidth(w => Math.min(MAX_W, w + 24))
        }}
      />
    </div>
  )
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
