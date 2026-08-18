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

module.exports = {
  MAX_TEXT, MAX_NODES, INTERACTIVE_ROLES,
  truncateText, isInteractive, nodeLabel,
}
