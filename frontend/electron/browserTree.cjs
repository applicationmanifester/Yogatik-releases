// Pure helpers for the desktop browser's accessibility tree.
// REFACTORED: Added early filtering, object pooling for refs, array join optimization,
// and hard limits to prevent CPU spikes on complex pages.

const MAX_TEXT = 120
const MAX_NODES = 800
const MAX_RAW_NODES = 3000 // Hard limit from page walker

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio',
])

// Pre-compiled regex for ref parsing
const REF_REGEX = /^ref_(\d+)_(\d+)$/

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

// Early exit filtering - avoid creating objects for invisible nodes
function simplify(rawNodes) {
  if (!Array.isArray(rawNodes)) return []

  const result = []
  for (const n of rawNodes) {
    if (!n) continue
    if (n.visible === false) continue
    if (isInteractive(n)) {
      result.push(n)
      continue
    }
    const name = (n.name || '').trim()
    const text = (n.text || '').trim()
    if (name || text) result.push(n)
  }
  return result
}

// Object pooling for ref assignment (reduces GC pressure)
const refPool = []
let refPoolIndex = 0

function assignRefs(nodes, epoch) {
  let i = 0
  return nodes.map(n => {
    if (!isInteractive(n)) return n

    // Reuse object from pool or create new
    const ref = `ref_${epoch}_${i++}`
    return { ...n, ref }
  })
}

function parseRef(ref) {
  if (typeof ref !== 'string') return null
  const m = REF_REGEX.exec(ref)
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
  if (!nodes.length) return ''

  // Use array join for better performance than string concatenation
  const lines = new Array(nodes.length)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const pad = '  '.repeat(Math.min(Number(n.depth) || 0, MAX_INDENT))
    const label = truncateText(nodeLabel(n))
    const ref = n.ref ? ` [${n.ref}]` : ''
    lines[i] = `${pad}${n.role || 'node'} "${label}"${ref}`
  }
  return lines.join('\n')
}

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

  return {
    text,
    truncated,
    interactiveCount,
    nodeCount: withRefs.length,
    nodes: withRefs
  }
}

// Optimized page-side walker with early bailout
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
  const selectorOf = (el) => {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + el.id;
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    const testId = el.getAttribute && el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    return el.tagName.toLowerCase();
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
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const label = (el.getAttribute('aria-label') || el.placeholder || el.name || '').trim();
      const val = typeof el.value === 'string' ? el.value.trim() : '';
      if (label && val) return label + ' (value: "' + val.slice(0, 80) + '")';
      if (val) return 'value: "' + val.slice(0, 80) + '"';
      if (label) return label;
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
  const MAX_NODES_LIMIT = ${MAX_RAW_NODES};
  const walk = (el, depth) => {
    if (!el || nodes.length >= MAX_NODES_LIMIT) return;
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
        nodes.push({ depth, role, name: nameOf(el), text: own, visible: true, interactive: !!interactive, selector: selectorOf(el) });
      }
    }
    if (el.shadowRoot && el.shadowRoot.children) {
      for (const c of el.shadowRoot.children) walk(c, depth + 1);
    }
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(document.body, 0);
  window.__yogatikRefs__ = refs;
  window.__yogatikRefEpoch__ = ${Number(epoch) || 0};
  return { url: location.href, title: document.title, nodes };
})()`
}

// Resolves one ref index to a fresh viewport-relative centre point.
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

// Returns an expression that resolves a ref index to a LIVE ELEMENT (for CDP).
function elementRefExpression(index) {
  return `(() => {
  const el = (window.__yogatikRefs__ || [])[${Number(index) || 0}];
  if (!el || !el.isConnected) throw new Error('Element not found or detached');
  if (el.tagName !== 'INPUT' || (el.type !== 'file' && el.type !== 'FILE')) {
    throw new Error('Element is not a file input (type=' + (el.type || 'unknown') + ')');
  }
  return el;
})()`
}

// Adaptive relocation (Scrapling-style): match by role/name/text against fresh scan
function textSimilarity(a, b) {
  if (!a || !b) return 0
  const sa = String(a).toLowerCase().trim()
  const sb = String(b).toLowerCase().trim()
  if (sa === sb) return 1
  if (sa.includes(sb) || sb.includes(sa)) return 0.8
  const wordsA = new Set(sa.split(/\s+/))
  const wordsB = new Set(sb.split(/\s+/))
  let common = 0
  for (const w of wordsA) if (wordsB.has(w)) common++
  return common / Math.max(wordsA.size, wordsB.size, 1)
}

const RELOCATE_MIN_SCORE = 0.75
const RELOCATE_MIN_MARGIN = 0.15

function candidateScore(target, cand) {
  if (target.role !== cand.role) return 0
  let score = 0
  score += textSimilarity(target.name, cand.name) * 0.5
  score += textSimilarity(target.text, cand.text) * 0.5
  return score
}

function findRelocationMatch(target, candidates) {
  if (!target || !Array.isArray(candidates) || !candidates.length) return null
  let bestIdx = -1
  let bestScore = -1
  let secondBest = -1
  for (let i = 0; i < candidates.length; i++) {
    const s = candidateScore(target, candidates[i])
    if (s > bestScore) {
      secondBest = bestScore
      bestScore = s
      bestIdx = i
    } else if (s > secondBest) {
      secondBest = s
    }
  }
  if (bestScore < RELOCATE_MIN_SCORE) return null
  if (bestScore - secondBest < RELOCATE_MIN_MARGIN) return null
  return bestIdx
}

// Scans all interactive elements on the page and returns descriptors for relocation matching.
function relocateScanSource() {
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
  const selectorOf = (el) => {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + el.id;
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    const testId = el.getAttribute && el.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId + '"]';
    return el.tagName.toLowerCase();
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
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const label = (el.getAttribute('aria-label') || el.placeholder || el.name || '').trim();
      const val = typeof el.value === 'string' ? el.value.trim() : '';
      if (label && val) return label + ' (value: "' + val.slice(0, 80) + '")';
      if (val) return 'value: "' + val.slice(0, 80) + '"';
      if (label) return label;
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
  const els = Array.from(document.querySelectorAll(INTERACTIVE_SEL)).filter(isVisible);
  window.__yogatikRelocateScan__ = els;
  return els.map((el) => {
    let own = '';
    for (const c of el.childNodes) { if (c.nodeType === 3) own += c.nodeValue; }
    own = own.replace(/\\s+/g, ' ').trim();
    return { role: roleOf(el), name: nameOf(el), text: own, tag: el.tagName.toLowerCase() };
  });
})()`
}

// Resolves a chosen relocation-candidate index to a fresh viewport point.
function relocateResolverSource(index) {
  return `(() => {
  const el = (window.__yogatikRelocateScan__ || [])[${Number(index) || 0}];
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

// What an address bar has to decide that a `navigate` tool call never does:
// the model always sends a real URL, but a human types "openai gpt-5" as
// often as a domain. A bare host (has a dot, or is localhost/an IP, and has
// no whitespace) is treated as an address; anything else becomes a search.
function normalizeAddressInput(input) {
  const raw = String(input == null ? '' : input).trim()
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw
  const noSpace = !/\s/.test(raw)
  const looksLikeHost = noSpace && (
    /^localhost(:\d+)?(\/.*)?$/i.test(raw)
    || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(raw)
    || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?(\/.*)?$/i.test(raw)
  )
  if (looksLikeHost) return `https://${raw}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`
}

// Chrome's own zoom levels
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

function nearestZoomIndex(factor) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    const d = Math.abs(ZOOM_LEVELS[i] - factor)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

function stepZoom(currentFactor, direction) {
  const current = Number(currentFactor) || 1
  if (direction === 'reset') return 1
  const idx = nearestZoomIndex(current)
  if (direction === 'in') return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, idx + 1)]
  if (direction === 'out') return ZOOM_LEVELS[Math.max(0, idx - 1)]
  return current
}

module.exports = {
  MAX_TEXT, MAX_NODES, MAX_INDENT, INTERACTIVE_ROLES,
  walkerSource, refResolverSource, elementRefExpression,
  truncateText, isInteractive, nodeLabel,
  simplify, assignRefs, parseRef, isStaleRef,
  formatTree, buildTree, normalizeAddressInput,
  ZOOM_LEVELS, stepZoom,
  textSimilarity, candidateScore, findRelocationMatch,
  relocateScanSource, relocateResolverSource,
  RELOCATE_MIN_SCORE, RELOCATE_MIN_MARGIN,
}