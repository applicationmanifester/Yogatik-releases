// @vitest-environment node
//
// Node, not jsdom: esbuild refuses to start when TextEncoder does not produce a
// real Uint8Array, which is exactly what jsdom's globals do to it.
/**
 * Guards for mistakes that only surface at BUILD time.
 *
 * vitest transforms each test's own import graph, so a file can be broken for
 * `vite build` and every test still passes. That is exactly what happened: a
 * hook holding JSX was saved as `.js` and imported from main.jsx, which made
 * `npm run build` (and `npm run dev`) fail outright while the suite stayed green.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname does not exist in an ES module (and the browser-env lint rules do
// not define it either).
const SRC = path.dirname(fileURLToPath(import.meta.url))

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('reachability', () => {
  it('every component is imported by something', () => {
    // Five finished panels — the terminal, the scheduler, the sub-agent runner,
    // the auto-skills reviewer and the file editor — sat in the tree with no
    // import anywhere, so no user could open them. Their TOOLS were registered,
    // so the model could use each capability while the UI half stayed dark;
    // nothing failed, and no test noticed.
    const files = walk(SRC).filter(f => !f.includes('.test.'))
    const components = files.filter(f => f.includes(`${path.sep}components${path.sep}`) && f.endsWith('.jsx'))
    const corpus = files
      .filter(f => !components.includes(f))
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n')
    const componentCorpus = components.map(f => ({ f, src: fs.readFileSync(f, 'utf8') }))

    // A bare substring is NOT evidence of an import. It let two finished
    // components through: StreamingMessage was "reached" by a code COMMENT
    // naming it, and Tour by the prose "Interactive Tour" in a button label.
    // Only an import of the module counts.
    const importsModule = (src, name) => {
      const spec = String.raw`['"][^'"]*\/${name}(?:\.jsx)?['"]`
      return new RegExp(String.raw`(?:from\s+${spec})|(?:import\s*\(\s*${spec}\s*\))|(?:require\(\s*${spec}\s*\))`).test(src)
    }

    const orphans = components.filter((file) => {
      const name = path.basename(file, '.jsx')
      if (importsModule(corpus, name)) return false
      // A component may be reached only through another component.
      return !componentCorpus.some(({ f, src }) => f !== file && importsModule(src, name))
    }).map(f => path.relative(SRC, f))

    // AdModal is deliberately not rendered: the AdSense interstitial is switched
    // off pending a decision about ads in the desktop build. Anything else in
    // this list is a feature the user cannot reach.
    const allowed = new Set([path.join('components', 'AdModal.jsx')])
    expect(orphans.filter(f => !allowed.has(f))).toEqual([])
  })

  it('App does not hold in-flight streaming text in React state', () => {
    // This regressed once: App kept `streamingMap` and setState'd it on every
    // token, so each frame re-rendered the sidebar, the composer and all 40
    // MessageBubbles (each re-running ReactMarkdown) for text that only ever
    // appears in one div. The text belongs in a ref pushed into
    // <StreamingMessage/>; App state may hold only the has-text boolean.
    const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')
    expect(app).toMatch(/from\s+['"]\.\/components\/StreamingMessage['"]/)
    expect(app).not.toMatch(/setStreamingMap/)
  })
})

describe('build guards', () => {
  it('every .js file parses as plain JS — JSX in a .js file breaks the build', async () => {
    // Parse with the same tool the build uses instead of pattern-matching for
    // "<": HTML inside template literals looks like JSX to a regex and does not
    // bother esbuild at all.
    const esbuild = await import('esbuild')
    const offenders = []
    for (const file of walk(SRC)) {
      if (!file.endsWith('.js')) continue
      const code = fs.readFileSync(file, 'utf8')
      try {
        esbuild.transformSync(code, { loader: 'js', format: 'esm' })
      } catch (e) {
        offenders.push(`${path.relative(SRC, file)}: ${String(e.message).split('\n')[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
