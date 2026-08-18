// Pure helpers for the desktop browser's accessibility tree.
//
// MUST NOT require('electron'): vitest collects src/**/*.test.js under jsdom,
// where that throws. This split (pure here, Electron glue in browserControl.cjs)
// is the same one rootsCore.cjs / roots.cjs uses, and for the same reason — it
// is what makes the interesting logic testable at all.

const MAX_TEXT = 120
const MAX_NODES = 400

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio',
])

function truncateText(s, max = MAX_TEXT) {
  const str = typeof s === 'string' ? s : ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function isInteractive(node) {
  if (!node) return false
  if (node.interactive === true) return true
  return INTERACTIVE_ROLES.has(node.role)
}

function nodeLabel(node) {
  if (!node) return ''
  const name = (node.name || '').trim()
  if (name) return name
  const text = (node.text || '').trim()
  if (text) return text
  return node.role || ''
}

// A node earns a place in the tree if it can be acted on, or if it says
// something. Everything else is layout scaffolding the model does not need.
function simplify(rawNodes) {
  const list = Array.isArray(rawNodes) ? rawNodes : []
  return list.filter(n => {
    if (!n) return false
    if (n.visible === false) return false
    if (isInteractive(n)) return true
    return !!((n.name || '').trim() || (n.text || '').trim())
  })
}

// Refs carry their epoch so a stale one is detectable rather than silently
// resolving to whatever now sits at that index.
function assignRefs(nodes, epoch) {
  let i = 0
  return (nodes || []).map(n => (
    isInteractive(n) ? { ...n, ref: `ref_${epoch}_${i++}` } : { ...n }
  ))
}

function parseRef(ref) {
  if (typeof ref !== 'string') return null
  const m = /^ref_(\d+)_(\d+)$/.exec(ref)
  if (!m) return null
  return { epoch: Number(m[1]), index: Number(m[2]) }
}

function isStaleRef(ref, currentEpoch) {
  const parsed = parseRef(ref)
  if (!parsed) return true
  return parsed.epoch !== currentEpoch
}

const MAX_INDENT = 10

function formatTree(nodes) {
  return (nodes || []).map(n => {
    const pad = '  '.repeat(Math.min(Number(n.depth) || 0, MAX_INDENT))
    const label = truncateText(nodeLabel(n))
    const ref = n.ref ? ` [${n.ref}]` : ''
    return `${pad}${n.role || 'node'} "${label}"${ref}`
  }).join('\n')
}

// Refs are assigned BEFORE truncation: a ref that survives into the visible
// slice must resolve to the same element the page-side walker registered, and
// the page registers every interactive node it saw, not just the ones we print.
function buildTree(rawNodes, { epoch = 0, maxNodes = MAX_NODES } = {}) {
  const kept = simplify(rawNodes)
  const withRefs = assignRefs(kept, epoch)
  const interactiveCount = withRefs.filter(n => n.ref).length
  const truncated = withRefs.length > maxNodes
  const slice = truncated ? withRefs.slice(0, maxNodes) : withRefs
  let text = formatTree(slice)
  if (truncated) {
    text += `\n… truncated: showing ${maxNodes} of ${withRefs.length} nodes`
  }
  return { text, truncated, interactiveCount, nodeCount: withRefs.length }
}

module.exports = {
  MAX_TEXT, MAX_NODES, MAX_INDENT, INTERACTIVE_ROLES,
  truncateText, isInteractive, nodeLabel,
  simplify, assignRefs, parseRef, isStaleRef,
  formatTree, buildTree,
}
