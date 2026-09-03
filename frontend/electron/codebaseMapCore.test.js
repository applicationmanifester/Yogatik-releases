// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  extractJsTsSymbols, extractPythonSymbols, extractGoSymbols, extractRustSymbols,
  extractSymbols, namesFromExportList, formatMap, buildCodebaseMap, isSourceFile,
} from './codebaseMapCore.cjs'

describe('extractJsTsSymbols', () => {
  it('finds named exported functions and consts, not local/unexported ones', () => {
    const src = `
function localHelper() {}
export function runAgent(x) {}
export async function streamChat() {}
export const PROVIDERS = {}
const notExported = 1
export class ToolRegistry {}
`
    const names = extractJsTsSymbols(src)
    expect(names).toEqual(expect.arrayContaining(['runAgent', 'streamChat', 'PROVIDERS', 'ToolRegistry']))
    expect(names).not.toContain('localHelper')
    expect(names).not.toContain('notExported')
  })

  it('ignores an export-shaped line that is indented (not actually top-level)', () => {
    // e.g. inside a function body building a string that merely LOOKS like an
    // export statement — this is exactly the "match column 0, not the whole
    // line" discipline the git-porcelain and gitignore-glob parsers already use.
    const src = `
function build() {
  export const fake = 1 // never valid JS, but proves the anchor holds anyway
}
export const real = 2
`
    const names = extractJsTsSymbols(src)
    expect(names).not.toContain('fake')
    expect(names).toContain('real')
  })

  it('names a default export by its function name, and "default" when anonymous', () => {
    expect(extractJsTsSymbols('export default function AgentPool() {}')).toContain('AgentPool')
    expect(extractJsTsSymbols('export default function() {}')).toContain('default')
    expect(extractJsTsSymbols('const Widget = () => null\nexport default Widget')).toContain('Widget')
  })

  it('resolves `export { a, b as c }` to the ALIAS — the name a consumer actually imports', () => {
    const names = extractJsTsSymbols('const foo = 1\nconst bar = 2\nexport { foo, bar as publicBar }')
    expect(names).toContain('foo')
    expect(names).toContain('publicBar')
    expect(names).not.toContain('bar')
  })

  it('reads CommonJS module.exports forms', () => {
    expect(extractJsTsSymbols('module.exports.registerFsBridge = function() {}')).toContain('registerFsBridge')
    expect(extractJsTsSymbols('exports.invalidate = invalidate')).toContain('invalidate')
    expect(extractJsTsSymbols('module.exports = {\n  scanRoot,\n  listDir: listDirImpl,\n  getIndex,\n}'))
      .toEqual(expect.arrayContaining(['scanRoot', 'listDir', 'getIndex']))
  })
})

describe('namesFromExportList', () => {
  it('strips the local binding from an `as` alias', () => {
    expect(namesFromExportList('a, b as c, d')).toEqual(['a', 'c', 'd'])
  })
  it('drops anything that is not a plain identifier (defensive, not a full parser)', () => {
    expect(namesFromExportList('a, "not an identifier", b')).toEqual(['a', 'b'])
  })
})

describe('extractPythonSymbols / extractGoSymbols / extractRustSymbols', () => {
  it('Python: only module-level def/class, not a method inside one', () => {
    const src = 'def top_level():\n    pass\n\nclass Foo:\n    def method(self):\n        pass\n'
    const names = extractPythonSymbols(src)
    expect(names).toEqual(expect.arrayContaining(['top_level', 'Foo']))
    expect(names).not.toContain('method')
  })

  it('Go: capitalised (exported) identifiers only, methods included via receiver', () => {
    const src = 'func Public() {}\nfunc private() {}\nfunc (s *Server) Handle() {}\ntype Config struct{}\n'
    const names = extractGoSymbols(src)
    expect(names).toEqual(expect.arrayContaining(['Public', 'Handle', 'Config']))
    expect(names).not.toContain('private')
  })

  it('Rust: only `pub` items', () => {
    const src = 'pub fn run() {}\nfn hidden() {}\npub struct Options {}\npub enum Mode {}\n'
    const names = extractRustSymbols(src)
    expect(names).toEqual(expect.arrayContaining(['run', 'Options', 'Mode']))
    expect(names).not.toContain('hidden')
  })
})

describe('extractSymbols dispatch + isSourceFile', () => {
  it('routes by extension and returns [] (not a crash) for an unrecognised one', () => {
    expect(extractSymbols('a.ts', 'export const x = 1')).toContain('x')
    expect(extractSymbols('a.py', 'def f():\n  pass')).toContain('f')
    expect(extractSymbols('a.rb', 'def f\nend')).toEqual([]) // listed, not parsed — see the module comment
  })
  it('never throws on empty/undefined content', () => {
    expect(extractSymbols('a.js', '')).toEqual([])
    expect(extractSymbols('a.js', undefined)).toEqual([])
  })
  it('isSourceFile matches the language set this module actually understands or lists', () => {
    expect(isSourceFile('src/agent.js')).toBe(true)
    expect(isSourceFile('image.png')).toBe(false)
    expect(isSourceFile('README')).toBe(false)
  })
})

describe('formatMap', () => {
  it('lists a file with its symbols, and bare-paths a file with none', () => {
    const { text } = formatMap([
      { path: 'src/a.js', symbols: ['foo', 'bar'] },
      { path: 'src/b.js', symbols: [] },
    ])
    expect(text).toContain('src/a.js: foo, bar')
    expect(text).toContain('src/b.js')
    expect(text).not.toMatch(/src\/b\.js:/)
  })

  it('sorts by path so the map reads as a real directory listing, not scan order', () => {
    const { text } = formatMap([
      { path: 'z.js', symbols: [] },
      { path: 'a.js', symbols: [] },
    ])
    expect(text.indexOf('a.js')).toBeLessThan(text.indexOf('z.js'))
  })

  it('truncates at the char budget and SAYS what it dropped, never silently', () => {
    const files = Array.from({ length: 50 }, (_, i) => ({ path: `file${i}.js`, symbols: ['aVeryLongSymbolNameToEatBudget'] }))
    const { text, shownCount, omittedCount } = formatMap(files, { maxChars: 500 })
    expect(shownCount).toBeGreaterThan(0)
    expect(shownCount).toBeLessThan(50)
    expect(omittedCount).toBe(50 - shownCount)
    expect(text).toMatch(/more files? not shown/)
  })

  it('adds no truncation note when everything fit', () => {
    const { text, omittedCount } = formatMap([{ path: 'a.js', symbols: [] }], { maxChars: 80_000 })
    expect(omittedCount).toBe(0)
    expect(text).not.toMatch(/more files? not shown/)
  })
})

describe('buildCodebaseMap (injected I/O — no real disk)', () => {
  function fakeFs(files) {
    // files: { 'rel/path.js': 'content' }
    return {
      listFiles: async () => Object.keys(files),
      readFile: async (p) => {
        if (!(p in files)) throw new Error('ENOENT')
        return files[p]
      },
    }
  }

  it('builds a map end to end from fake files', async () => {
    const io = fakeFs({
      'src/agent.js': 'export function runAgent() {}',
      'src/llm.js': 'export const PROVIDERS = {}',
      'README.md': '# not a source file, filtered before reading',
    })
    const result = await buildCodebaseMap(io)
    expect(result.text).toContain('src/agent.js: runAgent')
    expect(result.text).toContain('src/llm.js: PROVIDERS')
    expect(result.text).not.toContain('README.md')
    expect(result.totalSourceFiles).toBe(2)
    expect(result.partial).toBe(false)
  })

  it('caps at maxFiles and reports how many were left out, without reading them', async () => {
    const files = {}
    for (let i = 0; i < 10; i++) files[`f${i}.js`] = `export const v${i} = ${i}`
    let reads = 0
    const result = await buildCodebaseMap({
      listFiles: async () => Object.keys(files),
      readFile: async (p) => { reads++; return files[p] },
      maxFiles: 3,
    })
    expect(reads).toBe(3)
    expect(result.mappedFiles).toBe(3)
    expect(result.omittedByFileCap).toBe(7)
    expect(result.partial).toBe(true)
  })

  it('a failed read for one file costs only that file, never the whole map', async () => {
    const result = await buildCodebaseMap({
      listFiles: async () => ['ok.js', 'broken.js'],
      readFile: async (p) => { if (p === 'broken.js') throw new Error('EACCES'); return 'export const ok = 1' },
    })
    expect(result.readErrors).toBe(1)
    expect(result.text).toContain('ok.js: ok')
    expect(result.text).toContain('broken.js') // still LISTED, just with no symbols
  })
})
