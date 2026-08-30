// One-off verification: the <select> page script that electron/browserControl.cjs
// injects is built as a template literal, so a mistake in it is invisible to
// `node --check` (the template is a valid string either way) and only shows up
// as an opaque page error at runtime. This renders it exactly as selectOption
// does and parses + runs the result against a fake DOM.
//
// Run: node scripts/check-select-script.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(HERE, '..', 'electron', 'browserControl.cjs'), 'utf8')

const fnStart = src.indexOf('async function selectOption')
if (fnStart < 0) { console.error('selectOption not found'); process.exit(1) }
const marker = 'executeJavaScript(`'
const start = src.indexOf(marker, fnStart) + marker.length
// Scanning forward for the next backtick does NOT work: the cssSelector
// interpolation contains nested template literals, whose backticks end the scan
// early and yield a truncated script that fails to parse for the wrong reason.
// The template ends with the IIFE's closing `})()`.
const end = src.indexOf('})()`', start)
if (end < 0) { console.error('could not find end of injected template'); process.exit(1) }
const tpl = src.slice(start, end + '})()'.length)

const REF = 'ref_3_7'
// The cssSelector interpolation contains nested template literals with their
// own braces, so it is replaced by LINE rather than by a non-greedy match —
// which stops at the first inner `}` and leaves the placeholder half-eaten.
const rendered = tpl
  .replace(/\$\{JSON\.stringify\(String\(value\)\)\}/, JSON.stringify('United Kingdom'))
  .split('\n')
  .map(line => (line.includes('${cssSelector')
    ? `      const el = (window.__yogatikRefs__ && window.__yogatikRefs__[${JSON.stringify(REF)}]) || null`
    : line))
  .join('\n')

// The template is read as SOURCE, so its escapes are still doubled. JS collapses
// them when it evaluates the literal, and this is where that matters: `/^\\d+$/`
// in the source is `/^\d+$/` in the page but "backslash then d" if compiled raw.
// Unescape so the parse and the behaviour below are the real ones.
const emitted = rendered.replace(/\\\\/g, '\\').replace(/\\`/g, '`')

const leftover = rendered.match(/\$\{[^}]*\}/g)
if (leftover) { console.error('unsubstituted placeholders:', leftover); process.exit(1) }

let compiled
try {
  compiled = new Function('window', 'document', 'Event', `return ${emitted}`)
} catch (e) {
  console.error('PARSE FAIL:', e.message)
  console.error(emitted)
  process.exit(1)
}
console.log('ok   real injected script parses')

const options = [
  { value: 'us', label: 'United States', text: 'United States' },
  { value: 'uk', label: 'United Kingdom', text: 'United Kingdom' },
]
const el = { tagName: 'SELECT', options, selectedIndex: 0, fired: [], dispatchEvent(e) { this.fired.push(e.type); return true } }
const EventStub = function (t) { this.type = t }
const out = compiled({ __yogatikRefs__: { [REF]: el } }, { querySelector: () => null }, EventStub)

let bad = 0
const A = (n, c) => { if (!c) { bad++; console.log('FAIL ' + n) } else console.log('ok   ' + n) }
A('selects the matching option', out?.ok === true && out.selected.value === 'uk')
A('sets selectedIndex', el.selectedIndex === 1)
A('fires input then change so React/Vue see it', el.fired.join(',') === 'input,change')
// The index fallback lives behind /^\d+$/ inside a template literal — exactly
// the kind of escape that silently emits the wrong regex. Assert on what the
// PAGE receives, and then prove the branch actually works.
A('index fallback regex survives templating', emitted.includes('/^\\d+$/'))

const byIndex = { tagName: 'SELECT', options, selectedIndex: 0, fired: [], dispatchEvent(e) { this.fired.push(e.type); return true } }
const idxScript = emitted.replace(JSON.stringify('United Kingdom'), JSON.stringify('1'))
const rIdx = new Function('window', 'document', 'Event', `return ${idxScript}`)(
  { __yogatikRefs__: { [REF]: byIndex } }, { querySelector: () => null }, EventStub,
)
A('matches by index', rIdx?.ok === true && rIdx.selected.index === 1)

const notSelect = { tagName: 'INPUT', options: [], selectedIndex: 0, dispatchEvent() {} }
const rBad = compiled({ __yogatikRefs__: { [REF]: notSelect } }, { querySelector: () => null }, EventStub)
A('refuses a non-select and names the alternative', rBad?.ok === false && /Not a <select>/.test(rBad.error))

const noMatch = { tagName: 'SELECT', options, selectedIndex: 0, dispatchEvent() {} }
const rNone = new Function('window', 'document', 'Event', `return ${emitted.replace(JSON.stringify('United Kingdom'), JSON.stringify('Narnia'))}`)(
  { __yogatikRefs__: { [REF]: noMatch } }, { querySelector: () => null }, EventStub,
)
// Listing the real options is what lets the model recover in one turn instead
// of guessing at the value again.
A('no match reports the options that exist', rNone?.ok === false && rNone.options.length === 2)

console.log(bad ? `\n${bad} FAILED` : '\nALL PASS (injected select script)')
process.exit(bad ? 1 : 0)
