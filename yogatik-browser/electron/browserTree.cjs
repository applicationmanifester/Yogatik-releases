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
  // `nodes` carries every kept node (not just the printed slice — refs are
  // assigned before truncation, so a kept-but-unprinted ref still needs a
  // descriptor). This is what makes adaptive relocation possible: the caller
  // can remember what a ref's element LOOKED LIKE (role/name/text) and later
  // recognise it again even after the exact DOM node is gone.
  return { text, truncated, interactiveCount, nodeCount: withRefs.length, nodes: withRefs }
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

// ── Adaptive relocation (Scrapling-style similarity matching) ──────────────
//
// A ref can go dead two ways: the epoch moved on (a fresh `read`), or the
// exact DOM node the walker saw got swapped for an equivalent one by the
// page's own re-render — an SPA replacing a row's button with a new element
// that looks and behaves identically is not "the page changed", it is normal
// framework behaviour, and refusing every time makes the tool feel broken on
// exactly the pages it most needs to work on. Scrapling's answer to a broken
// locator is to relocate the same logical element by structural similarity
// rather than only failing; this ports that idea onto this ref system.
//
// The trade a wrong relocation makes is worse than the refusal it replaces —
// acting on a look-alike element (the "Delete" button on the row above, say)
// looks EXACTLY like success. So matching here is deliberately conservative:
// no name/text signal at all refuses outright (role+tag alone is "any
// button", which is not an identity), and a low or ambiguous score (a
// runner-up too close to the winner) refuses too. This only fires on a
// confident, unambiguous match — see findRelocationMatch.

function normalizeForMatch(s) {
  return (typeof s === 'string' ? s : '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Token-set (Jaccard) similarity: forgiving of word order and minor
// punctuation drift, unlike a strict substring or edit-distance check —
// "Add to cart (2)" and "Add to cart (3)" should still read as the same
// button. Two elements that both carry no text are NOT a match here (the
// caller for that case never scores this at all — see findRelocationMatch's
// name/text guard); the only exact-equal-empty case that reaches this
// function is empty-empty, in which it correctly plays no role.
function textSimilarity(a, b) {
  const na = normalizeForMatch(a)
  const nb = normalizeForMatch(b)
  if (na === nb) return na ? 1 : 0
  if (!na || !nb) return 0
  const ta = new Set(na.split(' ').filter(Boolean))
  const tb = new Set(nb.split(' ').filter(Boolean))
  let inter = 0
  for (const tok of ta) if (tb.has(tok)) inter++
  const union = ta.size + tb.size - inter
  return union > 0 ? inter / union : 0
}

const RELOCATE_WEIGHTS = { role: 0.25, identity: 0.60, tag: 0.15 }

function candidateScore(target, candidate) {
  if (!target || !candidate) return 0
  const roleScore = target.role && candidate.role ? (target.role === candidate.role ? 1 : 0) : 0
  const nameScore = textSimilarity(target.name, candidate.name)
  const textScore = textSimilarity(target.text, candidate.text)
  // Most elements carry ONLY a name (aria-label/placeholder) or ONLY visible
  // text, not both — averaging the two in would halve the score of the
  // common case for no reason. `identity` takes whichever signal is present
  // and matches, so a text-only "Delete" button scores exactly as well on
  // that axis as a name-only one does.
  const identityScore = Math.max(nameScore, textScore)
  // An unknown tag on either side is neutral (0.5) rather than a penalty — it
  // must not sink an otherwise strong role+identity match just because one
  // side of the comparison did not carry a tag.
  const tagScore = target.tag && candidate.tag ? (target.tag === candidate.tag ? 1 : 0) : 0.5
  return roleScore * RELOCATE_WEIGHTS.role
    + identityScore * RELOCATE_WEIGHTS.identity
    + tagScore * RELOCATE_WEIGHTS.tag
}

const RELOCATE_MIN_SCORE = 0.72
const RELOCATE_MIN_MARGIN = 0.15

// Returns the index into `candidates` of the confident, unambiguous best
// match, or null. Never guesses: an element with neither a name nor text has
// nothing to relocate BY (role+tag alone matches "any button"); a top score
// below the floor, or one a runner-up nearly ties, both refuse rather than
// pick a coin-flip winner.
function findRelocationMatch(target, candidates) {
  if (!target || !Array.isArray(candidates) || !candidates.length) return null
  if (!normalizeForMatch(target.name) && !normalizeForMatch(target.text)) return null

  let bestIdx = -1
  let bestScore = -Infinity
  let secondScore = -Infinity
  candidates.forEach((c, i) => {
    const score = candidateScore(target, c)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestIdx = i
    } else if (score > secondScore) {
      secondScore = score
    }
  })
  if (bestIdx < 0) return null
  if (bestScore < RELOCATE_MIN_SCORE) return null
  if (secondScore > -Infinity && (bestScore - secondScore) < RELOCATE_MIN_MARGIN) return null
  return bestIdx
}

// A dedicated, READ-ONLY scan of the page's current interactive elements for
// relocation candidates. Deliberately does NOT touch window.__yogatikRefs__ —
// that array is the live mapping every OTHER outstanding ref from this epoch
// still resolves through, and rebuilding it as a side effect of relocating
// ONE stale ref would silently shift what an untouched ref_N now points at.
// Candidates live in their own scratch array instead, only ever read by
// relocateResolverSource right after this runs.
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
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'search') return 'searchbox';
      if (t === 'hidden') return 'hidden';
      return 'textbox';
    }
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
  const els = Array.from(document.querySelectorAll(INTERACTIVE_SEL)).filter(isVisible).slice(0, 800);
  window.__yogatikRelocateScan__ = els;
  return els.map((el) => {
    let own = '';
    for (const c of el.childNodes) { if (c.nodeType === 3) own += c.nodeValue; }
    own = own.replace(/\\s+/g, ' ').trim();
    return { role: roleOf(el), name: nameOf(el), text: own, tag: el.tagName.toLowerCase() };
  });
})()`
}

// Resolves a chosen relocation-candidate index to a fresh viewport point, the
// same shape refResolverSource returns — the caller cannot tell, and does not
// need to tell, a relocated point from a directly-resolved one except by the
// `relocated` flag it adds itself.
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
// no whitespace) is treated as an address; anything else becomes a search —
// DuckDuckGo, matching the app's existing keyless/no-tracking default engine
// for web_search rather than introducing a second search provider.
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

// Chrome's own zoom levels, not a raw +/-10%: 100%→110% reads as a step,
// 100%→108% (10% of 0.8 rounding differently each press) does not, and a
// free-running multiply/divide never lands back on exactly 1.0 after a few
// presses (float drift), so "reset" would stop meaning reset.
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

// Pure so the stepping table is unit-testable without a real webContents.
// `direction`: 'in' | 'out' | 'reset'.
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
