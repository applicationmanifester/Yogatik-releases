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

// The ref → element mapping lives IN THE PAGE (window.__yogatikRefs__), not in
// main. Main stores only the epoch number. Resolution re-measures the element at
// action time, so an element that moved but still exists is still clicked
// correctly, and main never holds a stale DOM handle.
//
// Both sources interpolate ONLY Number()-coerced values — no caller string ever
// reaches the evaluated code.
function walkerSource(epoch) {
  return `(() => {
  const INTERACTIVE_SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[role=switch],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const roleOf = (el) => {
    const explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'img') return 'img';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'search') return 'searchbox';
      if (t === 'hidden') return 'hidden';
      return 'textbox';
    }
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'form') return 'form';
    if (tag === 'li') return 'listitem';
    return 'generic';
  };
  const nameOf = (el) => {
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = document.getElementById(labelledby);
      if (t && t.innerText) return t.innerText.trim();
    }
    if (el.tagName === 'IMG') return (el.alt || '').trim();
    if (el.tagName === 'INPUT') {
      return (el.getAttribute('aria-label') || el.placeholder || el.value || el.name || '').trim();
    }
    const title = el.getAttribute && el.getAttribute('title');
    if (title) return title.trim();
    return '';
  };
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = window.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const refs = [];
  const nodes = [];
  const walk = (el, depth) => {
    if (!el || nodes.length > 2000) return;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') return;
    const role = roleOf(el);
    if (role !== 'hidden') {
      const visible = isVisible(el);
      const interactive = visible && el.matches && el.matches(INTERACTIVE_SEL);
      let own = '';
      for (const c of el.childNodes) {
        if (c.nodeType === 3) own += c.nodeValue;
      }
      own = own.replace(/\\s+/g, ' ').trim();
      if (interactive || own) {
        if (interactive) refs.push(el);
        nodes.push({
          depth, role,
          name: nameOf(el),
          text: own,
          visible,
          interactive: !!interactive,
        });
      }
    }
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(document.body, 0);
  window.__yogatikRefs__ = refs;
  window.__yogatikRefEpoch__ = ${Number(epoch) || 0};
  return {
    url: location.href,
    title: document.title,
    nodes,
  };
})()`
}

// Resolves one ref index to a fresh viewport-relative centre point. Returns null
// when the element is gone, so the caller can report a stale ref instead of
// clicking empty space.
function refResolverSource(index) {
  return `(() => {
  const el = (window.__yogatikRefs__ || [])[${Number(index) || 0}];
  if (!el || !el.isConnected) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
    tag: el.tagName.toLowerCase(),
  };
})()`
}

// Resolves one ref index to the LIVE ELEMENT itself, not a point — for CDP
// Runtime.evaluate (which, unlike executeJavaScript, can return a remote
// objectId rather than requiring a JSON-cloneable result). Validates the
// element is a file input before handing it back: DOM.setFileInputFiles on
// anything else fails opaquely deep in Chromium, and the model needs to be
// told WHY its ref did not work, not just that it didn't.
function elementRefExpression(index) {
  return `(() => {
  const el = (window.__yogatikRefs__ || [])[${Number(index) || 0}];
  if (!el || !el.isConnected) return null;
  if (!(el.tagName === 'INPUT' && el.type === 'file')) {
    throw new Error('ref does not point at a file input (found <' + el.tagName.toLowerCase() + '>)');
  }
  return el;
})()`
}

module.exports = {
  MAX_TEXT, MAX_NODES, MAX_INDENT, INTERACTIVE_ROLES,
  walkerSource, refResolverSource, elementRefExpression,
  truncateText, isInteractive, nodeLabel,
  simplify, assignRefs, parseRef, isStaleRef,
  formatTree, buildTree,
}
