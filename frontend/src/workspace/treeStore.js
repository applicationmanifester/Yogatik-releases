// Explorer tree model. PURE — imports nothing, touches no DOM, no IPC.
//
// Why a store instead of component state: the tree has four independent writers
// (user expand/collapse, the fs watcher, the agent's own fs_* mutations, and a
// git/journal decoration refresh) and every one of them must merge into the
// SAME structure without discarding what the others did. Doing that inside a
// React component is how a tree ends up collapsing itself whenever a file
// changes on disk. Same split as rootsCore.cjs / browserTree.cjs: the logic is
// testable precisely because it has no runtime dependency.
//
// Paths are ALWAYS root-relative and '/'-separated, in every field, at every
// layer. Windows gives back '\' and the mixing of the two is the single easiest
// way to make a lookup silently miss.

export const ROOT_PARENT = ''

/** Normalise any separator + strip leading/trailing slashes and './'. */
export function normPath(p) {
  return String(p || '')
    .split('\\').join('/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export function nodeId(rootId, relPath) {
  return `${rootId}\u0000${normPath(relPath)}`
}

export function parentPath(relPath) {
  const p = normPath(relPath)
  const i = p.lastIndexOf('/')
  return i === -1 ? ROOT_PARENT : p.slice(0, i)
}

export function baseName(relPath) {
  const p = normPath(relPath)
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

export function extOf(name) {
  const n = String(name || '')
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1).toLowerCase() : ''
}

/**
 * Directories first, then a NATURAL sort. Plain localeCompare puts `file10`
 * before `file2`, which reads as broken in any folder holding numbered files.
 */
const collator = typeof Intl !== 'undefined' && Intl.Collator
  ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  : { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }

export function compareEntries(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return collator.compare(a.name, b.name)
}

/** Fresh state. `roots` is the roots_list reply: [{ id, path, label, primary }]. */
export function createTree(roots = []) {
  const safeRoots = Array.isArray(roots) ? roots : []
  const list = safeRoots.filter(Boolean).map(r => ({
    id: String(r.id ?? r.path),
    path: r.path,
    label: r.label || baseName(String(r.path || '').split('\\').join('/')) || r.path,
    primary: !!r.primary,
    source: r.source || null,
  }))
  return {
    roots: list,
    // id -> node. A plain object, not a Map: it survives structuredClone, JSON
    // round-trips in tests, and React's identity check works on the wrapper.
    nodes: {},
    // id -> array of child ids, in display order. Absent = never loaded.
    children: {},
    expanded: {},          // id -> true
    loading: {},           // id -> true while its listing is in flight
    errors: {},            // id -> message
    decorations: {},       // `${rootId}\0${path}` -> { git, agent }
    selectedId: null,
    filter: '',
  }
}

/** Add/replace a root without discarding the expansion state of the others. */
export function setRoots(state, roots) {
  const next = createTree(roots)
  const keep = new Set(next.roots.map(r => r.id))
  const carry = (obj) => {
    const out = {}
    for (const k of Object.keys(obj)) if (keep.has(k.split('\u0000')[0])) out[k] = obj[k]
    return out
  }
  return {
    ...state,
    roots: next.roots,
    nodes: carry(state.nodes),
    children: carry(state.children),
    expanded: carry(state.expanded),
    loading: {},
    errors: carry(state.errors),
    decorations: carry(state.decorations),
    selectedId: keep.has(String(state.selectedId || '').split('\u0000')[0]) ? state.selectedId : null,
  }
}

/**
 * Fold one directory listing in. `entries` is the fs_list reply, whose fields
 * are `is_dir`/`mtimeMs` — NOT `isDir`. Reading the camelCase name off that row
 * is the exact drift that made fs_find_files return directories as files, so
 * the translation happens HERE, once, and nowhere else in the UI.
 */
export function setChildren(state, rootId, dirPath, entries, rootAbsPath) {
  const parentRel = normPath(dirPath)
  const pid = nodeId(rootId, parentRel)
  const nodes = { ...state.nodes }
  const kids = []

  const absRoot = normPath(rootAbsPath || state.roots.find(r => r.id === rootId)?.path || '')
  const safeEntries = Array.isArray(entries) ? entries : []

  for (const e of safeEntries) {
    if (!e || typeof e !== 'object') continue
    // fs_list returns ABSOLUTE paths. Re-derive the root-relative one rather
    // than trusting a `name` join, which loses nested results on a recursive
    // listing.
    const abs = normPath(e.path)
    let rel = abs
    if (absRoot && (abs === absRoot || abs.startsWith(absRoot + '/'))) {
      rel = abs.slice(absRoot.length + 1)
    } else if (parentRel) {
      rel = `${parentRel}/${e.name}`
    } else {
      rel = e.name
    }
    rel = normPath(rel)
    if (!rel) continue
    // A recursive listing carries grandchildren; only direct children belong
    // under this parent.
    if (parentPath(rel) !== parentRel) continue

    const id = nodeId(rootId, rel)
    nodes[id] = {
      id,
      rootId,
      path: rel,
      name: e.name || baseName(rel),
      isDir: !!e.is_dir,
      size: Number(e.size) || 0,
      mtimeMs: Number(e.mtimeMs) || 0,
      absPath: abs || null,
    }
    kids.push(id)
  }

  kids.sort((a, b) => compareEntries(nodes[a], nodes[b]))

  const loading = { ...state.loading }
  delete loading[pid]
  const errors = { ...state.errors }
  delete errors[pid]

  return { ...state, nodes, children: { ...state.children, [pid]: kids }, loading, errors }
}

export function setLoading(state, rootId, dirPath, on = true) {
  const pid = nodeId(rootId, dirPath)
  const loading = { ...state.loading }
  if (on) loading[pid] = true
  else delete loading[pid]
  return { ...state, loading }
}

export function setError(state, rootId, dirPath, message) {
  const pid = nodeId(rootId, dirPath)
  const loading = { ...state.loading }
  delete loading[pid]
  return { ...state, loading, errors: { ...state.errors, [pid]: String(message || 'Failed to read folder') } }
}

export function isExpanded(state, id) { return !!state.expanded[id] }
export function isLoaded(state, id) { return Array.isArray(state.children[id]) }

export function expand(state, id, on) {
  const want = on === undefined ? !state.expanded[id] : !!on
  const expanded = { ...state.expanded }
  if (want) expanded[id] = true
  else delete expanded[id]
  return { ...state, expanded }
}

export function select(state, id) { return { ...state, selectedId: id } }
export function setFilter(state, filter) { return { ...state, filter: String(filter || '') } }

/** Forget a directory's listing so the next expand refetches it. */
export function invalidateDir(state, rootId, dirPath) {
  const pid = nodeId(rootId, dirPath)
  const children = { ...state.children }
  delete children[pid]
  return { ...state, children }
}

/**
 * A watcher event. Returns { state, refetch: [{ rootId, path }] } — the caller
 * decides whether to actually refetch, because a burst of 200 events during a
 * `npm install` must not become 200 IPC round-trips.
 *
 * Only a dirty directory that is currently EXPANDED is worth refetching: a
 * collapsed one will be read fresh when the user opens it, and refetching it
 * now is work nobody can see.
 */
export function applyFsChange(state, rootId, change) {
  const rel = normPath(change?.path)
  const dir = parentPath(rel)
  const pid = nodeId(rootId, dir)
  const parentIsRoot = dir === ROOT_PARENT
  const known = isLoaded(state, pid)
  if (!known) return { state, refetch: [] }

  const visible = parentIsRoot || !!state.expanded[pid]
  const next = invalidateDir(state, rootId, dir)
  return { state: next, refetch: visible ? [{ rootId, path: dir }] : [] }
}

/**
 * Decorations: git status per path, plus which paths the AGENT touched this
 * session (from the undo journal). Both are keyed by node id so a lookup during
 * render is O(1) — walking a status array per row is what makes a 5000-file
 * tree scroll at 12fps.
 */
export function setDecorations(state, { rootId, gitFiles = [], agentPaths = [] } = {}) {
  const decorations = { ...state.decorations }
  // Drop this root's previous decorations; a file that is no longer modified
  // must lose its badge, and merging would leave it there forever.
  for (const k of Object.keys(decorations)) {
    if (k.split('\u0000')[0] === rootId) delete decorations[k]
  }

  const put = (rel, patch) => {
    const id = nodeId(rootId, rel)
    decorations[id] = { ...(decorations[id] || {}), ...patch }
  }

  const safeGitFiles = Array.isArray(gitFiles) ? gitFiles : []
  for (const f of safeGitFiles) {
    if (!f || typeof f !== 'object') continue
    const rel = normPath(f.path)
    if (!rel) continue
    put(rel, { git: gitBadge(f) })
    // Roll the badge up the ancestry so a collapsed folder still shows that
    // something inside it changed — the whole reason VS Code colours folders.
    for (let d = parentPath(rel); d; d = parentPath(d)) {
      const id = nodeId(rootId, d)
      const prev = decorations[id] || {}
      decorations[id] = { ...prev, gitDescendants: (prev.gitDescendants || 0) + 1 }
    }
  }

  const safeAgentPaths = Array.isArray(agentPaths) ? agentPaths : []
  for (const p of safeAgentPaths) {
    if (!p) continue
    const rel = normPath(p)
    if (!rel) continue
    put(rel, { agent: true })
    for (let d = parentPath(rel); d; d = parentPath(d)) {
      const id = nodeId(rootId, d)
      const prev = decorations[id] || {}
      decorations[id] = { ...prev, agentDescendants: (prev.agentDescendants || 0) + 1 }
    }
  }

  return { ...state, decorations }
}

/** One-letter git badge, matching the porcelain fields parseStatus produces. */
export function gitBadge(f) {
  if (!f) return null
  if (f.untracked) return 'U'
  if (f.deleted) return 'D'
  if (f.renamed) return 'R'
  if (f.staged && !f.unstaged) return 'A'
  return 'M'
}

export function decorationOf(state, id) { return state.decorations[id] || null }

/**
 * Flatten to the rows a virtualized list renders. Each row carries its own
 * depth so the renderer never has to walk upwards.
 *
 * With a filter, only nodes ALREADY LOADED are searched, and matching is on the
 * path so `src/app` works. This is deliberately not a disk search: fs_find_files
 * is the tool for that and it is a separate, explicitly-invoked mode. A filter
 * box that silently walks node_modules is the classic explorer freeze.
 */
export function visibleRows(state) {
  const rows = []
  const filter = state.filter.trim().toLowerCase()
  const matches = (node) => !filter || node.path.toLowerCase().includes(filter)

  const walk = (rootId, parentRel, depth) => {
    const pid = nodeId(rootId, parentRel)
    const kids = state.children[pid]
    if (!Array.isArray(kids)) return false
    let any = false
    for (const id of kids) {
      const node = state.nodes[id]
      if (!node) continue
      if (node.isDir) {
        const open = !!state.expanded[id] || (!!filter && isLoaded(state, id))
        // Depth-first FIRST, so a folder whose only match is a grandchild is
        // still shown. Doing it the other way hides the path to every hit.
        const childRows = []
        if (open) {
          const mark = rows.length
          const hit = walk(rootId, node.path, depth + 1)
          childRows.push(...rows.splice(mark))
          if (!hit && !matches(node) && filter) continue
        } else if (filter && !matches(node)) {
          continue
        }
        rows.push({
          ...node, depth, kind: 'dir',
          expanded: !!state.expanded[id] || (!!filter && childRows.length > 0),
          loading: !!state.loading[id],
          error: state.errors[id] || null,
          decoration: state.decorations[id] || null,
          selected: state.selectedId === id,
        })
        rows.push(...childRows)
        any = true
      } else {
        if (!matches(node)) continue
        rows.push({
          ...node, depth, kind: 'file',
          decoration: state.decorations[id] || null,
          selected: state.selectedId === id,
        })
        any = true
      }
    }
    return any
  }

  for (const root of state.roots) {
    const rid = nodeId(root.id, ROOT_PARENT)
    rows.push({
      id: rid,
      rootId: root.id,
      path: ROOT_PARENT,
      name: root.label,
      absPath: root.path,
      isDir: true,
      depth: 0,
      kind: 'root',
      primary: root.primary,
      expanded: !!state.expanded[rid],
      loading: !!state.loading[rid],
      error: state.errors[rid] || null,
      decoration: state.decorations[rid] || null,
      selected: state.selectedId === rid,
    })
    if (state.expanded[rid] || filter) walk(root.id, ROOT_PARENT, 1)
  }
  return rows
}

/** Every ancestor id of a path, outermost first — used to reveal a file. */
export function ancestorIds(rootId, relPath) {
  const out = [nodeId(rootId, ROOT_PARENT)]
  const parts = normPath(relPath).split('/').filter(Boolean)
  let acc = ''
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i]
    out.push(nodeId(rootId, acc))
  }
  return out
}

/** Expand everything on the way to `relPath` and select it. */
export function revealPath(state, rootId, relPath) {
  const expanded = { ...state.expanded }
  for (const id of ancestorIds(rootId, relPath)) expanded[id] = true
  return { ...state, expanded, selectedId: nodeId(rootId, relPath) }
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}
