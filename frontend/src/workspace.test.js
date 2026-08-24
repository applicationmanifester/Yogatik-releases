// Workspace dock — the parts that can be wrong SILENTLY.
//
// The bugs this file exists to prevent are the ones this codebase keeps
// producing: a reader taking a field the writer never set (`is_dir` vs
// `isDir`), a view that misaligns without erroring, and a security allowlist
// that quietly widens. None of those throw; all of them look like a working
// feature until someone loses work.

import { describe, it, expect } from 'vitest'
import {
  createTree, setChildren, expand, visibleRows, applyFsChange, setDecorations,
  nodeId, normPath, parentPath, compareEntries, revealPath, setFilter, gitBadge,
  ROOT_PARENT,
} from './workspace/treeStore'
import {
  parseUnifiedDiff, diffTexts, wordDiff, toSideBySide, similarEnough, diffStats,
} from './workspace/diffModel'

const ROOT = 'r1'
const ABS = '/home/u/proj'
const roots = [{ id: ROOT, path: ABS, label: 'proj', primary: true }]

/** fs_list's REAL reply shape: absolute `path`, snake_case `is_dir`. */
const entry = (name, isDir = false, dir = '') => ({
  name,
  path: `${ABS}${dir ? '/' + dir : ''}/${name}`,
  is_dir: isDir,
  size: isDir ? 0 : 100,
  mtimeMs: 1,
})

describe('treeStore', () => {
  it('reads is_dir, not isDir — the drift that made folders render as files', () => {
    const s = setChildren(createTree(roots), ROOT, '', [entry('src', true), entry('a.js')], ABS)
    const src = s.nodes[nodeId(ROOT, 'src')]
    expect(src.isDir).toBe(true)
    expect(s.nodes[nodeId(ROOT, 'a.js')].isDir).toBe(false)
    // A camelCase read would have made BOTH false and nothing would have thrown.
    expect(setChildren(createTree(roots), ROOT, '', [{ name: 'x', path: `${ABS}/x`, isDir: true }], ABS)
      .nodes[nodeId(ROOT, 'x')].isDir).toBe(false)
  })

  it('derives root-relative paths from the absolute ones fs_list returns', () => {
    const s = setChildren(createTree(roots), ROOT, 'src', [entry('App.jsx', false, 'src')], ABS)
    expect(s.nodes[nodeId(ROOT, 'src/App.jsx')].path).toBe('src/App.jsx')
  })

  it('drops grandchildren from a recursive listing rather than nesting them wrongly', () => {
    const s = setChildren(createTree(roots), ROOT, '', [
      entry('src', true),
      { name: 'deep.js', path: `${ABS}/src/sub/deep.js`, is_dir: false },
    ], ABS)
    expect(s.children[nodeId(ROOT, '')]).toEqual([nodeId(ROOT, 'src')])
  })

  it('sorts directories first, then naturally (file10 after file2)', () => {
    const names = ['file10.js', 'file2.js', 'zeta', 'alpha']
    const s = setChildren(createTree(roots), ROOT, '', [
      entry('file10.js'), entry('file2.js'), entry('zeta', true), entry('alpha', true),
    ], ABS)
    const order = s.children[nodeId(ROOT, '')].map(id => s.nodes[id].name)
    expect(order).toEqual(['alpha', 'zeta', 'file2.js', 'file10.js'])
    expect(names.length).toBe(4)
  })

  it('compareEntries puts dirs first regardless of name', () => {
    expect(compareEntries({ isDir: true, name: 'z' }, { isDir: false, name: 'a' })).toBeLessThan(0)
  })

  it('visibleRows only descends into EXPANDED folders', () => {
    let s = setChildren(createTree(roots), ROOT, '', [entry('src', true)], ABS)
    s = setChildren(s, ROOT, 'src', [entry('App.jsx', false, 'src')], ABS)
    s = expand(s, nodeId(ROOT, ROOT_PARENT), true)
    expect(visibleRows(s).map(r => r.name)).toEqual(['proj', 'src'])
    s = expand(s, nodeId(ROOT, 'src'), true)
    expect(visibleRows(s).map(r => r.name)).toEqual(['proj', 'src', 'App.jsx'])
  })

  it('a filter keeps the PATH to a match, not just the match', () => {
    let s = setChildren(createTree(roots), ROOT, '', [entry('src', true)], ABS)
    s = setChildren(s, ROOT, 'src', [entry('App.jsx', false, 'src'), entry('other.txt', false, 'src')], ABS)
    s = expand(s, nodeId(ROOT, ROOT_PARENT), true)
    s = setFilter(s, 'app')
    const names = visibleRows(s).map(r => r.name)
    expect(names).toContain('src')      // the way in must stay visible
    expect(names).toContain('App.jsx')
    expect(names).not.toContain('other.txt')
  })

  it('a watcher event only asks for a refetch of a directory that is visible', () => {
    let s = setChildren(createTree(roots), ROOT, '', [entry('src', true)], ABS)
    s = setChildren(s, ROOT, 'src', [entry('App.jsx', false, 'src')], ABS)

    // Collapsed: invalidate, but do not spend an IPC round-trip nobody can see.
    const collapsed = applyFsChange(s, ROOT, { type: 'change', path: 'src/App.jsx' })
    expect(collapsed.refetch).toEqual([])
    expect(collapsed.state.children[nodeId(ROOT, 'src')]).toBeUndefined()

    const open = applyFsChange(expand(s, nodeId(ROOT, 'src'), true), ROOT, { type: 'change', path: 'src/App.jsx' })
    expect(open.refetch).toEqual([{ rootId: ROOT, path: 'src' }])
  })

  it('an event in a never-listed directory costs nothing', () => {
    const s = createTree(roots)
    expect(applyFsChange(s, ROOT, { type: 'add', path: 'node_modules/x/y.js' }).refetch).toEqual([])
  })

  it('decorations roll up to ancestors and REPLACE the previous set', () => {
    let s = setChildren(createTree(roots), ROOT, '', [entry('src', true)], ABS)
    s = setDecorations(s, { rootId: ROOT, gitFiles: [{ path: 'src/App.jsx', unstaged: true }] })
    expect(s.decorations[nodeId(ROOT, 'src/App.jsx')].git).toBe('M')
    expect(s.decorations[nodeId(ROOT, 'src')].gitDescendants).toBe(1)

    // The file is committed: its badge must GO, not linger because the new set
    // was merged over the old one.
    s = setDecorations(s, { rootId: ROOT, gitFiles: [] })
    expect(s.decorations[nodeId(ROOT, 'src/App.jsx')]).toBeUndefined()
  })

  it('gitBadge reads the porcelain fields parseStatus actually produces', () => {
    expect(gitBadge({ untracked: true })).toBe('U')
    expect(gitBadge({ deleted: true })).toBe('D')
    expect(gitBadge({ renamed: true })).toBe('R')
    expect(gitBadge({ staged: true })).toBe('A')
    expect(gitBadge({ unstaged: true })).toBe('M')
  })

  it('revealPath expands every ancestor', () => {
    const s = revealPath(createTree(roots), ROOT, 'a/b/c.js')
    expect(s.expanded[nodeId(ROOT, ROOT_PARENT)]).toBe(true)
    expect(s.expanded[nodeId(ROOT, 'a')]).toBe(true)
    expect(s.expanded[nodeId(ROOT, 'a/b')]).toBe(true)
    expect(s.expanded[nodeId(ROOT, 'a/b/c.js')]).toBeUndefined() // a file is not a folder
    expect(s.selectedId).toBe(nodeId(ROOT, 'a/b/c.js'))
  })

  it('normalises Windows separators everywhere — mixing them makes lookups miss', () => {
    expect(normPath('src\\components\\A.jsx')).toBe('src/components/A.jsx')
    expect(parentPath('src\\a\\b.js')).toBe('src/a')
    expect(nodeId(ROOT, 'a\\b')).toBe(nodeId(ROOT, 'a/b'))
  })
})

describe('diffModel — unified diff', () => {
  const DIFF = `diff --git a/src/a.js b/src/a.js
index 111..222 100644
--- a/src/a.js
+++ b/src/a.js
@@ -1,4 +1,4 @@
 const a = 1
-const b = 2
+const b = 3
 const c = 4
`

  it('parses hunks and assigns real line numbers to both sides', () => {
    const [f] = parseUnifiedDiff(DIFF)
    expect(f.path).toBe('src/a.js')
    expect(f.added).toBe(1)
    expect(f.removed).toBe(1)
    const rows = f.hunks[0].rows
    expect(rows.map(r => r.type)).toEqual(['ctx', 'del', 'add', 'ctx'])
    expect(rows[0].oldNo).toBe(1)
    expect(rows[3].oldNo).toBe(3)   // the deleted line consumed old line 2
    expect(rows[3].newNo).toBe(3)
  })

  it('marks the changed TOKENS, not the whole line', () => {
    const [f] = parseUnifiedDiff(DIFF)
    const del = f.hunks[0].rows[1]
    const add = f.hunks[0].rows[2]
    expect(del.segments.filter(s => s.changed).map(s => s.text)).toEqual(['2'])
    expect(add.segments.filter(s => s.changed).map(s => s.text)).toEqual(['3'])
  })

  it('detects new, deleted and binary files', () => {
    const [f] = parseUnifiedDiff('diff --git a/x.png b/x.png\nnew file mode 100644\nBinary files a/x.png and b/x.png differ\n')
    expect(f.mode).toBe('added')
    expect(f.binary).toBe(true)
  })

  it('diffStats sums across files', () => {
    expect(diffStats(parseUnifiedDiff(DIFF))).toEqual({ files: 1, added: 1, removed: 1 })
  })
})

describe('diffModel — text diff (undo journal)', () => {
  it('a created file is entirely additions', () => {
    const d = diffTexts('', 'a\nb\n')
    expect(d.removed).toBe(0)
    expect(d.added).toBeGreaterThan(0)
  })

  it('collapses unchanged regions into separate hunks', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
    const after = before.replace('line 5', 'LINE 5').replace('line 35', 'LINE 35')
    const d = diffTexts(before, after, { context: 2 })
    expect(d.hunks.length).toBe(2)      // not one hunk covering all 40 lines
    expect(d.added).toBe(2)
    expect(d.removed).toBe(2)
  })

  it('refuses rather than hanging on files too large to diff', () => {
    const huge = Array.from({ length: 20001 }, (_, i) => `l${i}`).join('\n')
    expect(diffTexts(huge, `${huge}\nx`).truncated).toBe(true)
  })

  it('identical input produces no hunks', () => {
    expect(diffTexts('same\ntext', 'same\ntext').hunks).toEqual([])
  })
})

describe('diffModel — presentation', () => {
  it('side-by-side keeps del and add on the SAME row', () => {
    const rows = [
      { type: 'ctx', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2, newNo: null },
      { type: 'add', text: 'B', oldNo: null, newNo: 2 },
      { type: 'ctx', text: 'c', oldNo: 3, newNo: 3 },
    ]
    const pairs = toSideBySide(rows)
    expect(pairs).toHaveLength(3)
    expect(pairs[1].left.text).toBe('b')
    expect(pairs[1].right.text).toBe('B')
  })

  it('pads the shorter side when the counts differ', () => {
    const pairs = toSideBySide([
      { type: 'del', text: 'x' },
      { type: 'add', text: 'y' },
      { type: 'add', text: 'z' },
    ])
    expect(pairs).toHaveLength(2)
    expect(pairs[1].left).toBe(null)
    expect(pairs[1].right.text).toBe('z')
  })

  it('wordDiff isolates the token that changed', () => {
    const { left, right } = wordDiff('const x = 1', 'const x = 42')
    expect(left.filter(s => s.changed).map(s => s.text).join('')).toBe('1')
    expect(right.filter(s => s.changed).map(s => s.text).join('')).toBe('42')
  })

  it('refuses to pair two unrelated lines — a full-line highlight is worse than none', () => {
    expect(similarEnough('const x = 1', 'const x = 2')).toBe(true)
    expect(similarEnough('import fs from "fs"', 'export default function App() {}')).toBe(false)
  })
})
