import { describe, it, expect } from 'vitest'
import {
  nodeLabel, isInteractive, truncateText,
  simplify, assignRefs, parseRef, isStaleRef,
  formatTree, buildTree,
  walkerSource, refResolverSource, elementRefExpression,
  normalizeAddressInput, stepZoom, ZOOM_LEVELS,
} from '../../electron/browserTree.cjs'

describe('browserTree — node classification', () => {
  it('prefers the accessible name over text', () => {
    expect(nodeLabel({ role: 'button', name: 'Submit form', text: 'Go' })).toBe('Submit form')
  })

  it('falls back to text when there is no name', () => {
    expect(nodeLabel({ role: 'link', name: '', text: 'Read more' })).toBe('Read more')
  })

  it('falls back to the role when there is neither', () => {
    expect(nodeLabel({ role: 'img', name: '', text: '' })).toBe('img')
  })

  it('treats known interactive roles as interactive', () => {
    expect(isInteractive({ role: 'button' })).toBe(true)
    expect(isInteractive({ role: 'link' })).toBe(true)
    expect(isInteractive({ role: 'textbox' })).toBe(true)
    expect(isInteractive({ role: 'generic' })).toBe(false)
  })

  it('honours an explicit interactive flag from the page', () => {
    expect(isInteractive({ role: 'generic', interactive: true })).toBe(true)
  })

  it('truncates long text and marks it', () => {
    expect(truncateText('x'.repeat(200), 10)).toBe('xxxxxxxxxx…')
    expect(truncateText('short', 10)).toBe('short')
  })
})

describe('browserTree — simplification', () => {
  it('drops non-interactive nodes that carry no label', () => {
    const raw = [
      { depth: 0, role: 'generic', name: '', text: '' },
      { depth: 1, role: 'heading', name: 'Title', text: 'Title' },
      { depth: 1, role: 'button', name: 'OK', text: 'OK' },
    ]
    const out = simplify(raw)
    expect(out).toHaveLength(2)
    expect(out.map(n => n.role)).toEqual(['heading', 'button'])
  })

  it('keeps an interactive node even with no label', () => {
    const raw = [{ depth: 0, role: 'button', name: '', text: '' }]
    expect(simplify(raw)).toHaveLength(1)
  })

  it('keeps invisible nodes out of the tree', () => {
    const raw = [
      { depth: 0, role: 'button', name: 'Hidden', visible: false },
      { depth: 0, role: 'button', name: 'Shown', visible: true },
    ]
    expect(simplify(raw).map(n => n.name)).toEqual(['Shown'])
  })
})

describe('browserTree — refs', () => {
  it('numbers only interactive nodes, in document order', () => {
    const nodes = [
      { role: 'heading', name: 'T' },
      { role: 'button', name: 'A' },
      { role: 'link', name: 'B' },
    ]
    const out = assignRefs(nodes, 3)
    expect(out[0].ref).toBeUndefined()
    expect(out[1].ref).toBe('ref_3_0')
    expect(out[2].ref).toBe('ref_3_1')
  })

  it('is stable within an epoch and changes across epochs', () => {
    const mk = () => [{ role: 'button', name: 'A' }]
    expect(assignRefs(mk(), 1)[0].ref).toBe(assignRefs(mk(), 1)[0].ref)
    expect(assignRefs(mk(), 2)[0].ref).not.toBe(assignRefs(mk(), 1)[0].ref)
  })

  it('parses a ref into epoch and index', () => {
    expect(parseRef('ref_7_12')).toEqual({ epoch: 7, index: 12 })
  })

  it('rejects malformed refs rather than guessing', () => {
    expect(parseRef('ref_x')).toBeNull()
    expect(parseRef('12')).toBeNull()
    expect(parseRef('')).toBeNull()
    expect(parseRef(null)).toBeNull()
  })

  it('flags refs from a superseded epoch as stale', () => {
    expect(isStaleRef('ref_1_0', 2)).toBe(true)
    expect(isStaleRef('ref_2_0', 2)).toBe(false)
    expect(isStaleRef('garbage', 2)).toBe(true)
  })
})

describe('browserTree — formatting', () => {
  it('indents by depth and shows refs', () => {
    const nodes = [
      { depth: 0, role: 'heading', name: 'Login' },
      { depth: 1, role: 'textbox', name: 'Email', ref: 'ref_1_0' },
      { depth: 1, role: 'button', name: 'Go', ref: 'ref_1_1' },
    ]
    expect(formatTree(nodes).split('\n')).toEqual([
      'heading "Login"',
      '  textbox "Email" [ref_1_0]',
      '  button "Go" [ref_1_1]',
    ])
  })

  it('caps indentation so a deep page stays readable', () => {
    const out = formatTree([{ depth: 40, role: 'button', name: 'X', ref: 'ref_1_0' }])
    expect(out.startsWith(' '.repeat(20))).toBe(true)
    expect(out.startsWith(' '.repeat(22))).toBe(false)
  })
})

describe('browserTree — buildTree', () => {
  const raw = (n) => Array.from({ length: n }, (_, i) => ({
    depth: 0, role: 'button', name: `B${i}`, visible: true,
  }))

  it('builds a tree with refs and reports the interactive count', () => {
    const out = buildTree(raw(3), { epoch: 5 })
    expect(out.truncated).toBe(false)
    expect(out.interactiveCount).toBe(3)
    expect(out.text).toContain('[ref_5_0]')
    expect(out.text).toContain('[ref_5_2]')
  })

  it('truncates past the node budget and says so', () => {
    const out = buildTree(raw(20), { epoch: 1, maxNodes: 5 })
    expect(out.truncated).toBe(true)
    expect(out.text).toContain('B0')
    expect(out.text).not.toContain('B19')
    expect(out.text).toMatch(/truncated/i)
  })

  it('numbers refs before truncating so kept refs stay resolvable', () => {
    const out = buildTree(raw(20), { epoch: 1, maxNodes: 3 })
    expect(out.text).toContain('[ref_1_0]')
    expect(out.interactiveCount).toBe(20)
  })

  it('survives an empty page', () => {
    const out = buildTree([], { epoch: 1 })
    expect(out.interactiveCount).toBe(0)
    expect(out.truncated).toBe(false)
    expect(typeof out.text).toBe('string')
  })
})

describe('browserTree — injected sources', () => {
  it('walker is a self-contained expression that sets the epoch', () => {
    const src = walkerSource(7)
    expect(typeof src).toBe('string')
    expect(src).toContain('__yogatikRefs__')
    expect(src).toContain('7')
  })

  it('walker source is a single evaluatable expression', () => {
    // executeJavaScript evaluates an expression; a bare statement list would
    // return undefined and the read would silently come back empty.
    expect(walkerSource(1).trim().startsWith('(')).toBe(true)
  })

  it('resolver references the ref registry by index', () => {
    const src = refResolverSource(4)
    expect(src).toContain('__yogatikRefs__')
    expect(src).toContain('[4]')
  })

  it('resolver is a single evaluatable expression', () => {
    expect(refResolverSource(0).trim().startsWith('(')).toBe(true)
  })

  it('coerces a non-numeric index rather than interpolating it', () => {
    // The index reaches this from a parsed ref, but a stray string must never
    // land inside the evaluated source.
    expect(refResolverSource('1); alert(1); //')).toContain('[0]')
  })

  it('elementRefExpression resolves the LIVE ELEMENT, not a point', () => {
    // Unlike refResolverSource — this is for CDP Runtime.evaluate, which can
    // return a remote objectId that executeJavaScript's JSON round-trip
    // cannot carry.
    const src = elementRefExpression(2)
    expect(src).toContain('__yogatikRefs__')
    expect(src).toContain('[2]')
    expect(src.trim().startsWith('(')).toBe(true)
  })

  it('elementRefExpression validates a file input before handing the element back', () => {
    const src = elementRefExpression(0)
    expect(src).toMatch(/tagName === 'INPUT' && el\.type === 'file'/)
    expect(src).toMatch(/throw new Error/)
  })

  it('elementRefExpression coerces its index rather than interpolating it', () => {
    expect(elementRefExpression('1); alert(1); //')).toContain('[0]')
  })
})

describe('browserTree — normalizeAddressInput (address bar)', () => {
  it('passes a full URL through unchanged', () => {
    expect(normalizeAddressInput('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    expect(normalizeAddressInput('http://example.com')).toBe('http://example.com')
  })

  it('adds https:// to a bare domain', () => {
    expect(normalizeAddressInput('example.com')).toBe('https://example.com')
    expect(normalizeAddressInput('docs.example.com/guide')).toBe('https://docs.example.com/guide')
  })

  it('adds https:// to localhost and raw IPs, dev-server ports included', () => {
    expect(normalizeAddressInput('localhost:5173')).toBe('https://localhost:5173')
    expect(normalizeAddressInput('127.0.0.1:8080/app')).toBe('https://127.0.0.1:8080/app')
  })

  it('treats anything with whitespace, or no dot, as a search query', () => {
    expect(normalizeAddressInput('openai gpt-5')).toBe('https://duckduckgo.com/?q=openai%20gpt-5')
    expect(normalizeAddressInput('weather')).toBe('https://duckduckgo.com/?q=weather')
  })

  it('is total: empty/whitespace input never throws or half-builds a URL', () => {
    expect(normalizeAddressInput('')).toBe('')
    expect(normalizeAddressInput('   ')).toBe('')
    expect(normalizeAddressInput(null)).toBe('')
    expect(normalizeAddressInput(undefined)).toBe('')
  })

  it('leaves an already-schemed non-http URL (e.g. a custom protocol) alone', () => {
    expect(normalizeAddressInput('file:///tmp/x.html')).toBe('file:///tmp/x.html')
  })
})

describe('browserTree — stepZoom (zoom controls)', () => {
  it('steps to the next level up or down the table, not a raw percentage', () => {
    expect(stepZoom(1, 'in')).toBe(1.1)
    expect(stepZoom(1, 'out')).toBe(0.9)
  })

  it('clamps at the ends of the table instead of going out of range', () => {
    expect(stepZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], 'in')).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1])
    expect(stepZoom(ZOOM_LEVELS[0], 'out')).toBe(ZOOM_LEVELS[0])
  })

  it('reset always returns exactly 1, regardless of current zoom', () => {
    expect(stepZoom(2.5, 'reset')).toBe(1)
    expect(stepZoom(0.33, 'reset')).toBe(1)
  })

  it('snaps an off-table factor to its nearest level before stepping', () => {
    // 1.05 is equidistant from 1 and 1.1 — ties resolve to the lower/earlier
    // level (never skip a level on a tie), so "in" lands on 1.1, not 1.25.
    expect(stepZoom(1.05, 'in')).toBe(1.1)
    // Unambiguous case: 1.02 is nearer 1 than 1.1, so "in" is just one real step.
    expect(stepZoom(1.02, 'in')).toBe(1.1)
  })

  it('repeated resets never drift off exactly 1.0 (float-safety)', () => {
    let z = 1
    for (let i = 0; i < 5; i++) z = stepZoom(z, 'in')
    z = stepZoom(z, 'reset')
    expect(z).toBe(1)
  })
})
